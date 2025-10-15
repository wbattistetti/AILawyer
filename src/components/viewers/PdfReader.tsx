import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// pdf.js setup for Vite
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore - Vite will turn this into a URL string (UMD worker path)
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker

interface PdfReaderProps {
  fileUrl: string
  onVisiblePageChange?: (page: number) => void
  visiblePageExternal?: number
  onScrollTopChange?: (scrollTop: number, maxScroll: number) => void
  externalScrollTop?: number
  hideScrollbar?: boolean
  hideToolbar?: boolean
  externalScrollContainer?: React.RefObject<HTMLDivElement>
  idPrefix?: string
  useExternalScroll?: boolean
  onPagesMetrics?: (metrics: { page: number; width: number; height: number }[]) => void
  onPagesLayout?: (layouts: { page: number; widthPx: number; heightPx: number }[]) => void
  fitToWidth?: boolean
  // deskew support (optional)
  autoDeskewExternal?: boolean
  skewAngles?: Record<number, number> // pageNumber -> degrees
}

interface PageRenderState {
  renderedScale: number
}

export function PdfReader({ fileUrl, onVisiblePageChange, visiblePageExternal, onScrollTopChange, externalScrollTop, hideScrollbar, hideToolbar, externalScrollContainer, idPrefix = 'pdf', useExternalScroll = false, onPagesMetrics, onPagesLayout, fitToWidth = true, autoDeskewExternal, skewAngles = {} }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pageInputRef = useRef<HTMLInputElement | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState<number>(1.0)
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null)
  const [manualZoom, setManualZoom] = useState<boolean>(false)
  const [pageInput, setPageInput] = useState<string>('1')
  const pageCanvases = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const pageStates = useRef<Map<number, PageRenderState>>(new Map())
  const observers = useRef<Map<number, IntersectionObserver>>(new Map())
  const currentPageRef = useRef<number>(1)
  const programmaticScrollRef = useRef(false)
  const renderTasksRef = useRef<Map<number, any>>(new Map())
  const pageBaseWidthsRef = useRef<Map<number, number>>(new Map())
  const [autoDeskew, setAutoDeskew] = useState<boolean>(false)

  const dpr = useMemo(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), [])

  useEffect(() => {
    if (typeof autoDeskewExternal === 'boolean') setAutoDeskew(autoDeskewExternal)
  }, [autoDeskewExternal])

  const drawWithDeskew = useCallback(async (canvas: HTMLCanvasElement, page: any, viewport: any, dprVal: number, angleDeg: number) => {
    const off = document.createElement('canvas')
    off.width = Math.ceil(viewport.width * dprVal)
    off.height = Math.ceil(viewport.height * dprVal)
    const offCtx = off.getContext('2d')!
    const transform = dprVal !== 1 ? [dprVal, 0, 0, dprVal, 0, 0] : undefined
    await page.render({ canvasContext: offCtx as any, viewport, transform } as any).promise
    const ctx = canvas.getContext('2d')!
    const angle = (angleDeg || 0) * Math.PI / 180
    if (!angleDeg || Math.abs(angleDeg) < 0.5) {
      canvas.width = off.width; canvas.height = off.height
      ctx.drawImage(off, 0, 0)
    } else {
      const w = off.width, h = off.height
      const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
      const bw = Math.ceil(w * cos + h * sin)
      const bh = Math.ceil(w * sin + h * cos)
      canvas.width = bw; canvas.height = bh
      ctx.save()
      ctx.translate(bw/2, bh/2)
      ctx.rotate(angle)
      ctx.drawImage(off, -w/2, -h/2)
      ctx.restore()
    }
  }, [])

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
          const vp = first.getViewport({ scale: 1, rotation: (first as any).rotate || 0 })
          setBasePageWidth(vp.width)
        } catch {}

        // Emit per-page metrics (width/height at scale 1) for alignment in split view
        if (onPagesMetrics && doc?.numPages) {
          try {
            const metrics: { page: number; width: number; height: number }[] = []
            for (let p = 1; p <= doc.numPages; p++) {
              const page = await doc.getPage(p)
              const vp = page.getViewport({ scale: 1 })
              metrics.push({ page: p, width: vp.width, height: vp.height })
            }
            if (!cancelled) onPagesMetrics(metrics)
          } catch {
            // ignore
          }
        }
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

  // Fit after base page width known
  useEffect(() => {
    if (!fitToWidth) return
    if (!basePageWidth || !containerRef.current) return
    const avail = Math.max(100, containerRef.current.clientWidth - 24)
    const next = Math.min(4, Math.max(0.2, avail / basePageWidth))
    setScale(next)
  }, [basePageWidth, fitToWidth])

	const renderPage = useCallback(async (pageNumber: number, targetScale?: number) => {
    if (!pdfDoc) return
    const page = await pdfDoc.getPage(pageNumber)
    const useScale = typeof targetScale === 'number' ? targetScale : scale
    const viewport = page.getViewport({ scale: useScale, rotation: (page as any).rotate || 0 })
    const canvas = pageCanvases.current.get(pageNumber)
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return

    const outputScale = dpr

		const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
		// Cancel previous render of this page if still running
    const prev = renderTasksRef.current.get(pageNumber)
    try { prev?.cancel?.() } catch {}
		const angleDeg = autoDeskew ? (skewAngles?.[pageNumber] || 0) : 0
		let renderTask: any
		if (!angleDeg || Math.abs(angleDeg) < 0.5) {
			canvas.width = Math.floor(viewport.width * outputScale)
			canvas.height = Math.floor(viewport.height * outputScale)
			renderTask = page.render({ canvasContext: context, viewport, transform } as any)
		} else {
			// offscreen render + rotate
			renderTask = { promise: drawWithDeskew(canvas, page, viewport, outputScale, angleDeg), cancel: () => {} }
		}
    renderTasksRef.current.set(pageNumber, renderTask)
    try {
      await renderTask.promise
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('pdf render cancelled or failed', e)
    }
		// style size after render (handles both branches)
		canvas.style.width = Math.floor(canvas.width / outputScale) + 'px'
		canvas.style.height = Math.floor(canvas.height / outputScale) + 'px'
    pageStates.current.set(pageNumber, { renderedScale: useScale })
    // Emit current page canvas sizes for alignment consumers
    if (onPagesLayout) {
      const layouts: { page: number; widthPx: number; heightPx: number }[] = []
      pageCanvases.current.forEach((cv, p) => {
        layouts.push({ page: p, widthPx: cv.clientWidth, heightPx: cv.clientHeight })
      })
      onPagesLayout(layouts)
    }
	}, [pdfDoc, scale, dpr, autoDeskew, skewAngles, drawWithDeskew, onPagesLayout])

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
    }, { root: externalScrollContainer?.current || containerRef.current, rootMargin: '1200px 0px', threshold: 0.01 })
    observer.observe(el)
    observers.current.set(pageNumber, observer)
  }, [renderPage, scale])

  const updateCurrentPage = useCallback(() => {
    const container = externalScrollContainer?.current || containerRef.current
    if (!container || !numPages) return
    const contRect = container.getBoundingClientRect()
    const probeY = contRect.top + Math.min(200, contRect.height * 0.25)
    let bestPage = 1
    let bestDist = Number.POSITIVE_INFINITY
    for (let p = 1; p <= numPages; p++) {
      const el = document.getElementById(`${idPrefix}-page-${p}`)
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
      if (onVisiblePageChange && !programmaticScrollRef.current) {
        onVisiblePageChange(bestPage)
      }
      // Recompute fit-to-width using the actual page width if available
      if (fitToWidth && pdfDoc) {
        const cached = pageBaseWidthsRef.current.get(bestPage)
        const applyFit = (w: number | null) => {
          if (!w || !containerRef.current) return
          const avail = Math.max(100, containerRef.current.clientWidth - 24)
          const next = Math.min(4, Math.max(0.2, avail / w))
          setBasePageWidth(w)
          setScale(next)
        }
        if (typeof cached === 'number') {
          applyFit(cached)
        } else {
          // Load page width once and cache
          pdfDoc.getPage(bestPage).then((p: any) => {
            const vp = p.getViewport({ scale: 1, rotation: p.rotate || 0 })
            pageBaseWidthsRef.current.set(bestPage, vp.width)
            applyFit(vp.width)
          }).catch(() => {})
        }
      }
      if (programmaticScrollRef.current) {
        // reset the flag after the first update caused by programmatic scroll
        programmaticScrollRef.current = false
      }
    }
  }, [numPages])

  useEffect(() => {
    const el = externalScrollContainer?.current || containerRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          updateCurrentPage()
          if (onScrollTopChange) {
            const max = el.scrollHeight - el.clientHeight
            onScrollTopChange(el.scrollTop, max)
          }
          ticking = false
        })
      }
    }
    const onResize = () => {
      if (!fitToWidth) return
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
  }, [updateCurrentPage, basePageWidth, fitToWidth])

  // Recompute fit-to-width when external page changes (keeps next pages same fit)
  useEffect(() => {
    if (!fitToWidth) return
    if (!basePageWidth || !containerRef.current) return
    const avail = Math.max(100, containerRef.current.clientWidth - 24)
    const next = Math.min(4, Math.max(0.2, avail / basePageWidth))
    setScale(next)
  }, [visiblePageExternal, basePageWidth, fitToWidth])

  useEffect(() => {
    // re-render visible pages on scale change
    observers.current.forEach((_obs, pageNumber) => {
      const state = pageStates.current.get(pageNumber)
      const need = !state || Math.abs(state.renderedScale - scale) > 0.01
      if (need) {
        renderPage(pageNumber)
      }
    })
    // Emit layout after scale changes as well
    if (onPagesLayout) {
      const layouts: { page: number; widthPx: number; heightPx: number }[] = []
      pageCanvases.current.forEach((cv, p) => {
        layouts.push({ page: p, widthPx: cv.clientWidth, heightPx: cv.clientHeight })
      })
      onPagesLayout(layouts)
    }
  }, [scale, renderPage])

  const handleZoomIn = () => { setManualZoom(true); setScale(s => Math.min(4, Math.round((s + 0.1) * 10) / 10)) }
  const handleZoomOut = () => { setManualZoom(true); setScale(s => Math.max(0.2, Math.round((s - 0.1) * 10) / 10)) }
  const handleFit = () => {
    if (!basePageWidth || !containerRef.current) return
    setManualZoom(false)
    const avail = Math.max(100, containerRef.current.clientWidth - 24)
    const next = Math.min(4, Math.max(0.2, avail / basePageWidth))
    setScale(next)
  }
  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault()
    const p = Math.max(1, Math.min(numPages || 1, parseInt(pageInput || '1', 10)))
    const el = document.getElementById(`${idPrefix}-page-${p}`)
    if (el && (externalScrollContainer?.current || containerRef.current)) {
      programmaticScrollRef.current = true
      el.scrollIntoView({ block: 'start' })
    }
  }

  // External page sync
  useEffect(() => {
    if (!visiblePageExternal || !numPages) return
    if (visiblePageExternal === currentPageRef.current) return
    const p = Math.max(1, Math.min(numPages, visiblePageExternal))
    const el = document.getElementById(`${idPrefix}-page-${p}`)
    if (el && (externalScrollContainer?.current || containerRef.current)) {
      programmaticScrollRef.current = true
      el.scrollIntoView({ block: 'start' })
    }
  }, [visiblePageExternal, numPages])

  // External scroll sync (for split view single scrollbar)
  useEffect(() => {
    if (typeof externalScrollTop !== 'number') return
    if (!containerRef.current) return
    programmaticScrollRef.current = true
    containerRef.current.scrollTop = externalScrollTop
  }, [externalScrollTop])

  return (
    <div className="flex flex-col h-full w-full">
      {!hideToolbar && (
		<div className="flex items-center justify-between border-b px-2 py-1 text-sm">
			<div className="flex items-center gap-2">
            <button className="px-2 py-1 border rounded" onClick={handleZoomOut}>-</button>
            <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
            <button className="px-2 py-1 border rounded" onClick={handleZoomIn}>+</button>
            <button className="px-2 py-1 border rounded" onClick={handleFit} title="Adatta alla larghezza">Fit</button>
        <button className={`px-2 py-1 border rounded ${autoDeskew ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`} onClick={()=>setAutoDeskew(v=>!v)} title={autoDeskew ? 'Mostra originale' : 'Raddrizza quando serve'}>
          {autoDeskew ? 'Deskew ON' : 'Deskew OFF'}
        </button>
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
      )}

      {/* Pages */}
      <div ref={containerRef} className={`flex-1 ${hideScrollbar ? 'overflow-hidden' : (useExternalScroll ? 'overflow-visible' : 'overflow-auto')} bg-muted/30 px-3 py-4`}>
        <div className="mx-auto flex flex-col items-center gap-3" style={{ width: '100%' }}>
          {Array.from({ length: numPages || 0 }, (_, i) => i + 1).map(pageNumber => (
            <div
              key={pageNumber}
              id={`${idPrefix}-page-${pageNumber}`}
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


