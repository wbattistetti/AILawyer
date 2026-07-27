/**
 * Stato PDF per-documento sopravvive a remount del pannello (es. drag tab in split).
 */

import type { MatchItem } from '../pdf-viewer/hooks/usePdfSearch'

export type PdfViewerSession = {
  page: number
  matches: MatchItem[]
  activeSearchMatchId: string | null
}

const sessions = new Map<string, PdfViewerSession>()

/** Legge la sessione viewer per un documento. */
export function getPdfViewerSession(docId: string): PdfViewerSession | undefined {
  const key = docId.trim()
  if (!key) return undefined
  return sessions.get(key)
}

/** Pagina memorizzata, oppure fallback. */
export function getPdfViewerSessionPage(docId: string, fallback = 1): number {
  const page = getPdfViewerSession(docId)?.page
  return typeof page === 'number' && page >= 1 ? page : fallback
}

/** Aggiorna in modo parziale la sessione di un documento. */
export function patchPdfViewerSession(
  docId: string,
  patch: Partial<PdfViewerSession>
): PdfViewerSession {
  const key = docId.trim()
  if (!key) {
    throw new Error('patchPdfViewerSession: docId is required')
  }
  const previous = sessions.get(key) ?? {
    page: 1,
    matches: [],
    activeSearchMatchId: null,
  }
  const next: PdfViewerSession = {
    page: patch.page ?? previous.page,
    matches: patch.matches ?? previous.matches,
    activeSearchMatchId:
      patch.activeSearchMatchId !== undefined
        ? patch.activeSearchMatchId
        : previous.activeSearchMatchId,
  }
  if (typeof next.page !== 'number' || next.page < 1) {
    throw new Error(`patchPdfViewerSession: invalid page ${next.page}`)
  }
  sessions.set(key, next)
  return next
}

/** Rimuove la sessione (chiusura definitiva del documento). */
export function clearPdfViewerSession(docId: string): void {
  const key = docId.trim()
  if (!key) return
  sessions.delete(key)
}

/** Solo per test. */
export function resetPdfViewerSessionsForTests(): void {
  sessions.clear()
}
