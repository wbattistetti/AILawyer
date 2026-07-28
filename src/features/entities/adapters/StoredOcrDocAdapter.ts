/**
 * Adapter OCR già presente sul documento in store (es. pratica ricaricata dal DB).
 * Evita round-trip API quando ocrText/ocrLayout sono già in memoria client.
 */

import type { Documento, OcrLayoutPage } from '../../../types'
import type { ResolvedDocumentContent } from '../../../lib/api'
import { layoutPageToTokens } from './ResolvedContentDocAdapter'
import { tokenizePlainTextAsPage } from './plain-text-tokens'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from './types'

const splitPages = (text: string): string[] => text.split(/\n\f\n|\f/g)

type StoredOcrOptions = {
  praticaId?: string
  docId: string
  title: string
  hash: string
  ocrText: string
  ocrLayout?: OcrLayoutPage[] | string | null
}

/** Normalizza layout OCR eventualmente serializzato come JSON string. */
export function normalizeStoredOcrLayout(
  layout: StoredOcrOptions['ocrLayout']
): ResolvedDocumentContent['layout'] {
  if (!layout) return []
  const parsed: unknown = typeof layout === 'string' ? JSON.parse(layout) : layout
  if (!Array.isArray(parsed)) {
    throw new Error('Layout OCR in store non valido: atteso un array')
  }
  return parsed as ResolvedDocumentContent['layout']
}

export class StoredOcrDocAdapter implements DocAdapter {
  private readonly identity: DocIdentity
  private readonly pages: string[]
  private readonly layout: ResolvedDocumentContent['layout']

  constructor(options: StoredOcrOptions) {
    if (!options.ocrText.trim()) {
      throw new Error(`StoredOcrDocAdapter: ocrText vuoto per "${options.title}"`)
    }
    this.identity = {
      praticaId: options.praticaId,
      docId: options.docId,
      title: options.title,
      hash: options.hash,
    }
    this.pages = splitPages(options.ocrText)
    this.layout = normalizeStoredOcrLayout(options.ocrLayout)
  }

  getIdentity(): DocIdentity {
    return { ...this.identity }
  }

  async getDocMeta(): Promise<DocMeta> {
    return {
      ...this.identity,
      pages: this.pages.length,
      source: 'database-ocr',
      textLength: this.pages.reduce((sum, page) => sum + page.length, 0),
    }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    for (let index = 0; index < this.pages.length; index++) {
      const pageNumber = index + 1
      const layout =
        this.layout.find(page => page.page === pageNumber) ??
        this.layout[index]
      const layoutTokens = layoutPageToTokens(layout)
      yield {
        page: pageNumber,
        tokens: layoutTokens.length > 0
          ? layoutTokens
          : tokenizePlainTextAsPage(this.pages[index]),
      }
    }
  }
}

/** True se il documento in store ha già testo OCR usabile. */
export function hasStoredOcrText(doc: Pick<Documento, 'ocrText'>): boolean {
  return Boolean(doc.ocrText?.trim())
}
