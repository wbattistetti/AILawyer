import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ViewportBox = { x: number; y: number; w: number; h: number }
export type SelectionPayload = {
  pageNumber: number
  viewportBox: ViewportBox
  pdfBox?: { x0: number; y0: number; x1: number; y1: number }
}

function ensureSelectModeStyles() {
  const id = 'pdf-select-mode-styles'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
  .ai-select-mode .rpv-core__text-layer { user-select: none !important; pointer-events: none !important; }
  .ai-select-mode .rpv-core__page-layer { cursor: crosshair !important; }
  .ai-select-mode .rpv-core__page-layer canvas { pointer-events: none !important; }
  .ai-select-root { position:absolute; inset:0; z-index:2000; user-select:none; }
  `
  document.head.appendChild(style)
}

const DEBUG = false
const dlog = (...args: any[]) => { if (DEBUG) try { console.debug(...args) } catch {} }

function SelectionOverlay({ enabled, onSelect, pageNumber }: { enabled: boolean; onSelect: (b: ViewportBox) => void; pageNumber?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const ptrIdRef = useRef<number | null>(null)
  const [box, setBox] = useState<ViewportBox | null>(null)

  const toLocal = (clientX: number, clientY: number) => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!hostRef.current) return
    hostRef.current.setPointerCapture(e.pointerId)
    ptrIdRef.current = e.pointerId
    const p = toLocal(e.clientX, e.clientY)
    startRef.current = { x: p.x, y: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    document.body.style.userSelect = 'none'
    dlog('[SEL][down]', { pageNumber, x: p.x, y: p.y })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!startRef.current || !hostRef.current) return
    if (ptrIdRef.current !== null && e.pointerId !== ptrIdRef.current) return
    const p = toLocal(e.clientX, e.clientY)
    setBox({ x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) })
  }

  const finish = (clientX: number, clientY: number) => {
    if (!startRef.current || !hostRef.current) return
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) }
    if (finalBox.w >= 4 && finalBox.h >= 4) onSelect(finalBox)
    // cleanup
    try { hostRef.current.releasePointerCapture(ptrIdRef.current as any) } catch {}
    startRef.current = null
    ptrIdRef.current = null
    setBox(null)
    document.body.style.removeProperty('user-select')
  }

  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); dlog('[SEL][up]', { pageNumber }); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
  const onPointerLeave = () => { if (ptrIdRef.current != null) onPointerCancel() }

  useEffect(() => {
    const handler = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
    hostRef.current?.addEventListener('ai-select-cancel', handler as any)
    return () => hostRef.current?.removeEventListener('ai-select-cancel', handler as any)
  }, [])

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : 'default', touchAction: 'none' as any }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => { e.preventDefault() }}
    >
      {box && (
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '2px solid rgba(59,130,246,.8)', background: 'rgba(59,130,246,.1)' }} />
      )}
    </div>
  )
}

export function PdfPerPageSelection(_props: any) {
  // Deprecated in favor of SvgSelectLayer
  const [tick, setTick] = useState(0)
  const pageLayerByNum = useRef<Map<number, HTMLElement>>(new Map())
  const selectRootByNum = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureSelectModeStyles()

    const apply = () => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      dlog('[SEL][apply] pages=', pages.length)
      for (let i = 0; i < pages.length; i++) {
        const pl = pages[i]
        const holder = pl.closest('[data-page-number]') as HTMLElement | null
        const parsed = holder ? parseInt(holder.getAttribute('data-page-number') || '', 10) : NaN
        const pageNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : i + 1
        pageLayerByNum.current.set(pageNumber, pl)
        let sel = selectRootByNum.current.get(pageNumber)
        if (!sel) {
          sel = document.createElement('div')
          sel.className = 'ai-select-root'
          if (!pl.style.position) pl.style.position = 'relative'
          pl.appendChild(sel)
          selectRootByNum.current.set(pageNumber, sel)
          dlog('[SEL][mount-root]', { pageNumber })
        }
        Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
        // also prevent native layers from stealing events when enabled
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        // page layer cursor hint
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
      setTick((t) => t + 1)
    }

    apply()
    const mo = new MutationObserver(apply)
    mo.observe(host, { subtree: true, childList: true, attributes: false })
    const onAny = () => apply()
    const scs = [host.querySelector('.rpv-core__inner') as HTMLElement | null, host.querySelector('.rpv-core__pages') as HTMLElement | null, host.querySelector('.rpv-core__viewer') as HTMLElement | null].filter(Boolean) as HTMLElement[]
    scs.forEach((sc) => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
    window.addEventListener('resize', onAny)
    return () => { mo.disconnect(); scs.forEach((sc) => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
  }, [hostRef, enabled])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Update existing roots and page layers on toggle
    selectRootByNum.current.forEach((sel, pageNumber) => {
      Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
      const pl = pageLayerByNum.current.get(pageNumber)
      if (pl) {
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
    })
  }, [hostRef, enabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { selectRootByNum.current.forEach((root) => { root.dispatchEvent(new CustomEvent('ai-select-cancel')) }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const portals = useMemo(() => {
    const items: React.ReactNode[] = []
    selectRootByNum.current.forEach((root, pageNumber) => {
      items.push(
        createPortal(
          <SelectionOverlay
            key={`sel-${pageNumber}-${tick}`}
            enabled={enabled}
            pageNumber={pageNumber}
            onSelect={(viewportBox) => {
              let pdfBox: { x0: number; y0: number; x1: number; y1: number } | undefined
              const vp = resolveViewport?.(pageNumber)
              if (vp && typeof vp.convertToPdfPoint === 'function') {
                const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
                const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
                pdfBox = { x0, y0, x1, y1 }
              }
              onSelection({ pageNumber, viewportBox, pdfBox })
            }}
          />,
          root
        )
      )
    })
    return items
  }, [enabled, resolveViewport, onSelection, tick])

  return <>{portals}</>
}




type ViewportBox = { x: number; y: number; w: number; h: number }
export type SelectionPayload = {
  pageNumber: number
  viewportBox: ViewportBox
  pdfBox?: { x0: number; y0: number; x1: number; y1: number }
}

function ensureSelectModeStyles() {
  const id = 'pdf-select-mode-styles'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
  .ai-select-mode .rpv-core__text-layer { user-select: none !important; pointer-events: none !important; }
  .ai-select-mode .rpv-core__page-layer { cursor: crosshair !important; }
  .ai-select-mode .rpv-core__page-layer canvas { pointer-events: none !important; }
  .ai-select-root { position:absolute; inset:0; z-index:2000; user-select:none; }
  `
  document.head.appendChild(style)
}

const DEBUG = false
const dlog = (...args: any[]) => { if (DEBUG) try { console.debug(...args) } catch {} }

function SelectionOverlay({ enabled, onSelect, pageNumber }: { enabled: boolean; onSelect: (b: ViewportBox) => void; pageNumber?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const ptrIdRef = useRef<number | null>(null)
  const [box, setBox] = useState<ViewportBox | null>(null)

  const toLocal = (clientX: number, clientY: number) => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!hostRef.current) return
    hostRef.current.setPointerCapture(e.pointerId)
    ptrIdRef.current = e.pointerId
    const p = toLocal(e.clientX, e.clientY)
    startRef.current = { x: p.x, y: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    document.body.style.userSelect = 'none'
    dlog('[SEL][down]', { pageNumber, x: p.x, y: p.y })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!startRef.current || !hostRef.current) return
    if (ptrIdRef.current !== null && e.pointerId !== ptrIdRef.current) return
    const p = toLocal(e.clientX, e.clientY)
    setBox({ x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) })
  }

  const finish = (clientX: number, clientY: number) => {
    if (!startRef.current || !hostRef.current) return
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) }
    if (finalBox.w >= 4 && finalBox.h >= 4) onSelect(finalBox)
    // cleanup
    try { hostRef.current.releasePointerCapture(ptrIdRef.current as any) } catch {}
    startRef.current = null
    ptrIdRef.current = null
    setBox(null)
    document.body.style.removeProperty('user-select')
  }

  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); dlog('[SEL][up]', { pageNumber }); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
  const onPointerLeave = () => { if (ptrIdRef.current != null) onPointerCancel() }

  useEffect(() => {
    const handler = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
    hostRef.current?.addEventListener('ai-select-cancel', handler as any)
    return () => hostRef.current?.removeEventListener('ai-select-cancel', handler as any)
  }, [])

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : 'default', touchAction: 'none' as any }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => { e.preventDefault() }}
    >
      {box && (
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '2px solid rgba(59,130,246,.8)', background: 'rgba(59,130,246,.1)' }} />
      )}
    </div>
  )
}

export function PdfPerPageSelection(_props: any) {
  // Deprecated in favor of SvgSelectLayer
  const [tick, setTick] = useState(0)
  const pageLayerByNum = useRef<Map<number, HTMLElement>>(new Map())
  const selectRootByNum = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureSelectModeStyles()

    const apply = () => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      dlog('[SEL][apply] pages=', pages.length)
      for (let i = 0; i < pages.length; i++) {
        const pl = pages[i]
        const holder = pl.closest('[data-page-number]') as HTMLElement | null
        const parsed = holder ? parseInt(holder.getAttribute('data-page-number') || '', 10) : NaN
        const pageNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : i + 1
        pageLayerByNum.current.set(pageNumber, pl)
        let sel = selectRootByNum.current.get(pageNumber)
        if (!sel) {
          sel = document.createElement('div')
          sel.className = 'ai-select-root'
          if (!pl.style.position) pl.style.position = 'relative'
          pl.appendChild(sel)
          selectRootByNum.current.set(pageNumber, sel)
          dlog('[SEL][mount-root]', { pageNumber })
        }
        Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
        // also prevent native layers from stealing events when enabled
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        // page layer cursor hint
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
      setTick((t) => t + 1)
    }

    apply()
    const mo = new MutationObserver(apply)
    mo.observe(host, { subtree: true, childList: true, attributes: false })
    const onAny = () => apply()
    const scs = [host.querySelector('.rpv-core__inner') as HTMLElement | null, host.querySelector('.rpv-core__pages') as HTMLElement | null, host.querySelector('.rpv-core__viewer') as HTMLElement | null].filter(Boolean) as HTMLElement[]
    scs.forEach((sc) => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
    window.addEventListener('resize', onAny)
    return () => { mo.disconnect(); scs.forEach((sc) => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
  }, [hostRef, enabled])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Update existing roots and page layers on toggle
    selectRootByNum.current.forEach((sel, pageNumber) => {
      Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
      const pl = pageLayerByNum.current.get(pageNumber)
      if (pl) {
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
    })
  }, [hostRef, enabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { selectRootByNum.current.forEach((root) => { root.dispatchEvent(new CustomEvent('ai-select-cancel')) }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const portals = useMemo(() => {
    const items: React.ReactNode[] = []
    selectRootByNum.current.forEach((root, pageNumber) => {
      items.push(
        createPortal(
          <SelectionOverlay
            key={`sel-${pageNumber}-${tick}`}
            enabled={enabled}
            pageNumber={pageNumber}
            onSelect={(viewportBox) => {
              let pdfBox: { x0: number; y0: number; x1: number; y1: number } | undefined
              const vp = resolveViewport?.(pageNumber)
              if (vp && typeof vp.convertToPdfPoint === 'function') {
                const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
                const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
                pdfBox = { x0, y0, x1, y1 }
              }
              onSelection({ pageNumber, viewportBox, pdfBox })
            }}
          />,
          root
        )
      )
    })
    return items
  }, [enabled, resolveViewport, onSelection, tick])

  return <>{portals}</>
}




type ViewportBox = { x: number; y: number; w: number; h: number }
export type SelectionPayload = {
  pageNumber: number
  viewportBox: ViewportBox
  pdfBox?: { x0: number; y0: number; x1: number; y1: number }
}

function ensureSelectModeStyles() {
  const id = 'pdf-select-mode-styles'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
  .ai-select-mode .rpv-core__text-layer { user-select: none !important; pointer-events: none !important; }
  .ai-select-mode .rpv-core__page-layer { cursor: crosshair !important; }
  .ai-select-mode .rpv-core__page-layer canvas { pointer-events: none !important; }
  .ai-select-root { position:absolute; inset:0; z-index:2000; user-select:none; }
  `
  document.head.appendChild(style)
}

const DEBUG = false
const dlog = (...args: any[]) => { if (DEBUG) try { console.debug(...args) } catch {} }

function SelectionOverlay({ enabled, onSelect, pageNumber }: { enabled: boolean; onSelect: (b: ViewportBox) => void; pageNumber?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const ptrIdRef = useRef<number | null>(null)
  const [box, setBox] = useState<ViewportBox | null>(null)

  const toLocal = (clientX: number, clientY: number) => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!hostRef.current) return
    hostRef.current.setPointerCapture(e.pointerId)
    ptrIdRef.current = e.pointerId
    const p = toLocal(e.clientX, e.clientY)
    startRef.current = { x: p.x, y: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    document.body.style.userSelect = 'none'
    dlog('[SEL][down]', { pageNumber, x: p.x, y: p.y })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!startRef.current || !hostRef.current) return
    if (ptrIdRef.current !== null && e.pointerId !== ptrIdRef.current) return
    const p = toLocal(e.clientX, e.clientY)
    setBox({ x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) })
  }

  const finish = (clientX: number, clientY: number) => {
    if (!startRef.current || !hostRef.current) return
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) }
    if (finalBox.w >= 4 && finalBox.h >= 4) onSelect(finalBox)
    // cleanup
    try { hostRef.current.releasePointerCapture(ptrIdRef.current as any) } catch {}
    startRef.current = null
    ptrIdRef.current = null
    setBox(null)
    document.body.style.removeProperty('user-select')
  }

  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); dlog('[SEL][up]', { pageNumber }); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
  const onPointerLeave = () => { if (ptrIdRef.current != null) onPointerCancel() }

  useEffect(() => {
    const handler = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
    hostRef.current?.addEventListener('ai-select-cancel', handler as any)
    return () => hostRef.current?.removeEventListener('ai-select-cancel', handler as any)
  }, [])

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : 'default', touchAction: 'none' as any }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => { e.preventDefault() }}
    >
      {box && (
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '2px solid rgba(59,130,246,.8)', background: 'rgba(59,130,246,.1)' }} />
      )}
    </div>
  )
}

export function PdfPerPageSelection(_props: any) {
  // Deprecated in favor of SvgSelectLayer
  const [tick, setTick] = useState(0)
  const pageLayerByNum = useRef<Map<number, HTMLElement>>(new Map())
  const selectRootByNum = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureSelectModeStyles()

    const apply = () => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      dlog('[SEL][apply] pages=', pages.length)
      for (let i = 0; i < pages.length; i++) {
        const pl = pages[i]
        const holder = pl.closest('[data-page-number]') as HTMLElement | null
        const parsed = holder ? parseInt(holder.getAttribute('data-page-number') || '', 10) : NaN
        const pageNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : i + 1
        pageLayerByNum.current.set(pageNumber, pl)
        let sel = selectRootByNum.current.get(pageNumber)
        if (!sel) {
          sel = document.createElement('div')
          sel.className = 'ai-select-root'
          if (!pl.style.position) pl.style.position = 'relative'
          pl.appendChild(sel)
          selectRootByNum.current.set(pageNumber, sel)
          dlog('[SEL][mount-root]', { pageNumber })
        }
        Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
        // also prevent native layers from stealing events when enabled
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        // page layer cursor hint
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
      setTick((t) => t + 1)
    }

    apply()
    const mo = new MutationObserver(apply)
    mo.observe(host, { subtree: true, childList: true, attributes: false })
    const onAny = () => apply()
    const scs = [host.querySelector('.rpv-core__inner') as HTMLElement | null, host.querySelector('.rpv-core__pages') as HTMLElement | null, host.querySelector('.rpv-core__viewer') as HTMLElement | null].filter(Boolean) as HTMLElement[]
    scs.forEach((sc) => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
    window.addEventListener('resize', onAny)
    return () => { mo.disconnect(); scs.forEach((sc) => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
  }, [hostRef, enabled])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Update existing roots and page layers on toggle
    selectRootByNum.current.forEach((sel, pageNumber) => {
      Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
      const pl = pageLayerByNum.current.get(pageNumber)
      if (pl) {
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
    })
  }, [hostRef, enabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { selectRootByNum.current.forEach((root) => { root.dispatchEvent(new CustomEvent('ai-select-cancel')) }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const portals = useMemo(() => {
    const items: React.ReactNode[] = []
    selectRootByNum.current.forEach((root, pageNumber) => {
      items.push(
        createPortal(
          <SelectionOverlay
            key={`sel-${pageNumber}-${tick}`}
            enabled={enabled}
            pageNumber={pageNumber}
            onSelect={(viewportBox) => {
              let pdfBox: { x0: number; y0: number; x1: number; y1: number } | undefined
              const vp = resolveViewport?.(pageNumber)
              if (vp && typeof vp.convertToPdfPoint === 'function') {
                const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
                const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
                pdfBox = { x0, y0, x1, y1 }
              }
              onSelection({ pageNumber, viewportBox, pdfBox })
            }}
          />,
          root
        )
      )
    })
    return items
  }, [enabled, resolveViewport, onSelection, tick])

  return <>{portals}</>
}




type ViewportBox = { x: number; y: number; w: number; h: number }
export type SelectionPayload = {
  pageNumber: number
  viewportBox: ViewportBox
  pdfBox?: { x0: number; y0: number; x1: number; y1: number }
}

function ensureSelectModeStyles() {
  const id = 'pdf-select-mode-styles'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
  .ai-select-mode .rpv-core__text-layer { user-select: none !important; pointer-events: none !important; }
  .ai-select-mode .rpv-core__page-layer { cursor: crosshair !important; }
  .ai-select-mode .rpv-core__page-layer canvas { pointer-events: none !important; }
  .ai-select-root { position:absolute; inset:0; z-index:2000; user-select:none; }
  `
  document.head.appendChild(style)
}

const DEBUG = false
const dlog = (...args: any[]) => { if (DEBUG) try { console.debug(...args) } catch {} }

function SelectionOverlay({ enabled, onSelect, pageNumber }: { enabled: boolean; onSelect: (b: ViewportBox) => void; pageNumber?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const ptrIdRef = useRef<number | null>(null)
  const [box, setBox] = useState<ViewportBox | null>(null)

  const toLocal = (clientX: number, clientY: number) => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!hostRef.current) return
    hostRef.current.setPointerCapture(e.pointerId)
    ptrIdRef.current = e.pointerId
    const p = toLocal(e.clientX, e.clientY)
    startRef.current = { x: p.x, y: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    document.body.style.userSelect = 'none'
    dlog('[SEL][down]', { pageNumber, x: p.x, y: p.y })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!startRef.current || !hostRef.current) return
    if (ptrIdRef.current !== null && e.pointerId !== ptrIdRef.current) return
    const p = toLocal(e.clientX, e.clientY)
    setBox({ x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) })
  }

  const finish = (clientX: number, clientY: number) => {
    if (!startRef.current || !hostRef.current) return
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(startRef.current.x, p.x), y: Math.min(startRef.current.y, p.y), w: Math.abs(p.x - startRef.current.x), h: Math.abs(p.y - startRef.current.y) }
    if (finalBox.w >= 4 && finalBox.h >= 4) onSelect(finalBox)
    // cleanup
    try { hostRef.current.releasePointerCapture(ptrIdRef.current as any) } catch {}
    startRef.current = null
    ptrIdRef.current = null
    setBox(null)
    document.body.style.removeProperty('user-select')
  }

  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); dlog('[SEL][up]', { pageNumber }); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
  const onPointerLeave = () => { if (ptrIdRef.current != null) onPointerCancel() }

  useEffect(() => {
    const handler = () => { startRef.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }
    hostRef.current?.addEventListener('ai-select-cancel', handler as any)
    return () => hostRef.current?.removeEventListener('ai-select-cancel', handler as any)
  }, [])

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : 'default', touchAction: 'none' as any }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => { e.preventDefault() }}
    >
      {box && (
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: '2px solid rgba(59,130,246,.8)', background: 'rgba(59,130,246,.1)' }} />
      )}
    </div>
  )
}

export function PdfPerPageSelection(_props: any) {
  // Deprecated in favor of SvgSelectLayer
  const [tick, setTick] = useState(0)
  const pageLayerByNum = useRef<Map<number, HTMLElement>>(new Map())
  const selectRootByNum = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureSelectModeStyles()

    const apply = () => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      dlog('[SEL][apply] pages=', pages.length)
      for (let i = 0; i < pages.length; i++) {
        const pl = pages[i]
        const holder = pl.closest('[data-page-number]') as HTMLElement | null
        const parsed = holder ? parseInt(holder.getAttribute('data-page-number') || '', 10) : NaN
        const pageNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : i + 1
        pageLayerByNum.current.set(pageNumber, pl)
        let sel = selectRootByNum.current.get(pageNumber)
        if (!sel) {
          sel = document.createElement('div')
          sel.className = 'ai-select-root'
          if (!pl.style.position) pl.style.position = 'relative'
          pl.appendChild(sel)
          selectRootByNum.current.set(pageNumber, sel)
          dlog('[SEL][mount-root]', { pageNumber })
        }
        Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
        // also prevent native layers from stealing events when enabled
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        // page layer cursor hint
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
      setTick((t) => t + 1)
    }

    apply()
    const mo = new MutationObserver(apply)
    mo.observe(host, { subtree: true, childList: true, attributes: false })
    const onAny = () => apply()
    const scs = [host.querySelector('.rpv-core__inner') as HTMLElement | null, host.querySelector('.rpv-core__pages') as HTMLElement | null, host.querySelector('.rpv-core__viewer') as HTMLElement | null].filter(Boolean) as HTMLElement[]
    scs.forEach((sc) => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
    window.addEventListener('resize', onAny)
    return () => { mo.disconnect(); scs.forEach((sc) => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
  }, [hostRef, enabled])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Update existing roots and page layers on toggle
    selectRootByNum.current.forEach((sel, pageNumber) => {
      Object.assign(sel.style, { pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : '' } as any)
      const pl = pageLayerByNum.current.get(pageNumber)
      if (pl) {
        const textLayer = (pl.querySelector('.rpv-core__text-layer') as HTMLElement | null)
        const canvas = (pl.querySelector('canvas') as HTMLCanvasElement | null)
        if (textLayer) { if (enabled) textLayer.style.pointerEvents = 'none'; else textLayer.style.removeProperty('pointer-events') }
        if (canvas) { if (enabled) canvas.style.pointerEvents = 'none'; else canvas.style.removeProperty('pointer-events') }
        pl.style.cursor = enabled ? 'crosshair' : ''
      }
    })
  }, [hostRef, enabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { selectRootByNum.current.forEach((root) => { root.dispatchEvent(new CustomEvent('ai-select-cancel')) }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const portals = useMemo(() => {
    const items: React.ReactNode[] = []
    selectRootByNum.current.forEach((root, pageNumber) => {
      items.push(
        createPortal(
          <SelectionOverlay
            key={`sel-${pageNumber}-${tick}`}
            enabled={enabled}
            pageNumber={pageNumber}
            onSelect={(viewportBox) => {
              let pdfBox: { x0: number; y0: number; x1: number; y1: number } | undefined
              const vp = resolveViewport?.(pageNumber)
              if (vp && typeof vp.convertToPdfPoint === 'function') {
                const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
                const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
                pdfBox = { x0, y0, x1, y1 }
              }
              onSelection({ pageNumber, viewportBox, pdfBox })
            }}
          />,
          root
        )
      )
    })
    return items
  }, [enabled, resolveViewport, onSelection, tick])

  return <>{portals}</>
}


