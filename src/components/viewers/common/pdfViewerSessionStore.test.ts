/**
 * Test dello store sessione PDF per-documento.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPdfViewerSession,
  getPdfViewerSession,
  getPdfViewerSessionPage,
  patchPdfViewerSession,
  resetPdfViewerSessionsForTests,
} from './pdfViewerSessionStore'

describe('pdfViewerSessionStore', () => {
  beforeEach(() => {
    resetPdfViewerSessionsForTests()
  })

  it('memorizza pagina e match per documento', () => {
    patchPdfViewerSession('doc-a', {
      page: 8,
      matches: [{
        id: 'm1',
        page: 8,
        snippet: 'CH340GW',
        x0Pct: 10,
        x1Pct: 20,
        y0Pct: 40,
        y1Pct: 44,
        qLen: 7,
        charIdx: 0,
        rects: [{ x0Pct: 10, x1Pct: 20, y0Pct: 40, y1Pct: 44 }],
      }],
      activeSearchMatchId: 'm1',
    })
    expect(getPdfViewerSessionPage('doc-a')).toBe(8)
    expect(getPdfViewerSession('doc-a')?.activeSearchMatchId).toBe('m1')
    expect(getPdfViewerSession('doc-a')?.matches).toHaveLength(1)
  })

  it('aggiorna in modo parziale senza perdere i match', () => {
    patchPdfViewerSession('doc-a', {
      page: 3,
      matches: [{
        id: 'm1',
        page: 3,
        snippet: 'x',
        x0Pct: 1,
        x1Pct: 2,
        y0Pct: 1,
        y1Pct: 2,
        qLen: 1,
        charIdx: 0,
        rects: [{ x0Pct: 1, x1Pct: 2, y0Pct: 1, y1Pct: 2 }],
      }],
      activeSearchMatchId: 'm1',
    })
    patchPdfViewerSession('doc-a', { page: 8 })
    expect(getPdfViewerSession('doc-a')).toMatchObject({
      page: 8,
      activeSearchMatchId: 'm1',
    })
    expect(getPdfViewerSession('doc-a')?.matches).toHaveLength(1)
  })

  it('cancella la sessione alla chiusura', () => {
    patchPdfViewerSession('doc-a', { page: 2 })
    clearPdfViewerSession('doc-a')
    expect(getPdfViewerSession('doc-a')).toBeUndefined()
  })
})
