import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// pdf.js setup for Vite
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore - Vite will turn this into a URL string (UMD worker path)
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker

interface PdfReaderProps {
  fileUrl: string
}

interface PageRenderState {
  renderedScale: number
}

export function PdfReader({ fileUrl }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pageInputRef = useRef<HTMLInputElement | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState<number>(1.0)
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null)
  const [pageInput, setPageInput] = useState<string>('1')
  const pageCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const pageStates = useRef<Map<number, PageRenderState>>(new Map())
  const observers = useRef<Map<number, IntersectionObserver>>(new Map())
  const currentPageRef = useRef<number>(1)

  const dpr = useMemo(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const task = pdfjsLib.getDocument({ url: fileUrl })
        const doc = await task.promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages || 0)
        setPageInput('1')
        try {
          const first = await doc.getPage(1)
          const vp = first.getViewport({ scale: 1 })
          setBasePageWidth(vp.width)
        } catch {}
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Pdf load error:', e)
      }
    })()
    return () => {
      cancelled = true
      observers.current.forEach(obs => obs.disconnect())
      observers.current.clear()
      pageCanvases.current.clear()
      pageStates.current.clear()
    }
  }, [fileUrl])

  const renderPage = useCallback(async (pageNumber: number, targetScale?: number) => {
    if (!pdfDoc) return
    const page = await pdfDoc.getPage(pageNumber)
    const useScale = typeof targetScale === 'number' ? targetScale : scale
    const viewport = page.getViewport({ scale: useScale })
    const canvas = pageCanvases.current.get(pageNumber)
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return

    const outputScale = dpr
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = Math.floor(viewport.width) + 'px'
    canvas.style.height = Math.floor(viewport.height) + 'px'

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
    await page.render({ canvasContext: context, viewport, transform } as any).promise
    pageStates.current.set(pageNumber, { renderedScale: useScale })
  }, [pdfDoc, scale, dpr])

  const ensureObserver = useCallback((pageNumber: number, el: Element) => {
    if (observers.current.has(pageNumber)) return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const state = pageStates.current.get(pageNumber)
          const need = !state || Math.abs(state.renderedScale - scale) > 0.01
          if (need) {
            renderPage(pageNumber)
          }
        }
      }
    }, { root: containerRef.current, rootMargin: '200px 0px', threshold: 0.01 })
    observer.observe(el)
    observers.current.set(pageNumber, observer)
  }, [renderPage, scale])

  const updateCurrentPage = useCallback(() => {
    const container = containerRef.current
    if (!container || !numPages) return
    const contRect = container.getBoundingClientRect()
    const probeY = contRect.top + Math.min(200, contRect.height * 0.25)
    let bestPage = 1
    let bestDist = Number.POSITIVE_INFINITY
    for (let p = 1; p <= numPages; p++) {
      const el = document.getElementById(`pdf-page-${p}`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const inside = r.top <= probeY && r.bottom >= probeY
      const dist = inside ? 0 : Math.min(Math.abs(r.top - probeY), Math.abs(r.bottom - probeY))
      if (dist < bestDist) {
        bestDist = dist
        bestPage = p
        if (dist === 0) break
      }
    }
    if (bestPage !== currentPageRef.current) {
      currentPageRef.current = bestPage
      if (document.activeElement !== pageInputRef.current) {
        setPageInput(String(bestPage))
      }
    }
  }, [numPages])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          updateCurrentPage()
          ticking = false
        })
      }
    }
    const onResize = () => {
      if (!basePageWidth || !containerRef.current) return
      const avail = Math.max(100, containerRef.current.clientWidth - 24)
      const next = Math.min(4, Math.max(0.2, avail / basePageWidth))
      setScale(next)
    }
    el.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onResize)
    // Initialize once
    updateCurrentPage()
    onResize()
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [updateCurrentPage, basePageWidth])

  useEffect(() => {
    // re-render visible pages on scale change
    observers.current.forEach((_obs, pageNumber) => {
      const state = pageStates.current.get(pageNumber)
      const need = !state || Math.abs(state.renderedScale - scale) > 0.01
      if (need) {
        renderPage(pageNumber)
      }
    })
  }, [scale, renderPage])

  const handleZoomIn = () => { setScale(s => Math.min(3, Math.round((s + 0.1) * 10) / 10)) }
  const handleZoomOut = () => { setScale(s => Math.max(0.3, Math.round((s - 0.1) * 10) / 10)) }
  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault()
    const p = Math.max(1, Math.min(numPages || 1, parseInt(pageInput || '1', 10)))
    const el = document.getElementById(`pdf-page-${p}`)
    if (el && containerRef.current) {
      el.scrollIntoView({ block: 'start' })
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-2 py-1 text-sm">
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded" onClick={handleZoomOut}>-</button>
          <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
          <button className="px-2 py-1 border rounded" onClick={handleZoomIn}>+</button>
        </div>
        <form className="flex items-center gap-2" onSubmit={handlePageJump}>
          <input
            className="w-14 border rounded px-2 py-1"
            ref={pageInputRef}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            aria-label="Pagina"
          />
          <span className="text-muted-foreground">/ {numPages || '-'}</span>
          <button className="px-2 py-1 border rounded" type="submit">Vai</button>
        </form>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30 px-3 py-4">
        <div className="mx-auto flex flex-col items-center gap-3" style={{ width: '100%' }}>
          {Array.from({ length: numPages || 0 }, (_, i) => i + 1).map(pageNumber => (
            <div
              key={pageNumber}
              id={`pdf-page-${pageNumber}`}
              className="bg-white shadow-sm border rounded relative"
              style={{
                // page box styles; canvas will size itself
              }}
              ref={(el) => {
                if (!el) return
                ensureObserver(pageNumber, el)
              }}
            >
              <canvas
                ref={(el) => {
                  if (!el) return
                  pageCanvases.current.set(pageNumber, el)
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


