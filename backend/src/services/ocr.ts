import { createWorker } from 'tesseract.js'
import * as Canvas from 'canvas'
import fs from 'fs'
import { gzipSync } from 'zlib'
import path from 'path'
import { createRequire } from 'module'

// Polyfill process.getBuiltinModule for tesseract.js under ESM/Node 20
const require = createRequire(import.meta.url)
;(process as any).getBuiltinModule = (process as any).getBuiltinModule || ((name: string) => require('node:' + name))

// Use pdf.js legacy CJS via require for Node stability
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

// Provide global constructors expected by pdf.js in Node (only if available)
if (typeof (globalThis as any).ImageData === 'undefined' && (Canvas as any).ImageData) {
  ;(globalThis as any).ImageData = (Canvas as any).ImageData
}
if (typeof (globalThis as any).Path2D === 'undefined' && (Canvas as any).Path2D) {
  ;(globalThis as any).Path2D = (Canvas as any).Path2D
}
if (typeof (globalThis as any).DOMMatrix === 'undefined' && (Canvas as any).DOMMatrix) {
  ;(globalThis as any).DOMMatrix = (Canvas as any).DOMMatrix
}
if (typeof (globalThis as any).Image === 'undefined' && (Canvas as any).Image) {
  ;(globalThis as any).Image = (Canvas as any).Image
}

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
import { storageService } from '../lib/storage.js'
import { OcrResult } from '../types/index.js'
import { config } from '../config/index.js'

export interface OcrLayoutPageWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrLayoutPage { page: number; width: number; height: number; words: OcrLayoutPageWord[] }

export interface IOcrService {
  extract(
    s3Key: string,
    onProgress?: (progress01: number, meta?: { currentPage?: number; totalPages?: number }) => void | Promise<void>
  ): Promise<OcrResult & { layout: OcrLayoutPage[] }>
}

export class TesseractOcrService implements IOcrService {
  async extract(
    s3Key: string,
    onProgress?: (progress01: number, meta?: { currentPage?: number; totalPages?: number }) => void | Promise<void>
  ): Promise<OcrResult & { layout: OcrLayoutPage[] }> {
    try {
      // Get file from storage
      const buffer = await storageService.getObject(s3Key)
      
      // If it's a PDF, render page-by-page via pdf.js
      const isPdf = s3Key.toLowerCase().endsWith('.pdf') || buffer.slice(0, 5).toString('utf-8').includes('%PDF-')

      // Resolve Tesseract language data path (ensure local tessdata)
      const tessdataLocalDir = path.resolve(process.cwd(), 'tessdata')
      if (!fs.existsSync(tessdataLocalDir)) fs.mkdirSync(tessdataLocalDir, { recursive: true })

      // Ensure ita.traineddata exists locally to avoid remote fetch/404
      const langCode = 'ita'
      const trainedFile = path.join(tessdataLocalDir, `${langCode}.traineddata`)
      const gzFile = path.join(tessdataLocalDir, `${langCode}.traineddata.gz`)
      if (!fs.existsSync(gzFile)) {
        if (!fs.existsSync(trainedFile)) {
          // Try fast tessdata (raw)
          const url = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${langCode}.traineddata`
          console.log('OCR: downloading traineddata', { url })
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Failed to download traineddata: ${res.status} ${res.statusText}`)
          const arrBuf = await res.arrayBuffer()
          await fs.promises.writeFile(trainedFile, Buffer.from(arrBuf))
        }
        // Create gzip version expected by tesseract.js v4
        const raw = await fs.promises.readFile(trainedFile)
        const gz = gzipSync(raw)
        await fs.promises.writeFile(gzFile, gz)
      }
      const langPath = tessdataLocalDir

      console.log('OCR: starting', { s3Key, isPdf })
      // Tesseract v4 worker
      const worker = await createWorker({
        langPath,
        cacheMethod: 'none',
      })
      await worker.loadLanguage('ita')
      await worker.initialize('ita')

      if (isPdf) {
        // In Node use legacy build and disable worker thread
        const pdfBytes = new Uint8Array(buffer)
        const pdf = await getDocument({
          data: pdfBytes,
          // v4 options for Node stability
          disableWorker: true as any,
          isEvalSupported: false,
          useWorkerFetch: false,
          disableFontFace: true,
          disableRange: true,
          canvasFactory: new NodeCanvasFactory(),
        } as any).promise
        const total = pdf.numPages
        console.log('OCR: PDF detected, total pages', total)
        const pages: { text: string; confidence: number }[] = []
        const layout: OcrLayoutPage[] = []
        for (let p = 1; p <= total; p++) {
          const page = await pdf.getPage(p)
          const viewport = page.getViewport({ scale: 2 })
          const factory = new NodeCanvasFactory()
          const { canvas, context } = factory.create(viewport.width, viewport.height)
          // Patch drawImage on this context to accept ImageData inputs
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
          console.log('OCR: rendering page', { page: p, width: canvas.width, height: canvas.height })
          await (page as any).render(renderContext).promise
          // Pass a PNG buffer to tesseract to avoid cross-thread canvas issues
          const pngBuffer = (canvas as any).toBuffer('image/png') as Buffer
          const { data } = await worker.recognize(pngBuffer, { tessedit_create_tsv: '1', load_system_dawg: '0', load_freq_dawg: '0' } as any)
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
          console.log('OCR: page processed', { page: p, total })
          factory.destroy({ canvas, context })
        }
        await worker.terminate()
        const avg = pages.length ? pages.reduce((a, b) => a + b.confidence, 0) / pages.length : 0
        console.log('OCR: finished PDF', { pages: total, avgConfidence: avg.toFixed(2) })
        return { pages, avgConfidence: avg, layout }
      } else {
        const { data } = await worker.recognize(buffer, { tessedit_create_tsv: '1', load_system_dawg: '0', load_freq_dawg: '0' } as any)
      await worker.terminate()
        const pages = [{ text: data.text, confidence: data.confidence }]
        const layout: OcrLayoutPage[] = [{
          page: 1,
          width: 0,
          height: 0,
          words: (data.words ?? []).map((w: any) => {
            const x0 = w.bbox?.x0 ?? w.bbox?.x ?? 0
            const y0 = w.bbox?.y0 ?? w.bbox?.y ?? 0
            const x1 = (w.bbox?.x1 != null) ? w.bbox.x1 : ((w.bbox?.w != null) ? x0 + (w.bbox.w ?? 0) : x0)
            const y1 = (w.bbox?.y1 != null) ? w.bbox.y1 : ((w.bbox?.h != null) ? y0 + (w.bbox.h ?? 0) : y0)
            return { text: w.text, x0, y0, x1, y1 }
          })
        }]
        console.log('OCR: finished image', { avgConfidence: data.confidence })
        return { pages, avgConfidence: data.confidence, layout }
      }
    } catch (error) {
      console.error('OCR Error:', error)
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

// Provider selector (ocrmypdf | tesseractjs)
let _ocrService: IOcrService | undefined
export const ocrService: IOcrService = (() => {
  if (_ocrService) return _ocrService as IOcrService
  if (config.OCR_ENGINE === 'ocrmypdf') {
    const { OcrmypdfService } = require('./ocr-ocrmypdf.js')
    _ocrService = new OcrmypdfService((key: string) => storageService.getObject(key))
  } else {
    _ocrService = new TesseractOcrService()
  }
  return _ocrService as IOcrService
})()