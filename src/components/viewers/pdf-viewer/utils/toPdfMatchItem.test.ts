/**
 * Test conversione DocumentMatch → MatchItem PDF.
 */

import { describe, expect, it } from 'vitest'
import type { DocumentMatch } from '../../../search/types'
import { toPdfMatchItem } from './toPdfMatchItem'

const baseMatch: DocumentMatch = {
  id: 'match-1',
  docId: 'doc-1',
  docTitle: 'Atto.pdf',
  kind: 'pdf',
  page: 2,
  q: 'direttore',
  x0Pct: 10,
  x1Pct: 30,
  y0Pct: 40,
  y1Pct: 45,
  rects: [{ x0Pct: 10, x1Pct: 30, y0Pct: 40, y1Pct: 45 }],
  snippet: 'Vice Direttore',
  score: 1,
  qLength: 9,
  charIdx: 12
}

describe('toPdfMatchItem', () => {
  it('preserva id, pagina e rettangoli per l’overlay', () => {
    expect(toPdfMatchItem(baseMatch)).toMatchObject({
      id: 'match-1',
      page: 2,
      rects: [{ x0Pct: 10, x1Pct: 30, y0Pct: 40, y1Pct: 45 }],
      qLen: 9,
      charIdx: 12
    })
  })

  it('espande rettangoli degeneri così l’highlight resta visibile', () => {
    const item = toPdfMatchItem({
      ...baseMatch,
      x0Pct: 15,
      x1Pct: 15,
      y0Pct: 20,
      y1Pct: 20,
      rects: [{ x0Pct: 15, x1Pct: 15, y0Pct: 20, y1Pct: 20 }]
    })
    expect(item.rects[0].x1Pct).toBeGreaterThan(item.rects[0].x0Pct)
    expect(item.rects[0].y1Pct).toBeGreaterThan(item.rects[0].y0Pct)
  })
})
