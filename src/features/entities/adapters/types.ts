/**
 * Contratti tipizzati per l’accesso al testo documentale nell’estrazione anagrafiche.
 */

export type PageToken = {
  text: string
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
}

export type DocIdentity = {
  praticaId?: string
  docId: string
  title: string
  hash: string
}

export type DocumentTextSource =
  | 'local-ocr'
  | 'database-ocr'
  | 'native-pdf'
  | 'docx'
  | 'client-pdf'

export type DocMeta = DocIdentity & {
  pages: number
  source: DocumentTextSource
  textLength?: number
}

/**
 * Adapter di lettura token per pagina. L’orchestrator resta agnostico al formato file.
 */
export interface DocAdapter {
  /** Identità sincrona, senza I/O: usata per report errori anche se il file non si apre. */
  getIdentity(): DocIdentity
  getDocMeta(): Promise<DocMeta>
  streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void>
}

export type SkipReason = 'unsupported' | 'unreadable'

export type SkippedDocument = {
  docId: string
  title: string
  reason: SkipReason
  detail?: string
}

export type AdapterBuildResult = {
  adapters: DocAdapter[]
  skipped: SkippedDocument[]
}
