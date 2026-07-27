/**
 * Test conversione occorrenza → match viewer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchDocument } from '../../components/search/searchApi'
import {
  buildHighlightQueries,
  filterRectsNearAnchor,
  mergeSearchRects,
  occurrenceBoxToMatchPercents,
  occurrenceToDocumentMatch,
  resolveOccurrenceMatch,
} from './open-occurrence-in-viewer'

vi.mock('../../components/search/searchApi', () => ({
  searchDocument: vi.fn(async () => []),
}))

const searchDocumentMock = vi.mocked(searchDocument)

describe('open-occurrence-in-viewer', () => {
  beforeEach(() => {
    searchDocumentMock.mockReset()
    searchDocumentMock.mockResolvedValue([])
  })

  it('converte box 0–1 in percentuali 0–100', () => {
    expect(occurrenceBoxToMatchPercents({
      x0Pct: 0.1,
      x1Pct: 0.4,
      y0Pct: 0.2,
      y1Pct: 0.25,
    })).toEqual({
      x0Pct: 10,
      x1Pct: 40,
      y0Pct: 20,
      y1Pct: 25,
    })
  })

  it('non inventa bande fittizie per box inutilizzabili', () => {
    expect(occurrenceBoxToMatchPercents({
      x0Pct: 0,
      x1Pct: 0,
      y0Pct: 0,
      y1Pct: 0,
    })).toBeNull()
    expect(occurrenceToDocumentMatch({
      docId: 'doc-1',
      title: 'verbale.pdf',
      page: 3,
      box: { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 },
      snippet: 'Suzuki',
      occurrenceId: 'occ-1',
    }).rects).toEqual([])
  })

  it('preferisce la targa tra le query di evidenziazione', () => {
    expect(buildHighlightQueries({
      docId: 'doc-1',
      title: 'verbale.pdf',
      page: 3,
      box: { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 },
      snippet: 'marca Suzuki modello Swift targata CW692HR',
      occurrenceId: 'occ-1',
      highlightQuery: 'Suzuki Swift grigio targa CW692HR',
    })).toContain('CW692HR')
  })

  it('include tutte le caratteristiche come query distinte', () => {
    const queries = buildHighlightQueries({
      docId: 'doc-1',
      title: 'verbale.pdf',
      page: 3,
      box: { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 },
      snippet: 'Fiat Punto di colore grigio chiaro targata CH340GW',
      occurrenceId: 'occ-1',
      highlightQuery: 'CH340GW',
      highlightTerms: ['Fiat', 'Punto', 'grigio chiaro', 'grigio', 'CH340GW'],
    })
    expect(queries[0]).toBe('CH340GW')
    expect(queries).toEqual(
      expect.arrayContaining(['Fiat', 'Punto', 'grigio', 'grigio chiaro'])
    )
  })

  it('unisce i rettangoli delle caratteristiche vicine alla targa', () => {
    const plate = { x0Pct: 55, x1Pct: 70, y0Pct: 40, y1Pct: 44 }
    const make = { x0Pct: 10, x1Pct: 18, y0Pct: 40, y1Pct: 44 }
    const far = { x0Pct: 10, x1Pct: 18, y0Pct: 80, y1Pct: 84 }
    const near = filterRectsNearAnchor([make, plate, far], plate)
    expect(mergeSearchRects(near)).toEqual([make, plate])
  })

  it('risolve rettangoli dalla ricerca sulla pagina della fonte', async () => {
    searchDocumentMock.mockResolvedValue([
      {
        id: 'm-other',
        docId: 'doc-1',
        docTitle: 'Arresto Di Nardo.pdf',
        kind: 'pdf',
        page: 1,
        q: 'CW692HR',
        x0Pct: 10,
        x1Pct: 20,
        y0Pct: 10,
        y1Pct: 12,
        rects: [{ x0Pct: 10, x1Pct: 20, y0Pct: 10, y1Pct: 12 }],
        snippet: 'altro',
        score: 1,
      },
      {
        id: 'm-page3',
        docId: 'doc-1',
        docTitle: 'Arresto Di Nardo.pdf',
        kind: 'pdf',
        page: 3,
        q: 'CW692HR',
        x0Pct: 30,
        x1Pct: 48,
        y0Pct: 62,
        y1Pct: 66,
        rects: [{ x0Pct: 30, x1Pct: 48, y0Pct: 62, y1Pct: 66 }],
        snippet: 'Suzuki Swift CW692HR',
        score: 1,
      },
    ])

    const resolved = await resolveOccurrenceMatch({
      docId: 'doc-1',
      title: 'Arresto Di Nardo.pdf',
      page: 3,
      box: { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 },
      snippet: 'Suzuki Swift CW692HR',
      occurrenceId: 'occ-vehicle',
      highlightQuery: 'CW692HR',
      kind: 'pdf',
    })

    expect(resolved.page).toBe(3)
    expect(resolved.rects[0]).toEqual({ x0Pct: 30, x1Pct: 48, y0Pct: 62, y1Pct: 66 })
    expect(resolved.id).toBe('occ-vehicle')
  })

  it('raccoglie rettangoli di marca, modello, colore e targa sulla stessa pagina', async () => {
    searchDocumentMock.mockImplementation(async (query: string) => {
      const byQuery: Record<string, { x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }> = {
        CH340GW: { x0Pct: 55, x1Pct: 70, y0Pct: 40, y1Pct: 44 },
        Fiat: { x0Pct: 10, x1Pct: 18, y0Pct: 40, y1Pct: 44 },
        Punto: { x0Pct: 19, x1Pct: 30, y0Pct: 40, y1Pct: 44 },
        grigio: { x0Pct: 38, x1Pct: 48, y0Pct: 40, y1Pct: 44 },
      }
      const rect = byQuery[query]
      if (!rect) return []
      return [{
        id: `m-${query}`,
        docId: 'doc-1',
        docTitle: 'Arresto Di Nardo.pdf',
        kind: 'pdf' as const,
        page: 3,
        q: query,
        ...rect,
        rects: [rect],
        snippet: 'Fiat Punto di colore grigio chiaro targata CH340GW',
        score: 1,
      }]
    })

    const resolved = await resolveOccurrenceMatch({
      docId: 'doc-1',
      title: 'Arresto Di Nardo.pdf',
      page: 3,
      box: { x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 },
      snippet: 'Fiat Punto di colore grigio chiaro targata CH340GW',
      occurrenceId: 'occ-fiat',
      highlightQuery: 'CH340GW',
      highlightTerms: ['Fiat', 'Punto', 'grigio', 'CH340GW'],
      kind: 'pdf',
    })

    expect(resolved.rects).toHaveLength(4)
    expect(resolved.rects.map(rect => rect.x0Pct).sort((a, b) => a - b)).toEqual([10, 19, 38, 55])
  })
})
