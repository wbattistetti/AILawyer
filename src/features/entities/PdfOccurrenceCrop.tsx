/**
 * Renderizza su richiesta il ritaglio della pagina PDF associato a un riscontro.
 */

import { useEffect, useRef, useState } from 'react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
import type { BoxPct } from './entity-index'
import { cropPaddingForLines } from './snippet-line-context'

type PdfDocument = {
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number }
    render: (options: {
      canvasContext: CanvasRenderingContext2D
      viewport: { width: number; height: number }
    }) => { promise: Promise<void> }
  }>
}

const documentCache = new Map<string, Promise<PdfDocument>>()

async function loadPdfDocument(url: string): Promise<PdfDocument> {
  let cached = documentCache.get(url)
  if (!cached) {
    cached = import('pdfjs-dist/legacy/build/pdf.js').then(module => {
      const pdfJs = module as typeof module & {
        GlobalWorkerOptions: { workerSrc: string }
        getDocument: (source: { url: string }) => {
          promise: Promise<PdfDocument>
        }
      }
      pdfJs.GlobalWorkerOptions.workerSrc = pdfWorker
      return pdfJs.getDocument({ url }).promise
    })
    documentCache.set(url, cached)
  }
  return cached
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function expandedCrop(box: BoxPct, linesBefore: number, linesAfter: number): BoxPct {
  const padBefore = cropPaddingForLines(linesBefore)
  const padAfter = cropPaddingForLines(linesAfter)
  return {
    x0Pct: clamp(box.x0Pct - 0.04),
    x1Pct: clamp(box.x1Pct + 0.48),
    y0Pct: clamp(box.y0Pct - padBefore),
    y1Pct: clamp(box.y1Pct + padAfter),
  }
}

export type PdfOccurrenceCropProps = {
  url: string
  page: number
  box: BoxPct
  linesBefore?: number
  linesAfter?: number
}

/** Mostra il contesto visivo originale dell'occorrenza. */
export function PdfOccurrenceCrop({
  url,
  page,
  box,
  linesBefore = 2,
  linesAfter = 2,
}: PdfOccurrenceCropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const crop = expandedCrop(box, linesBefore, linesAfter)
  const cropWidth = Math.max(Number.EPSILON, crop.x1Pct - crop.x0Pct)
  const cropHeight = Math.max(Number.EPSILON, crop.y1Pct - crop.y0Pct)
  const highlightStyle = {
    left: `${((box.x0Pct - crop.x0Pct) / cropWidth) * 100}%`,
    top: `${((box.y0Pct - crop.y0Pct) / cropHeight) * 100}%`,
    width: `${((box.x1Pct - box.x0Pct) / cropWidth) * 100}%`,
    height: `${((box.y1Pct - box.y0Pct) / cropHeight) * 100}%`,
  }

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    void (async () => {
      const pdf = await loadPdfDocument(url)
      const pdfPage = await pdf.getPage(page)
      const viewport = pdfPage.getViewport({ scale: 1.7 })
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = Math.ceil(viewport.width)
      pageCanvas.height = Math.ceil(viewport.height)
      const pageContext = pageCanvas.getContext('2d')
      if (!pageContext) throw new Error('Impossibile inizializzare il rendering PDF')
      await pdfPage.render({ canvasContext: pageContext, viewport }).promise
      if (cancelled) return

      const sourceX = Math.floor(crop.x0Pct * pageCanvas.width)
      const sourceY = Math.floor(crop.y0Pct * pageCanvas.height)
      const sourceWidth = Math.max(1, Math.ceil((crop.x1Pct - crop.x0Pct) * pageCanvas.width))
      const sourceHeight = Math.max(1, Math.ceil((crop.y1Pct - crop.y0Pct) * pageCanvas.height))
      const output = canvasRef.current
      if (!output) return
      output.width = sourceWidth
      output.height = sourceHeight
      const outputContext = output.getContext('2d')
      if (!outputContext) throw new Error('Impossibile creare il ritaglio PDF')
      outputContext.drawImage(
        pageCanvas,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
      )
      setLoading(false)
    })().catch(cause => {
      if (cancelled) return
      setLoading(false)
      setError(cause instanceof Error ? cause.message : 'Ritaglio PDF non disponibile')
    })

    return () => {
      cancelled = true
    }
  }, [box.x0Pct, box.x1Pct, box.y0Pct, box.y1Pct, crop.x0Pct, crop.x1Pct, crop.y0Pct, crop.y1Pct, page, url])

  return (
    <div className="relative mt-2 overflow-hidden rounded border border-neutral-200 bg-white">
      {loading && <div className="p-3 text-xs text-neutral-500">Caricamento scansione…</div>}
      {error && <div className="p-3 text-xs text-red-700" role="alert">{error}</div>}
      <canvas
        ref={canvasRef}
        className={loading || error ? 'hidden' : 'block h-auto w-full'}
        aria-label={`Ritaglio della pagina ${page}`}
      />
      {!loading && !error && (
        <div
          className="pointer-events-none absolute border-2 border-amber-500 bg-yellow-300/25 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
          style={highlightStyle}
          aria-hidden
        />
      )}
    </div>
  )
}

