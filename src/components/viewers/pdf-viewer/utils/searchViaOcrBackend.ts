import { searchDocument } from '../../../search/searchApi'
import type { MatchItem } from '../hooks/usePdfSearch'

/**
 * Adatta la ricerca documentale canonica al contratto legacy del viewer PDF.
 */
export async function searchViaOcrBackend(docId: string, qRaw: string): Promise<MatchItem[]> {
  const matches = await searchDocument(qRaw, {
    locator: { id: docId },
    documentKind: 'pdf'
  })
  return matches.map((match) => ({
    id: match.id,
    page: match.page,
    snippet: match.snippet,
    x0Pct: match.x0Pct,
    x1Pct: match.x1Pct,
    y0Pct: match.y0Pct,
    y1Pct: match.y1Pct,
    charIdx: match.charIdx ?? 0,
    qLen: match.qLength ?? qRaw.length,
    rects: match.rects
  }))
}
