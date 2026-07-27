/**
 * Converte testo piano in token di pagina sintetici per il worker di estrazione.
 */

import type { PageToken } from './types'

/** Separa delimitatori strutturali senza rompere date, CF, sigle o abbreviazioni. */
export function splitAnalysisToken(raw: string): string[] {
  return raw.match(/[^,;:]+|[,;:]/g)?.filter(Boolean) ?? []
}

/**
 * Spezza il testo in token non-spazio preservando le righe reali tramite coordinate Y.
 * Le coordinate sono sintetiche, ma mantengono la struttura del testo Word.
 */
export function tokenizePlainTextAsPage(text: string): PageToken[] {
  const lines = (text || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const lineHeight = 1 / lines.length
  const tokens: PageToken[] = []
  lines.forEach((line, lineIndex) => {
    const parts = (line.match(/\S+/g) ?? []).flatMap(splitAnalysisToken)
    const tokenWidth = 1 / Math.max(1, parts.length)
    parts.forEach((part, tokenIndex) => {
      tokens.push({
        text: part,
        x0Pct: tokenIndex * tokenWidth,
        x1Pct: Math.min(1, (tokenIndex + 1) * tokenWidth),
        y0Pct: lineIndex * lineHeight,
        y1Pct: Math.min(1, (lineIndex + 1) * lineHeight),
      })
    })
  })
  return tokens
}
