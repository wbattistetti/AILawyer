import React, { useEffect, useRef } from 'react'

type Props = {
  hostRef: React.RefObject<HTMLDivElement>
  enabled: boolean
  onArea: (payload: { page: number; viewportBox: { x:number;y:number;w:number;h:number } }) => void
}

export function PerPageSelectionManager({ hostRef, enabled, onArea }: Props) {
  const downRef = useRef<{ pageEl: HTMLElement; x:number; y:number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const findPageAt = (x:number, y:number) => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      for (const el of pages) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
      }
      return null
    }

    const ensureBox = () => {
      if (!boxRef.current) {
        const div = document.createElement('div')
        Object.assign(div.style, { position:'fixed', left:'0', top:'0', width:'0', height:'0', border:'2px solid rgba(59,130,246,.8)', background:'rgba(59,130,246,.1)', pointerEvents:'none', zIndex:'2000' })
        document.body.appendChild(div)
        boxRef.current = div
      }
      return boxRef.current!
    }

    const onDown = (e: MouseEvent) => {
      if (!enabled) return
      const pageEl = findPageAt(e.clientX, e.clientY)
      if (!pageEl) return
      const r = pageEl.getBoundingClientRect()
      downRef.current = { pageEl, x: e.clientX - r.left, y: e.clientY - r.top }
      const box = ensureBox()
      Object.assign(box.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, width:'0px', height:'0px', display:'block' })
    }

    const onMove = (e: MouseEvent) => {
      if (!enabled) return
      const d = downRef.current; if (!d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const x1 = Math.max(d.x, x), y1 = Math.max(d.y, y)
      const box = ensureBox()
      Object.assign(box.style, { left: `${pageR.left + x0}px`, top: `${pageR.top + y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
    }

    const onUp = (e: MouseEvent) => {
      const d = downRef.current
      downRef.current = null
      const box = ensureBox(); box.style.display = 'none'
      if (!enabled || !d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const w = Math.max(1, Math.abs(x - d.x)), h = Math.max(1, Math.abs(y - d.y))
      const holder = d.pageEl.closest('[data-page-number]') as HTMLElement | null
      const pageNum = holder ? parseInt(holder.getAttribute('data-page-number') || '0', 10) : 0
      if (pageNum > 0) onArea({ page: pageNum, viewportBox: { x: x0, y: y0, w, h } })
    }

    const onCancel = () => { downRef.current = null; if (boxRef.current) boxRef.current.style.display = 'none' }

    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('blur', onCancel)
      try { if (boxRef.current && boxRef.current.parentNode) boxRef.current.parentNode.removeChild(boxRef.current) } catch {}
      boxRef.current = null
    }
  }, [hostRef.current, enabled])

  return null
}



type Props = {
  hostRef: React.RefObject<HTMLDivElement>
  enabled: boolean
  onArea: (payload: { page: number; viewportBox: { x:number;y:number;w:number;h:number } }) => void
}

export function PerPageSelectionManager({ hostRef, enabled, onArea }: Props) {
  const downRef = useRef<{ pageEl: HTMLElement; x:number; y:number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const findPageAt = (x:number, y:number) => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      for (const el of pages) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
      }
      return null
    }

    const ensureBox = () => {
      if (!boxRef.current) {
        const div = document.createElement('div')
        Object.assign(div.style, { position:'fixed', left:'0', top:'0', width:'0', height:'0', border:'2px solid rgba(59,130,246,.8)', background:'rgba(59,130,246,.1)', pointerEvents:'none', zIndex:'2000' })
        document.body.appendChild(div)
        boxRef.current = div
      }
      return boxRef.current!
    }

    const onDown = (e: MouseEvent) => {
      if (!enabled) return
      const pageEl = findPageAt(e.clientX, e.clientY)
      if (!pageEl) return
      const r = pageEl.getBoundingClientRect()
      downRef.current = { pageEl, x: e.clientX - r.left, y: e.clientY - r.top }
      const box = ensureBox()
      Object.assign(box.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, width:'0px', height:'0px', display:'block' })
    }

    const onMove = (e: MouseEvent) => {
      if (!enabled) return
      const d = downRef.current; if (!d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const x1 = Math.max(d.x, x), y1 = Math.max(d.y, y)
      const box = ensureBox()
      Object.assign(box.style, { left: `${pageR.left + x0}px`, top: `${pageR.top + y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
    }

    const onUp = (e: MouseEvent) => {
      const d = downRef.current
      downRef.current = null
      const box = ensureBox(); box.style.display = 'none'
      if (!enabled || !d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const w = Math.max(1, Math.abs(x - d.x)), h = Math.max(1, Math.abs(y - d.y))
      const holder = d.pageEl.closest('[data-page-number]') as HTMLElement | null
      const pageNum = holder ? parseInt(holder.getAttribute('data-page-number') || '0', 10) : 0
      if (pageNum > 0) onArea({ page: pageNum, viewportBox: { x: x0, y: y0, w, h } })
    }

    const onCancel = () => { downRef.current = null; if (boxRef.current) boxRef.current.style.display = 'none' }

    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('blur', onCancel)
      try { if (boxRef.current && boxRef.current.parentNode) boxRef.current.parentNode.removeChild(boxRef.current) } catch {}
      boxRef.current = null
    }
  }, [hostRef.current, enabled])

  return null
}



type Props = {
  hostRef: React.RefObject<HTMLDivElement>
  enabled: boolean
  onArea: (payload: { page: number; viewportBox: { x:number;y:number;w:number;h:number } }) => void
}

export function PerPageSelectionManager({ hostRef, enabled, onArea }: Props) {
  const downRef = useRef<{ pageEl: HTMLElement; x:number; y:number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const findPageAt = (x:number, y:number) => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      for (const el of pages) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
      }
      return null
    }

    const ensureBox = () => {
      if (!boxRef.current) {
        const div = document.createElement('div')
        Object.assign(div.style, { position:'fixed', left:'0', top:'0', width:'0', height:'0', border:'2px solid rgba(59,130,246,.8)', background:'rgba(59,130,246,.1)', pointerEvents:'none', zIndex:'2000' })
        document.body.appendChild(div)
        boxRef.current = div
      }
      return boxRef.current!
    }

    const onDown = (e: MouseEvent) => {
      if (!enabled) return
      const pageEl = findPageAt(e.clientX, e.clientY)
      if (!pageEl) return
      const r = pageEl.getBoundingClientRect()
      downRef.current = { pageEl, x: e.clientX - r.left, y: e.clientY - r.top }
      const box = ensureBox()
      Object.assign(box.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, width:'0px', height:'0px', display:'block' })
    }

    const onMove = (e: MouseEvent) => {
      if (!enabled) return
      const d = downRef.current; if (!d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const x1 = Math.max(d.x, x), y1 = Math.max(d.y, y)
      const box = ensureBox()
      Object.assign(box.style, { left: `${pageR.left + x0}px`, top: `${pageR.top + y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
    }

    const onUp = (e: MouseEvent) => {
      const d = downRef.current
      downRef.current = null
      const box = ensureBox(); box.style.display = 'none'
      if (!enabled || !d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const w = Math.max(1, Math.abs(x - d.x)), h = Math.max(1, Math.abs(y - d.y))
      const holder = d.pageEl.closest('[data-page-number]') as HTMLElement | null
      const pageNum = holder ? parseInt(holder.getAttribute('data-page-number') || '0', 10) : 0
      if (pageNum > 0) onArea({ page: pageNum, viewportBox: { x: x0, y: y0, w, h } })
    }

    const onCancel = () => { downRef.current = null; if (boxRef.current) boxRef.current.style.display = 'none' }

    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('blur', onCancel)
      try { if (boxRef.current && boxRef.current.parentNode) boxRef.current.parentNode.removeChild(boxRef.current) } catch {}
      boxRef.current = null
    }
  }, [hostRef.current, enabled])

  return null
}



type Props = {
  hostRef: React.RefObject<HTMLDivElement>
  enabled: boolean
  onArea: (payload: { page: number; viewportBox: { x:number;y:number;w:number;h:number } }) => void
}

export function PerPageSelectionManager({ hostRef, enabled, onArea }: Props) {
  const downRef = useRef<{ pageEl: HTMLElement; x:number; y:number } | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const findPageAt = (x:number, y:number) => {
      const pages = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
      for (const el of pages) {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
      }
      return null
    }

    const ensureBox = () => {
      if (!boxRef.current) {
        const div = document.createElement('div')
        Object.assign(div.style, { position:'fixed', left:'0', top:'0', width:'0', height:'0', border:'2px solid rgba(59,130,246,.8)', background:'rgba(59,130,246,.1)', pointerEvents:'none', zIndex:'2000' })
        document.body.appendChild(div)
        boxRef.current = div
      }
      return boxRef.current!
    }

    const onDown = (e: MouseEvent) => {
      if (!enabled) return
      const pageEl = findPageAt(e.clientX, e.clientY)
      if (!pageEl) return
      const r = pageEl.getBoundingClientRect()
      downRef.current = { pageEl, x: e.clientX - r.left, y: e.clientY - r.top }
      const box = ensureBox()
      Object.assign(box.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, width:'0px', height:'0px', display:'block' })
    }

    const onMove = (e: MouseEvent) => {
      if (!enabled) return
      const d = downRef.current; if (!d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const x1 = Math.max(d.x, x), y1 = Math.max(d.y, y)
      const box = ensureBox()
      Object.assign(box.style, { left: `${pageR.left + x0}px`, top: `${pageR.top + y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
    }

    const onUp = (e: MouseEvent) => {
      const d = downRef.current
      downRef.current = null
      const box = ensureBox(); box.style.display = 'none'
      if (!enabled || !d) return
      const pageR = d.pageEl.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - pageR.left, pageR.width))
      const y = Math.max(0, Math.min(e.clientY - pageR.top, pageR.height))
      const x0 = Math.min(d.x, x), y0 = Math.min(d.y, y)
      const w = Math.max(1, Math.abs(x - d.x)), h = Math.max(1, Math.abs(y - d.y))
      const holder = d.pageEl.closest('[data-page-number]') as HTMLElement | null
      const pageNum = holder ? parseInt(holder.getAttribute('data-page-number') || '0', 10) : 0
      if (pageNum > 0) onArea({ page: pageNum, viewportBox: { x: x0, y: y0, w, h } })
    }

    const onCancel = () => { downRef.current = null; if (boxRef.current) boxRef.current.style.display = 'none' }

    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('blur', onCancel)
      try { if (boxRef.current && boxRef.current.parentNode) boxRef.current.parentNode.removeChild(boxRef.current) } catch {}
      boxRef.current = null
    }
  }, [hostRef.current, enabled])

  return null
}


