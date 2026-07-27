/**
 * Ricerca e navigazione nel DOM HTML prodotto da Mammoth per i documenti Word.
 */

import type React from 'react'
import type { DocumentMatch, DocumentSearchAdapter } from '../../search/types'
import type { WordViewerHandle } from './components/WordViewerCore'

interface CreateWordSearchAdapterOptions {
  docId: string
  docName: string
  totalPages: number
  hostRef: React.RefObject<HTMLDivElement>
  viewerRef: React.RefObject<WordViewerHandle>
}

interface TextPosition {
  node: Text
  offset: number
}

export interface WordSearchPage {
  page: number
  text: string
}

const HIGHLIGHT_ATTRIBUTE = 'data-word-search-highlight'

const createSnippet = (text: string, start: number, length: number): string => {
  const contextStart = Math.max(0, start - 60)
  const contextEnd = Math.min(text.length, start + length + 60)
  return text.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim()
}

/**
 * Trova tutte le occorrenze testuali nelle pagine Word senza dipendere dal DOM.
 */
export function findWordMatchesInPages(
  pages: WordSearchPage[],
  query: string,
  docId: string,
  docName: string
): DocumentMatch[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('La query di ricerca non può essere vuota')
  }
  if (!docId.trim()) {
    throw new Error('docId è obbligatorio per la ricerca Word')
  }

  const needle = normalizedQuery.toLocaleLowerCase('it-IT')
  const matches: DocumentMatch[] = []

  pages.forEach(({ page, text }) => {
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`Numero pagina Word non valido: ${page}`)
    }

    const searchableText = text.toLocaleLowerCase('it-IT')
    let offset = 0

    while (offset <= searchableText.length - needle.length) {
      const matchOffset = searchableText.indexOf(needle, offset)
      if (matchOffset < 0) break

      matches.push({
        id: `${docId}-${page}-${matchOffset}`,
        docId,
        docTitle: docName,
        kind: 'word',
        page,
        q: normalizedQuery,
        x0Pct: 0,
        x1Pct: 0,
        y0Pct: 0,
        y1Pct: 0,
        rects: [],
        charIdx: matchOffset,
        qLength: normalizedQuery.length,
        snippet: createSnippet(text, matchOffset, normalizedQuery.length),
        score: 0
      })
      offset = matchOffset + Math.max(1, needle.length)
    }
  })

  return matches
}

const findTextPosition = (root: HTMLElement, targetOffset: number): TextPosition | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let traversed = 0
  let current = walker.nextNode()

  while (current) {
    const textNode = current as Text
    const nextOffset = traversed + textNode.data.length
    if (targetOffset <= nextOffset) {
      return {
        node: textNode,
        offset: Math.max(0, Math.min(textNode.data.length, targetOffset - traversed))
      }
    }
    traversed = nextOffset
    current = walker.nextNode()
  }

  return null
}

const createMatchRange = (
  pageElement: HTMLElement,
  startOffset: number,
  queryLength: number
): Range => {
  const start = findTextPosition(pageElement, startOffset)
  const end = findTextPosition(pageElement, startOffset + queryLength)
  if (!start || !end) {
    throw new Error('Impossibile localizzare il risultato nel documento Word')
  }

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

const clearHighlights = (host: HTMLElement): void => {
  host.querySelectorAll(`[${HIGHLIGHT_ATTRIBUTE}]`).forEach((element) => element.remove())
}

const paintRange = (pageElement: HTMLElement, range: Range): HTMLElement => {
  const pageRect = pageElement.getBoundingClientRect()
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    throw new Error('La pagina Word non ha dimensioni valide per evidenziare il risultato')
  }

  if (window.getComputedStyle(pageElement).position === 'static') {
    pageElement.style.position = 'relative'
  }

  const fragments = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  )
  if (fragments.length === 0) {
    throw new Error('Il risultato Word non ha un rettangolo visibile')
  }

  let firstHighlight: HTMLElement | null = null
  fragments.forEach((rect) => {
    const highlight = document.createElement('div')
    highlight.setAttribute(HIGHLIGHT_ATTRIBUTE, 'true')
    highlight.className = 'absolute z-20 pointer-events-none bg-yellow-300/50 border border-yellow-500/70 rounded-sm'
    highlight.style.left = `${((rect.left - pageRect.left) / pageRect.width) * 100}%`
    highlight.style.top = `${((rect.top - pageRect.top) / pageRect.height) * 100}%`
    highlight.style.width = `${(rect.width / pageRect.width) * 100}%`
    highlight.style.height = `${(rect.height / pageRect.height) * 100}%`
    pageElement.appendChild(highlight)
    firstHighlight ??= highlight
  })

  return firstHighlight!
}

/**
 * Crea l'adapter Word usando esclusivamente il DOM del viewer corrente.
 */
export function createWordSearchAdapter({
  docId,
  docName,
  totalPages,
  hostRef,
  viewerRef
}: CreateWordSearchAdapterOptions): DocumentSearchAdapter {
  if (!docId.trim()) {
    throw new Error('docId è obbligatorio per creare l’adapter di ricerca Word')
  }

  return {
    document: {
      id: docId,
      title: '',
      hash: '',
      pages: totalPages,
      kind: 'word'
    },

    async search(query) {
      const host = hostRef.current
      if (!host) {
        throw new Error('Viewer Word non disponibile')
      }

      const pages = Array.from(host.querySelectorAll<HTMLElement>('[data-page]')).map(
        (pageElement, pageIndex) => ({
          page: Number(pageElement.dataset.page || pageIndex + 1),
          text: pageElement.textContent || ''
        })
      )
      return findWordMatchesInPages(pages, query, docId, docName)
    },

    async goToMatch(match) {
      if (match.kind !== 'word' || match.docId !== docId) {
        throw new Error('Il risultato non appartiene al viewer Word corrente')
      }
      if (match.charIdx === undefined || match.charIdx < 0) {
        throw new Error('Il risultato Word non contiene una posizione testuale valida')
      }

      viewerRef.current?.jumpToPage(match.page)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const host = hostRef.current
      const pageElement = host?.querySelector<HTMLElement>(`[data-page="${match.page}"]`)
      if (!host || !pageElement) {
        throw new Error(`Pagina Word ${match.page} non disponibile`)
      }

      clearHighlights(host)
      const range = createMatchRange(pageElement, match.charIdx, match.qLength ?? match.q.length)
      const highlight = paintRange(pageElement, range)
      highlight.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
    }
  }
}
