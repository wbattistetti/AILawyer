/**
 * Adapter PDF basato sul contenuto canonico backend (OCR locale/DB/PDF nativo).
 */

import {
  api,
  type DocumentContentWord,
  type ResolvedDocumentContent,
} from '../../../lib/api'
import { splitAnalysisToken, tokenizePlainTextAsPage } from './plain-text-tokens'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from './types'

type ResolvedContentOptions = {
  praticaId?: string
  docId: string
  title: string
  hash: string
  storageKey?: string
}

const clampPct = (value: number): number => Math.max(0, Math.min(1, value))

const requireContent = (value: ResolvedDocumentContent): ResolvedDocumentContent => {
  if (!value || !Array.isArray(value.pages) || !Array.isArray(value.layout)) {
    throw new Error('Risposta contenuto documento non valida')
  }
  if (!value.pages.every(page => typeof page === 'string')) {
    throw new Error('Pagine contenuto documento non valide')
  }
  if (!value.pages.some(page => page.trim().length > 0)) {
    throw new Error(`Il documento "${value.filename}" non contiene testo analizzabile`)
  }
  return value
}

const splitOcrWord = (
  word: DocumentContentWord,
  width: number,
  height: number
): PageToken[] => {
  const segments = splitAnalysisToken(word.text)
  if (segments.length === 0) return []
  const totalChars = Math.max(1, segments.reduce((sum, segment) => sum + segment.length, 0))
  let usedChars = 0
  return segments.map(segment => {
    const startRatio = usedChars / totalChars
    usedChars += segment.length
    const endRatio = usedChars / totalChars
    const x0 = word.x0 + (word.x1 - word.x0) * startRatio
    const x1 = word.x0 + (word.x1 - word.x0) * endRatio
    return {
      text: segment,
      x0Pct: clampPct(x0 / width),
      x1Pct: clampPct(x1 / width),
      y0Pct: clampPct(word.y0 / height),
      y1Pct: clampPct(word.y1 / height),
    }
  })
}

/** Converte layout OCR validato in token percentuali. */
export function layoutPageToTokens(
  layout: ResolvedDocumentContent['layout'][number] | undefined
): PageToken[] {
  if (!layout?.words?.length) return []
  const maxX = Math.max(1, ...layout.words.map(word => word.x1))
  const maxY = Math.max(1, ...layout.words.map(word => word.y1))
  const width = layout.width && layout.width > 0 ? layout.width : maxX
  const height = layout.height && layout.height > 0 ? layout.height : maxY
  return layout.words.flatMap(word => splitOcrWord(word, width, height))
}

export class ResolvedContentDocAdapter implements DocAdapter {
  private readonly identity: DocIdentity
  private readonly storageKey?: string
  private content: ResolvedDocumentContent | null = null

  constructor(options: ResolvedContentOptions) {
    this.identity = {
      praticaId: options.praticaId,
      docId: options.docId,
      title: options.title,
      hash: options.hash,
    }
    this.storageKey = options.storageKey
  }

  getIdentity(): DocIdentity {
    return { ...this.identity }
  }

  private async ensureContent(): Promise<ResolvedDocumentContent> {
    if (this.content) return this.content
    const content = await api.getDocumentContent({
      docId: this.identity.docId,
      hash: this.identity.hash,
      storageKey: this.storageKey,
      filename: this.identity.title,
    })
    this.content = requireContent(content)
    return this.content
  }

  async getDocMeta(): Promise<DocMeta> {
    const content = await this.ensureContent()
    return {
      ...this.identity,
      pages: content.pages.length,
      source: content.source,
      textLength: content.pages.reduce((sum, page) => sum + page.length, 0),
    }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    const content = await this.ensureContent()
    for (let index = 0; index < content.pages.length; index++) {
      const pageNumber = index + 1
      const layout =
        content.layout.find(page => page.page === pageNumber) ??
        content.layout[index]
      const layoutTokens = layoutPageToTokens(layout)
      yield {
        page: pageNumber,
        tokens: layoutTokens.length > 0
          ? layoutTokens
          : tokenizePlainTextAsPage(content.pages[index]),
      }
    }
  }
}
