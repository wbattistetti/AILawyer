/**
 * Conversione DocumentMatch canonico → MatchItem del PDF viewer.
 */

import type { DocumentMatch } from '../../search/types'
import type { MatchItem } from '../hooks/usePdfSearch'

/**
 * Adatta un match di ricerca al formato richiesto da goToMatch / overlay PDF.
 */
export function toPdfMatchItem(match: DocumentMatch): MatchItem {
  if (!match.id?.trim()) {
    throw new Error('Match senza id: impossibile evidenziare sul PDF')
  }
  if (typeof match.page !== 'number' || match.page < 1) {
    throw new Error(`Match con pagina non valida: ${match.page}`)
  }

  const sourceRects = match.rects?.length
    ? match.rects
    : (
      match.x1Pct > match.x0Pct && match.y1Pct > match.y0Pct
        ? [{
          x0Pct: match.x0Pct,
          x1Pct: match.x1Pct,
          y0Pct: match.y0Pct,
          y1Pct: match.y1Pct
        }]
        : []
    )

  const rects = sourceRects.map((rect) => ({
    x0Pct: rect.x0Pct,
    x1Pct: rect.x1Pct > rect.x0Pct ? rect.x1Pct : Math.min(100, rect.x0Pct + 1),
    y0Pct: rect.y0Pct,
    y1Pct: rect.y1Pct > rect.y0Pct ? rect.y1Pct : Math.min(100, rect.y0Pct + 1)
  }))

  return {
    id: match.id,
    page: match.page,
    snippet: match.snippet,
    x0Pct: match.x0Pct,
    x1Pct: match.x1Pct,
    y0Pct: match.y0Pct,
    y1Pct: match.y1Pct,
    qLen: match.qLength ?? match.q.length,
    charIdx: match.charIdx ?? 0,
    rects
  }
}
