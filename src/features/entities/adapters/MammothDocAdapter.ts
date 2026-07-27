/**
 * Adapter Word (.docx): estrae testo grezzo con mammoth e lo espone come DocAdapter.
 */

import mammoth from 'mammoth'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from './types'
import { tokenizePlainTextAsPage } from './plain-text-tokens'

export class MammothDocAdapter implements DocAdapter {
  private readonly identity: DocIdentity
  private readonly url: string
  private text: string | null = null

  constructor(opts: { praticaId?: string; docId: string; title: string; hash: string; url: string }) {
    this.identity = {
      praticaId: opts.praticaId,
      docId: opts.docId,
      title: opts.title,
      hash: opts.hash,
    }
    this.url = opts.url
  }

  getIdentity(): DocIdentity {
    return { ...this.identity }
  }

  private async ensureText(): Promise<string> {
    if (this.text !== null) return this.text
    const response = await fetch(this.url)
    if (!response.ok) {
      throw new Error(`Impossibile scaricare ${this.identity.title} (HTTP ${response.status})`)
    }
    const buffer = await response.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    this.text = String(result.value || '')
    return this.text
  }

  async getDocMeta(): Promise<DocMeta> {
    const text = await this.ensureText()
    return { ...this.identity, pages: 1, source: 'docx', textLength: text.length }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    const text = await this.ensureText()
    yield { page: 1, tokens: tokenizePlainTextAsPage(text) }
  }
}
