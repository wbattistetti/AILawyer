/**
 * Contratti condivisi della ricerca documentale per tutti i viewer.
 */

export type SearchScope = 'current' | 'open' | 'archive'

export type DocumentKind = 'pdf' | 'word'

export interface DocRef {
  id: string
  title: string
  hash: string
  pages: number
  kind: DocumentKind
}

/**
 * Risultato canonico. Le coordinate sono percentuali nel range 0-100.
 */
export interface DocumentMatch {
  id: string
  docId: string
  docTitle: string
  kind: DocumentKind
  page: number
  q: string
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
  charIdx?: number
  qLength?: number
  snippet: string
  score: number
  ord?: number
}

export interface SearchResultNode {
  id: string
  query: string
  scope: SearchScope
  total: number
  groups: Array<{ doc: DocRef; matches: DocumentMatch[] }>
}

/**
 * Confine tra UI condivisa e implementazione specifica del viewer.
 */
export interface DocumentSearchAdapter {
  readonly document: DocRef
  search(query: string, scope: SearchScope): Promise<DocumentMatch[]>
  goToMatch(match: DocumentMatch): Promise<void>
}
