/**
 * Apre un documento dalle fonti e naviga all'occorrenza evidenziata.
 */

import { searchDocument } from '../../components/search/searchApi'
import type {
  DocumentKind,
  DocumentMatch,
  SearchMatchRect,
} from '../../components/search/types'
import type { ViewerSearchNavigatorRegistry } from '../../components/search/viewerSearchNavigatorRegistry'
import type { BoxPct } from './entity-index'
import { isUsableOccurrenceBox } from './occurrence-box'

export type OpenOccurrenceTarget = {
  docId: string
  title: string
  page: number
  box: BoxPct
  snippet: string
  occurrenceId: string
  /** Termine primario (es. targa). */
  highlightQuery?: string
  /** Tutte le caratteristiche da evidenziare (marca, modello, colore, targa…). */
  highlightTerms?: string[]
  kind?: DocumentKind
}

const PLATE_RE = /\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/i
const ANCHOR_NEAR_Y_PCT = 10

/** Preferisce identificatori stabili e include tutte le caratteristiche utili. */
export function buildHighlightQueries(target: OpenOccurrenceTarget): string[] {
  const queries: string[] = []
  const push = (value?: string) => {
    const trimmed = value?.trim()
    if (!trimmed || trimmed.length < 2) return
    if (!queries.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
      queries.push(trimmed)
    }
  }

  for (const term of target.highlightTerms ?? []) push(term)
  push(target.highlightQuery)

  const plateFromQuery = target.highlightQuery?.match(PLATE_RE)?.[0]
  const plateFromSnippet = target.snippet?.match(PLATE_RE)?.[0]
  if (plateFromQuery) {
    push(plateFromQuery.replace(/\s+/g, '').toUpperCase())
    push(plateFromQuery)
  }
  if (plateFromSnippet) {
    push(plateFromSnippet.replace(/\s+/g, '').toUpperCase())
    push(plateFromSnippet)
  }

  // Identificatori forti prima: guida l'ancoraggio verticale dei rettangoli.
  return queries.sort((left, right) => {
    const leftPlate = PLATE_RE.test(left) ? 0 : 1
    const rightPlate = PLATE_RE.test(right) ? 0 : 1
    if (leftPlate !== rightPlate) return leftPlate - rightPlate
    return right.length - left.length
  })
}

/** Converte un box 0–1 in percentuali 0–100 per DocumentMatch. */
export function occurrenceBoxToMatchPercents(box: BoxPct): {
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
} | null {
  if (!isUsableOccurrenceBox(box)) return null
  return {
    x0Pct: box.x0Pct * 100,
    x1Pct: box.x1Pct * 100,
    y0Pct: box.y0Pct * 100,
    y1Pct: box.y1Pct * 100,
  }
}

/** Costruisce il match geometrico di base (senza bande fittizie). */
export function occurrenceToDocumentMatch(target: OpenOccurrenceTarget): DocumentMatch {
  if (!target.docId.trim()) {
    throw new Error('occurrenceToDocumentMatch: docId is required')
  }
  if (!Number.isInteger(target.page) || target.page < 1) {
    throw new Error(`occurrenceToDocumentMatch: invalid page ${target.page}`)
  }

  const box = occurrenceBoxToMatchPercents(target.box)
  const query = target.highlightQuery?.trim()
    || target.highlightTerms?.find(Boolean)?.trim()
    || ''
  return {
    id: target.occurrenceId || `occ-${target.docId}-${target.page}`,
    docId: target.docId,
    docTitle: target.title,
    kind: target.kind ?? 'pdf',
    page: target.page,
    q: query,
    x0Pct: box?.x0Pct ?? 0,
    x1Pct: box?.x1Pct ?? 0,
    y0Pct: box?.y0Pct ?? 0,
    y1Pct: box?.y1Pct ?? 0,
    rects: box ? [box] : [],
    snippet: target.snippet || '',
    score: 1,
    qLength: query.length || undefined,
  }
}

/** Unisce rettangoli distinti evitando duplicati quasi identici. */
export function mergeSearchRects(rects: SearchMatchRect[]): SearchMatchRect[] {
  const merged: SearchMatchRect[] = []
  for (const rect of rects) {
    const duplicate = merged.some(existing =>
      Math.abs(existing.x0Pct - rect.x0Pct) < 0.4
      && Math.abs(existing.x1Pct - rect.x1Pct) < 0.4
      && Math.abs(existing.y0Pct - rect.y0Pct) < 0.4
      && Math.abs(existing.y1Pct - rect.y1Pct) < 0.4
    )
    if (!duplicate) merged.push(rect)
  }
  return merged.sort((left, right) =>
    left.y0Pct - right.y0Pct || left.x0Pct - right.x0Pct
  )
}

/** Tiene solo i rettangoli vicini all'ancora (targa / primo hit). */
export function filterRectsNearAnchor(
  rects: SearchMatchRect[],
  anchor: SearchMatchRect | undefined,
  maxDeltaYPct = ANCHOR_NEAR_Y_PCT
): SearchMatchRect[] {
  if (!anchor || rects.length === 0) return rects
  const anchorMid = (anchor.y0Pct + anchor.y1Pct) / 2
  return rects.filter(rect => {
    const mid = (rect.y0Pct + rect.y1Pct) / 2
    return Math.abs(mid - anchorMid) <= maxDeltaYPct
  })
}

/**
 * Risolve pagina + rettangoli reali via ricerca documentale, vincolati alla pagina fonte.
 * Raccoglie tutte le caratteristiche (marca/modello/colore/targa), non solo la targa.
 */
export async function resolveOccurrenceMatch(
  target: OpenOccurrenceTarget
): Promise<DocumentMatch> {
  const base = occurrenceToDocumentMatch(target)
  const kind = target.kind ?? 'pdf'
  const queries = buildHighlightQueries(target)

  if (kind === 'pdf' && queries.length > 0) {
    const results = await Promise.all(
      queries.map(async query => ({
        query,
        found: await searchDocument(query, {
          locator: { id: target.docId, filename: target.title },
          documentKind: 'pdf',
          documentTitle: target.title,
        }),
      }))
    )

    const collected: SearchMatchRect[] = []
    let anchor: SearchMatchRect | undefined
    let primaryQuery = ''
    let snippet = base.snippet

    for (const { query, found } of results) {
      const onPage = found.filter(match => match.page === target.page && match.rects?.length)
      if (onPage.length === 0) continue
      if (!primaryQuery) {
        primaryQuery = query
        snippet = onPage[0].snippet || snippet
      }
      for (const hit of onPage) {
        for (const rect of hit.rects) {
          if (!anchor && PLATE_RE.test(query)) anchor = rect
          if (!anchor) anchor = rect
          collected.push(rect)
        }
      }
    }

    const near = filterRectsNearAnchor(collected, anchor)
    const rects = mergeSearchRects(near.length > 0 ? near : collected)
    if (rects.length > 0) {
      return {
        ...base,
        q: primaryQuery || base.q,
        qLength: (primaryQuery || base.q).length || undefined,
        page: target.page,
        x0Pct: Math.min(...rects.map(rect => rect.x0Pct)),
        x1Pct: Math.max(...rects.map(rect => rect.x1Pct)),
        y0Pct: Math.min(...rects.map(rect => rect.y0Pct)),
        y1Pct: Math.max(...rects.map(rect => rect.y1Pct)),
        rects,
        snippet,
      }
    }
  }

  if (base.rects.length > 0) return base

  return {
    ...base,
    q: queries[0] || base.q,
    qLength: (queries[0] || base.q).length || undefined,
    rects: [],
  }
}

/**
 * Apre la tab documento, attende il viewer e salta a pagina + evidenziazione.
 * Con box noto salta subito; la ricerca raffina i rettangoli in parallelo.
 */
export async function openOccurrenceInViewer(args: {
  target: OpenOccurrenceTarget
  openDoc: (doc: { id: string; title: string }) => void
  registry: ViewerSearchNavigatorRegistry
}): Promise<void> {
  const { target, openDoc, registry } = args
  if (!target.docId.trim()) {
    throw new Error('Impossibile aprire la fonte: documento mancante')
  }

  openDoc({ id: target.docId, title: target.title })
  const base = occurrenceToDocumentMatch(target)
  const navigatorPromise = registry.waitFor(target.docId)
  const resolvePromise = resolveOccurrenceMatch(target)

  if (base.rects.length > 0) {
    const navigator = await navigatorPromise
    await navigator.goToMatch(base)
    const refined = await resolvePromise
    if (
      refined.rects.length > 0
      && (
        refined.rects.length !== base.rects.length
        || Math.abs(refined.y0Pct - base.y0Pct) > 0.5
        || Math.abs(refined.x0Pct - base.x0Pct) > 0.5
      )
    ) {
      await navigator.goToMatch(refined)
    }
    return
  }

  const [match, navigator] = await Promise.all([resolvePromise, navigatorPromise])
  await navigator.goToMatch(match)
}
