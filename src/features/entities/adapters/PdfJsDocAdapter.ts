import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore - Vite will turn this into a URL string (UMD worker path)
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker

import { api } from '../../../lib/api'
import type { Documento } from '../../../types'
import type { DocAdapter } from '../extract-orchestrator'

export class PdfJsDocAdapter implements DocAdapter {
  private readonly docId: string
  private readonly title: string
  private readonly praticaId?: string
  private readonly hash: string
  private readonly url: string
  private pdfDoc: any | null = null

  constructor(opts: { praticaId?: string; docId: string; title: string; hash: string; url: string }) {
    this.praticaId = opts.praticaId
    this.docId = opts.docId
    this.title = opts.title
    this.hash = opts.hash
    this.url = opts.url
  }

  private async ensureLoaded() {
    if (this.pdfDoc) return this.pdfDoc
    const task = (pdfjsLib as any).getDocument({ url: this.url })
    this.pdfDoc = await task.promise
    return this.pdfDoc
  }

  async getDocMeta(): Promise<{ praticaId?: string; docId: string; title: string; pages: number; hash: string }> {
    const doc = await this.ensureLoaded()
    const pages = doc?.numPages || 0
    return { praticaId: this.praticaId, docId: this.docId, title: this.title, pages, hash: this.hash }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: Array<{ text: string; x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }> }, void> {
    const doc = await this.ensureLoaded()
    const total = doc?.numPages || 0
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p)
      const vp = page.getViewport({ scale: 1, rotation: (page as any).rotate || 0 })
      const content = await page.getTextContent()
      const tokens: Array<{ text: string; x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }> = []
      for (const it of (content.items as any[])) {
        const s: string = String(it.str || '')
        if (!s) continue
        const tx: number[] = it.transform as any
        const width: number = (it.width as number) || 0
        const height: number = (it.height as number) || 0
        const xLeft = (tx[4] as number) || 0
        const yTop = (tx[5] as number) - height // top in PDF coords
        const yBottom = yTop + height
        const cw = width / Math.max(1, s.length)

        // Split into non-space chunks to get more granular tokens
        let m: RegExpExecArray | null
        const re = /\S+/g
        while ((m = re.exec(s))) {
          const seg = m[0]
          const start = m.index
          const end = start + seg.length
          const l = xLeft + cw * start
          const r = xLeft + cw * end
          const x0Pct = l / vp.width
          const x1Pct = r / vp.width
          const y0Pct = (vp.height - yBottom) / vp.height
          const y1Pct = (vp.height - yTop) / vp.height
          tokens.push({ text: seg, x0Pct, x1Pct, y0Pct, y1Pct })
        }
      }
      yield { page: p, tokens }
    }
  }
}

export async function buildPdfJsAdaptersFromDocs(docs: Documento[], preferOcrPdf = true): Promise<PdfJsDocAdapter[]> {
  return docs.map(d => {
    const url = preferOcrPdf && d.ocrPdfKey ? api.getLocalFileUrl(d.ocrPdfKey) : api.getLocalFileUrl(d.s3Key)
    return new PdfJsDocAdapter({ praticaId: d.praticaId, docId: d.id, title: d.filename, hash: d.hash, url })
  })
}


