import { createWorker } from 'tesseract.js'
import { Canvas, Image, ImageData, Path2D, DOMMatrix } from '@napi-rs/canvas'
import fs from 'fs'
import { gzipSync } from 'zlib'
import path from 'path'
import { createRequire } from 'module'
import { storageService } from '../lib/storage.js'
import { OcrResult } from '../types/index.js'
import { config } from '../config/index.js'

// Polyfill process.getBuiltinModule for tesseract.js under ESM/Node 20
const require = createRequire(import.meta.url)
;(process as any).getBuiltinModule = (process as any).getBuiltinModule || ((name: string) => require('node:' + name))

// Use pdf.js legacy CJS via require for Node stability
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

// Provide global constructors expected by pdf.js in Node (only if available)
;(globalThis as any).ImageData = ImageData
;(globalThis as any).Path2D = Path2D  
;(globalThis as any).DOMMatrix = DOMMatrix
;(globalThis as any).Image = Image

// Patch drawImage to accept ImageData objects by converting to a temporary canvas
const CtxProto: any = (Canvas as any).CanvasRenderingContext2D?.prototype
if (CtxProto && !CtxProto.__drawImagePatched) {
  const originalDrawImage = CtxProto.drawImage
  CtxProto.drawImage = function patchedDrawImage(img: any, ...rest: any[]) {
    const looksLikeImageData = img && typeof img.width === 'number' && typeof img.height === 'number' && img.data && typeof img.data.length === 'number'
    if (looksLikeImageData) {
      const tmp = (Canvas as any).createCanvas(img.width, img.height)
      const tctx = tmp.getContext('2d')
      const id = tctx.createImageData(img.width, img.height)
      id.data.set(img.data)
      tctx.putImageData(id, 0, 0)
      return originalDrawImage.call(this, tmp, ...rest)
    }
    return originalDrawImage.call(this, img, ...rest)
  }
  CtxProto.__drawImagePatched = true
}

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = Canvas.createCanvas(width, height) as any
    const context = canvas.getContext('2d')
    return { canvas, context }
  }
  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

export interface OcrLayoutPageWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrLayoutPage { page: number; width: number; height: number; words: OcrLayoutPageWord[] }

export class TesseractOcrService {
  async extract(
    s3Key: string,
    onProgress?: (progress01: number, meta?: { currentPage?: number; totalPages?: number }) => void | Promise<void>
  ): Promise<OcrResult & { layout: OcrLayoutPage[] }> {
    try {
      const buffer = await storageService.getObject(s3Key)
      const isPdf = s3Key.toLowerCase().endsWith('.pdf') || buffer.slice(0, 5).toString('utf-8').includes('%PDF-')

      const tessdataLocalDir = path.resolve(process.cwd(), 'tessdata')
      if (!fs.existsSync(tessdataLocalDir)) fs.mkdirSync(tessdataLocalDir, { recursive: true })

      const langCode = 'ita'
      const trainedFile = path.join(tessdataLocalDir, `${langCode}.traineddata`)
      const gzFile = path.join(tessdataLocalDir, `${langCode}.traineddata.gz`)
      if (!fs.existsSync(gzFile)) {
        if (!fs.existsSync(trainedFile)) {
          const url = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${langCode}.traineddata`
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Failed to download traineddata: ${res.status} ${res.statusText}`)
          const arrBuf = await res.arrayBuffer()
          await fs.promises.writeFile(trainedFile, Buffer.from(arrBuf))
        }
        const raw = await fs.promises.readFile(trainedFile)
        const gz = gzipSync(raw)
        await fs.promises.writeFile(gzFile, gz)
      }

      const worker = await createWorker({ langPath: tessdataLocalDir, cacheMethod: 'none' })
      const langs = (config.OCR_LANG || 'ita')
      await worker.loadLanguage(langs)
      await worker.initialize(langs)
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' } as any)

      if (isPdf) {
        const pdfBytes = new Uint8Array(buffer)
        const pdf = await getDocument({ data: pdfBytes, disableWorker: true as any, isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, disableRange: true, canvasFactory: new NodeCanvasFactory() } as any).promise
        const total = pdf.numPages
        const pages: { text: string; confidence: number }[] = []
        const layout: OcrLayoutPage[] = []
        for (let p = 1; p <= total; p++) {
          const page = await pdf.getPage(p)
          const viewport = page.getViewport({ scale: 3 })
          const factory = new NodeCanvasFactory()
          const { canvas, context } = factory.create(viewport.width, viewport.height)
          const ctxAny: any = context as any
          if (!ctxAny.__drawImagePatched) {
            const originalDrawImage = ctxAny.drawImage?.bind(ctxAny)
            if (originalDrawImage) {
              ctxAny.drawImage = (img: any, ...rest: any[]) => {
                const looksLikeImageData = img && typeof img.width === 'number' && typeof img.height === 'number' && img.data && typeof img.data.length === 'number'
                if (looksLikeImageData) {
                  const tmp = (Canvas as any).createCanvas(img.width, img.height)
                  const tctx = tmp.getContext('2d')
                  const id = tctx.createImageData(img.width, img.height)
                  id.data.set(img.data)
                  tctx.putImageData(id, 0, 0)
                  return originalDrawImage(tmp, ...rest)
                }
                return originalDrawImage(img, ...rest)
              }
              ctxAny.__drawImagePatched = true
            }
          }
          const renderContext: any = { canvasContext: context, viewport }
          await (page as any).render(renderContext).promise
          const pngBuffer = (canvas as any).toBuffer('image/png') as Buffer
          const { data } = await worker.recognize(pngBuffer, { tessedit_create_tsv: '1' } as any)
          pages.push({ text: data.text, confidence: data.confidence })
          const words = (data.words ?? []).map((w: any) => {
            const x0 = w.bbox?.x0 ?? w.bbox?.x ?? 0
            const y0 = w.bbox?.y0 ?? w.bbox?.y ?? 0
            const x1 = (w.bbox?.x1 != null) ? w.bbox.x1 : ((w.bbox?.w != null) ? x0 + (w.bbox.w ?? 0) : x0)
            const y1 = (w.bbox?.y1 != null) ? w.bbox.y1 : ((w.bbox?.h != null) ? y0 + (w.bbox.h ?? 0) : y0)
            return { text: w.text, x0, y0, x1, y1 }
          })
          layout.push({ page: p, width: canvas.width, height: canvas.height, words })
          if (onProgress) await onProgress(p / total, { currentPage: p, totalPages: total })
          factory.destroy({ canvas, context })
        }
        await worker.terminate()
        const avg = pages.length ? pages.reduce((a, b) => a + b.confidence, 0) / pages.length : 0
        return { pages, avgConfidence: avg, layout }
      } else {
        const { data } = await worker.recognize(buffer, { tessedit_create_tsv: '1' } as any)
        await worker.terminate()
        const pages = [{ text: data.text, confidence: data.confidence }]
        const layout: OcrLayoutPage[] = [{ page: 1, width: 0, height: 0, words: (data.words ?? []).map((w: any) => {
          const x0 = w.bbox?.x0 ?? w.bbox?.x ?? 0
          const y0 = w.bbox?.y0 ?? w.bbox?.y ?? 0
          const x1 = (w.bbox?.x1 != null) ? w.bbox.x1 : ((w.bbox?.w != null) ? x0 + (w.bbox.w ?? 0) : x0)
          const y1 = (w.bbox?.y1 != null) ? w.bbox.y1 : ((w.bbox?.h != null) ? y0 + (w.bbox.h ?? 0) : y0)
          return { text: w.text, x0, y0, x1, y1 }
        }) }]
        return { pages, avgConfidence: data.confidence, layout }
      }
    } catch (error) {
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export type IOcrService = TesseractOcrService

