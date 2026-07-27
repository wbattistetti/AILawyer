/**
 * Contratti condivisi della ricerca documentale per tutti i viewer.
 */

export type SearchScope = 'current' | 'open' | 'archive'

export type DocumentKind = 'pdf' | 'word'

/**
 * Riferimento stabile usato dal backend per risolvere documenti salvati o locali.
 */
export interface DocumentLocator {
  id: string
  hash?: string
  storageKey?: string
  filename?: string
}

export interface DocRef {
  id: string
  title: string
  hash: string
  pages: number
  kind: DocumentKind
}

export interface SearchMatchRect {
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
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
  rects: SearchMatchRect[]
  charIdx?: number
  qLength?: number
  snippet: string
  score: number
  ord?: number
}

/** PDF scansionato escluso dalla ricerca perché privo di testo OCR. */
export interface SearchDiagnostic {
  docId: string
  docTitle: string
  code: 'ocr-required'
  message: string
  ocrStatus: string
}

export interface SearchResultNode {
  id: string
  query: string
  scope: SearchScope
  total: number
  groups: Array<{ doc: DocRef; matches: DocumentMatch[] }>
  diagnostics?: SearchDiagnostic[]
}

/**
 * Confine tra UI condivisa e implementazione specifica del viewer.
 */
export interface DocumentSearchAdapter {
  readonly document: DocRef
  search(query: string, scope: SearchScope): Promise<DocumentMatch[]>
  goToMatch(match: DocumentMatch): Promise<void>
}

/**
 * Navigatore registrato dal viewer aperto: evidenzia e salta al match canonico.
 * Un solo percorso per ricerca documento e ricerca globale.
 */
export interface ViewerSearchNavigator {
  readonly documentId: string
  readonly kind: DocumentKind
  goToMatch(match: DocumentMatch): Promise<void>
}
