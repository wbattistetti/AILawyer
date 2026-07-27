/**
 * Normalizes extraction tokens and maps text matches back to page geometry.
 */

import type { BoxPct, OccOut, Token } from './extract-types'
import { makeLineSnippet } from './snippet-line-context'

/** Normalizza il testo di un singolo token senza cambiare la lunghezza globale della pagina. */
function normalizeTokenText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[·•∙•·]/g, ' ')
    .replace(/[\t\r\f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True quando due token appartengono alla stessa riga visiva della pagina. */
function isSameVisualLine(left: Token, right: Token): boolean {
  const overlap = Math.max(
    0,
    Math.min(left.y1Pct, right.y1Pct) - Math.max(left.y0Pct, right.y0Pct)
  )
  const minHeight = Math.min(
    Math.max(Number.EPSILON, left.y1Pct - left.y0Pct),
    Math.max(Number.EPSILON, right.y1Pct - right.y0Pct)
  )
  if (overlap / minHeight >= 0.5) return true

  const leftMid = (left.y0Pct + left.y1Pct) / 2
  const rightMid = (right.y0Pct + right.y1Pct) / 2
  return Math.abs(leftMid - rightMid) <= minHeight * 0.35
}

/**
 * Builds the normalized page text used by extraction patterns.
 * Conserva le righe visive tramite le coordinate Y; ogni separatore resta lungo
 * un carattere, così gli offset restano allineati a `bboxForSubstring`.
 */
export function pageText(tokens: Token[]): string {
  const normalized = tokens
    .map(token => ({ token, text: normalizeTokenText(token.text) }))
    .filter(item => Boolean(item.text))

  return normalized.reduce((text, item, index) => {
    if (index === 0) return item.text
    const previous = normalized[index - 1].token
    const separator = isSameVisualLine(previous, item.token) ? ' ' : '\n'
    return `${text}${separator}${item.text}`
  }, '')
}

/** Splits attached analysis delimiters while preserving approximate token boxes. */
export function normalizeAnalysisTokens(tokens: Token[]): Token[] {
  return tokens.flatMap(token => {
    const parts = token.text.match(/[^,;:]+|[,;:]/g)?.filter(Boolean) ?? []
    if (parts.length <= 1) return token
    const totalChars = Math.max(1, parts.reduce((sum, part) => sum + part.length, 0))
    let usedChars = 0
    return parts.map(part => {
      const startRatio = usedChars / totalChars
      usedChars += part.length
      const endRatio = usedChars / totalChars
      return {
        ...token,
        text: part,
        x0Pct: token.x0Pct + (token.x1Pct - token.x0Pct) * startRatio,
        x1Pct: token.x0Pct + (token.x1Pct - token.x0Pct) * endRatio,
      }
    })
  })
}

/** Resolves a normalized text offset to its source token index. */
export function charOffsetToTokenIndex(tokens: Token[], offset: number): number {
  let position = 0
  for (let index = 0; index < tokens.length; index++) {
    const text = normalizeTokenText(tokens[index].text)
    if (!text) continue
    const next = position + text.length
    if (offset < next) return index
    position = next + 1
  }
  return Math.max(0, tokens.length - 1)
}

/** Returns the union box for an inclusive token range. */
export function unionBoxes(tokens: Token[], startToken: number, endToken: number): BoxPct {
  const slice = tokens.slice(startToken, endToken + 1)
  return {
    x0Pct: Math.min(...slice.map(token => token.x0Pct)),
    x1Pct: Math.max(...slice.map(token => token.x1Pct)),
    y0Pct: Math.min(...slice.map(token => token.y0Pct)),
    y1Pct: Math.max(...slice.map(token => token.y1Pct)),
  }
}

/** Returns the union box for tokens overlapping a normalized text substring. */
export function bboxForSubstring(tokens: Token[], start: number, length: number): BoxPct {
  let position = 0
  const boxes: BoxPct[] = []
  const end = start + length
  for (const token of tokens) {
    const text = normalizeTokenText(token.text)
    if (!text) continue
    const next = position + text.length
    if (!(next <= start || position >= end)) {
      boxes.push({
        x0Pct: token.x0Pct,
        x1Pct: token.x1Pct,
        y0Pct: token.y0Pct,
        y1Pct: token.y1Pct,
      })
    }
    position = next + 1
  }
  if (boxes.length === 0) return { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 }
  return {
    x0Pct: Math.min(...boxes.map(box => box.x0Pct)),
    x1Pct: Math.max(...boxes.map(box => box.x1Pct)),
    y0Pct: Math.min(...boxes.map(box => box.y0Pct)),
    y1Pct: Math.max(...boxes.map(box => box.y1Pct)),
  }
}

/** Crea uno snippet a righe (fino a 5 sopra / 5 sotto) intorno al match. */
export function makeSnippet(text: string, start: number, length: number): string {
  return makeLineSnippet(text, start, length)
}

const intersectionOverUnion = (left: BoxPct, right: BoxPct): number => {
  const x0 = Math.max(left.x0Pct, right.x0Pct)
  const y0 = Math.max(left.y0Pct, right.y0Pct)
  const x1 = Math.min(left.x1Pct, right.x1Pct)
  const y1 = Math.min(left.y1Pct, right.y1Pct)
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const leftArea = (left.x1Pct - left.x0Pct) * (left.y1Pct - left.y0Pct)
  const rightArea = (right.x1Pct - right.x0Pct) * (right.y1Pct - right.y0Pct)
  const union = leftArea + rightArea - intersection
  return union ? intersection / union : 0
}

/** Removes duplicate occurrences of the same name at the same page location. */
export function deduplicateOccurrences(items: OccOut[], tolerance = 0.9): OccOut[] {
  const output: OccOut[] = []
  for (const item of items) {
    if (!output.some(existing =>
      existing.full_name === item.full_name &&
      intersectionOverUnion(existing.box, item.box) > tolerance
    )) output.push(item)
  }
  return output
}
