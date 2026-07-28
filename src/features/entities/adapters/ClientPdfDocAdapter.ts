/**
 * Adapter PDF in-memory: estrae testo nativo via pdf.js dal localUrl/blob browser.
 * Non richiede DB né file in uploads/.
 */

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from './types'
import { tokenizePlainTextAsPage } from './plain-text-tokens'

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: { url: string }) => {
    promise: Promise<{
      numPages: number
      getPage: (page: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string }>
        }>
      }>
    }>
  }
}

let pdfJsPromise: Promise<PdfJsModule> | null = null

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.js').then(module => {
      const pdfJs = module as unknown as PdfJsModule
      pdfJs.GlobalWorkerOptions.workerSrc = pdfWorker
      return pdfJs
    })
  }
  return pdfJsPromise
}

type ClientPdfOptions = {
  praticaId?: string
  docId: string
  title: string
  hash: string
  url: string
}

/** Estrae le pagine di testo da un URL PDF (blob o file locale). */
export async function extractPdfPagesFromUrl(url: string): Promise<string[]> {
  if (!url.trim()) {
    throw new Error('extractPdfPagesFromUrl: url obbligatorio')
  }
  const pdfJs = await loadPdfJs()
  const pdf = await pdfJs.getDocument({ url }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map(item => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push(text)
  }
  return pages
}

export class ClientPdfDocAdapter implements DocAdapter {
  private readonly identity: DocIdentity
  private readonly url: string
  private pages: string[] | null = null

  constructor(options: ClientPdfOptions) {
    this.identity = {
      praticaId: options.praticaId,
      docId: options.docId,
      title: options.title,
      hash: options.hash,
    }
    this.url = options.url
  }

  getIdentity(): DocIdentity {
    return { ...this.identity }
  }

  private async ensurePages(): Promise<string[]> {
    if (this.pages) return this.pages
    const pages = await extractPdfPagesFromUrl(this.url)
    if (!pages.some(page => page.trim().length > 0)) {
      throw new Error(
        `Il PDF "${this.identity.title}" non contiene testo nativo analizzabile`
      )
    }
    this.pages = pages
    return pages
  }

  async getDocMeta(): Promise<DocMeta> {
    const pages = await this.ensurePages()
    return {
      ...this.identity,
      pages: pages.length,
      source: 'client-pdf',
      textLength: pages.reduce((sum, page) => sum + page.length, 0),
    }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    const pages = await this.ensurePages()
    for (let index = 0; index < pages.length; index++) {
      yield {
        page: index + 1,
        tokens: tokenizePlainTextAsPage(pages[index]),
      }
    }
  }
}
