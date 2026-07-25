/**
 * Motore puro di ricerca documentale.
 * Cerca nelle pagine canoniche e associa, quando disponibili, le coordinate OCR.
 */

import type {
  OcrPageLayout,
  OcrWord,
  SearchableDocumentContent
} from './document-content-resolver.js'

export interface DocumentSearchMatch {
  id: string
  docId: string
  filename: string
  page: number
  snippet: string
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
  charIdx: number
  qLen: number
}

interface MatchBox {
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
}

const normalizeText = (value: string): string =>
  value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createSearchRegex = (query: string, global: boolean): RegExp => {
  const words = normalizeText(query).trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) throw new Error('La query di ricerca non può essere vuota')
  return new RegExp(words.map(escapeRegex).join('\\s+'), global ? 'giu' : 'iu')
}

const createSnippet = (text: string, start: number, length: number): string => {
  const contextStart = Math.max(0, start - 80)
  const contextEnd = Math.min(text.length, start + length + 80)
  const prefix = contextStart > 0 ? '…' : ''
  const suffix = contextEnd < text.length ? '…' : ''
  return `${prefix}${text.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim()}${suffix}`
}

const coordinateToPercent = (value: number, dimension?: number): number => {
  if (value >= 0 && value <= 1) return value * 100
  if (dimension && dimension > 0 && value >= 0 && value <= dimension) {
    return (value / dimension) * 100
  }
  return Math.max(0, Math.min(100, value))
}

const boxForWords = (words: OcrWord[], layout: OcrPageLayout): MatchBox => ({
  x0Pct: coordinateToPercent(Math.min(...words.map((word) => word.x0)), layout.width),
  y0Pct: coordinateToPercent(Math.min(...words.map((word) => word.y0)), layout.height),
  x1Pct: coordinateToPercent(Math.max(...words.map((word) => word.x1)), layout.width),
  y1Pct: coordinateToPercent(Math.max(...words.map((word) => word.y1)), layout.height)
})

const findLayoutBoxes = (layout: OcrPageLayout | undefined, query: string): MatchBox[] => {
  if (!layout?.words.length) return []

  const words = layout.words.filter((word) => word.text.trim())
  const starts: number[] = []
  let searchableText = ''
  words.forEach((word) => {
    if (searchableText) searchableText += ' '
    starts.push(searchableText.length)
    searchableText += normalizeText(word.text)
  })

  const boxes: MatchBox[] = []
  for (const match of searchableText.matchAll(createSearchRegex(query, true))) {
    const start = match.index
    const end = start + match[0].length
    const matchingWords = words.filter((word, index) => {
      const wordStart = starts[index] ?? 0
      const wordEnd = wordStart + normalizeText(word.text).length
      return wordEnd > start && wordStart < end
    })
    if (matchingWords.length > 0) boxes.push(boxForWords(matchingWords, layout))
  }
  return boxes
}

/**
 * Cerca tutte le occorrenze in un contenuto già risolto.
 */
export function searchDocumentContent(
  content: SearchableDocumentContent,
  rawQuery: string
): DocumentSearchMatch[] {
  const query = rawQuery.trim()
  if (!query) throw new Error('La query di ricerca non può essere vuota')

  const matches: DocumentSearchMatch[] = []
  content.pages.forEach((pageText, pageIndex) => {
    const normalizedPage = normalizeText(pageText)
    const pageMatches = Array.from(normalizedPage.matchAll(createSearchRegex(query, true)))
    const layoutBoxes = findLayoutBoxes(content.layout[pageIndex], query)

    pageMatches.forEach((match, occurrenceIndex) => {
      const charIdx = match.index
      const box = layoutBoxes[occurrenceIndex] || {
        x0Pct: 0,
        y0Pct: 0,
        x1Pct: 100,
        y1Pct: 100
      }
      const page = pageIndex + 1
      matches.push({
        id: `${content.requestedId}-${page}-${charIdx}`,
        docId: content.requestedId,
        filename: content.filename,
        page,
        snippet: createSnippet(pageText, charIdx, match[0].length),
        ...box,
        charIdx,
        qLen: query.length
      })
    })
  })
  return matches
}
