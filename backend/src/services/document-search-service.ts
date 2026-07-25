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
  rects: DocumentSearchRect[]
}

export interface DocumentSearchRect {
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
}

interface LayoutMatch {
  charIdx: number
  length: number
  sourceText: string
  rects: DocumentSearchRect[]
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

const coordinateToPercent = (
  value: number,
  dimension: number | undefined,
  normalized: boolean
): number => {
  if (normalized) return value * 100
  if (!dimension || dimension <= 0) {
    throw new Error('Layout OCR non valido: dimensioni pagina mancanti')
  }
  if (value < 0 || value > dimension) {
    throw new Error(`Layout OCR non valido: coordinata ${value} fuori dalla pagina`)
  }
  return (value / dimension) * 100
}

const usesNormalizedCoordinates = (words: OcrWord[]): boolean =>
  words.every((word) =>
    word.x0 >= 0 && word.x0 <= 1 &&
    word.y0 >= 0 && word.y0 <= 1 &&
    word.x1 >= 0 && word.x1 <= 1 &&
    word.y1 >= 0 && word.y1 <= 1
  )

const rectForWord = (
  word: OcrWord,
  layout: OcrPageLayout,
  normalized: boolean
): DocumentSearchRect => {
  const rect = {
    x0Pct: coordinateToPercent(word.x0, layout.width, normalized),
    y0Pct: coordinateToPercent(word.y0, layout.height, normalized),
    x1Pct: coordinateToPercent(word.x1, layout.width, normalized),
    y1Pct: coordinateToPercent(word.y1, layout.height, normalized)
  }
  if (rect.x1Pct < rect.x0Pct || rect.y1Pct < rect.y0Pct) {
    throw new Error(`Layout OCR non valido: rettangolo invertito per "${word.text}"`)
  }
  return rect
}

const boxForRects = (rects: DocumentSearchRect[]): DocumentSearchRect => ({
  x0Pct: Math.min(...rects.map((rect) => rect.x0Pct)),
  y0Pct: Math.min(...rects.map((rect) => rect.y0Pct)),
  x1Pct: Math.max(...rects.map((rect) => rect.x1Pct)),
  y1Pct: Math.max(...rects.map((rect) => rect.y1Pct))
})

const findLayoutMatches = (layout: OcrPageLayout | undefined, query: string): LayoutMatch[] => {
  if (!layout?.words.length) return []

  const words = layout.words.filter((word) => word.text.trim())
  const normalizedCoordinates = usesNormalizedCoordinates(words)
  const starts: number[] = []
  let searchableText = ''
  let sourceText = ''
  words.forEach((word) => {
    if (searchableText) {
      searchableText += ' '
      sourceText += ' '
    }
    starts.push(searchableText.length)
    searchableText += normalizeText(word.text)
    sourceText += word.text
  })

  const matches: LayoutMatch[] = []
  for (const match of searchableText.matchAll(createSearchRegex(query, true))) {
    const start = match.index
    const end = start + match[0].length
    const matchingWords = words.filter((word, index) => {
      const wordStart = starts[index] ?? 0
      const wordEnd = wordStart + normalizeText(word.text).length
      return wordEnd > start && wordStart < end
    })
    if (matchingWords.length > 0) {
      matches.push({
        charIdx: start,
        length: match[0].length,
        sourceText,
        rects: matchingWords.map((word) =>
          rectForWord(word, layout, normalizedCoordinates)
        )
      })
    }
  }
  return matches
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
    const pageNumber = pageIndex + 1
    const pageLayout = content.layout.find((layout) => layout.page === pageNumber)
      ?? content.layout[pageIndex]
    const layoutMatches = findLayoutMatches(pageLayout, query)
    if (layoutMatches.length > 0) {
      layoutMatches.forEach((layoutMatch) => {
        const box = boxForRects(layoutMatch.rects)
        matches.push({
          id: `${content.requestedId}-${pageNumber}-${layoutMatch.charIdx}`,
          docId: content.requestedId,
          filename: content.filename,
          page: pageNumber,
          snippet: createSnippet(
            layoutMatch.sourceText,
            layoutMatch.charIdx,
            layoutMatch.length
          ),
          ...box,
          charIdx: layoutMatch.charIdx,
          qLen: query.length,
          rects: layoutMatch.rects
        })
      })
      return
    }

    const normalizedPage = normalizeText(pageText)
    const pageMatches = Array.from(normalizedPage.matchAll(createSearchRegex(query, true)))

    pageMatches.forEach((match) => {
      const charIdx = match.index
      const box = {
        x0Pct: 0,
        y0Pct: 0,
        x1Pct: 0,
        y1Pct: 0
      }
      matches.push({
        id: `${content.requestedId}-${pageNumber}-${charIdx}`,
        docId: content.requestedId,
        filename: content.filename,
        page: pageNumber,
        snippet: createSnippet(pageText, charIdx, match[0].length),
        ...box,
        charIdx,
        qLen: query.length,
        rects: []
      })
    })
  })
  return matches
}
