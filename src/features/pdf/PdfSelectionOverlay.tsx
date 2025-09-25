import React, { useEffect, useRef, useState } from 'react'

export type PdfSelection = {
  pdfPageNumber: number
  bboxPdf: { x0:number; y0:number; x1:number; y1:number }
  viewportBox: { x:number;y:number;w:number;h:number }
  text: string
  lineStart?: number
  lineEnd?: number
}

export function getPdfCoords(box:{x:number;y:number;w:number;h:number}, viewport:any) {
  const [x0, y0] = viewport.convertToPdfPoint(box.x, box.y + box.h)
  const [x1, y1] = viewport.convertToPdfPoint(box.x + box.w, box.y)
  return { x0, y0, x1, y1 }
}

export async function getSelectedTextInRect(textLayerDiv: HTMLDivElement, box:{x:number;y:number;w:number;h:number}) {
  const host = textLayerDiv.getBoundingClientRect()
  const spans = Array.from(textLayerDiv.querySelectorAll<HTMLElement>('span'))
  const hits: Array<{node:HTMLElement; top:number; left:number}> = []
  for (const n of spans) {
    const r = n.getBoundingClientRect()
    const yTop = r.top - host.top, yBot = r.bottom - host.top
    const xLeft = r.left - host.left, xRight = r.right - host.left
    const overlap = !(xRight < box.x || xLeft > (box.x + box.w) || yBot < box.y || yTop > (box.y + box.h))
    if (overlap) hits.push({ node: n, top: yTop, left: xLeft })
  }
  const ordered = hits.sort((a,b)=> (a.top - b.top) || (a.left - b.left))
  const text = ordered.map(h => h.node.textContent ?? '').join('').replace(/\s+\n?/g,' ').trim()
  return { text, lineStart: undefined as number|undefined, lineEnd: undefined as number|undefined }
}

// Deprecated: replaced by PerPageSelectionManager
export function PdfSelectionOverlay({ pdfPageNumber, viewport, textLayerDiv, onSelection, enabled=true }:{ pdfPageNumber:number; viewport:any; textLayerDiv:HTMLDivElement|null; onSelection:(s:any)=>void; enabled?: boolean }){
  const [box, setBox] = useState<null | {x:number;y:number;w:number;h:number}>(null)
  const start = useRef<{x:number;y:number} | null>(null)
  const hostRef = useRef<HTMLDivElement|null>(null)
  const ptrIdRef = useRef<number | null>(null)

  const toLocal = (clientX: number, clientY: number) => {
    const rect = hostRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    // clamp to bounds
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!hostRef.current) return
    hostRef.current.setPointerCapture(e.pointerId)
    ptrIdRef.current = e.pointerId
    const p = toLocal(e.clientX, e.clientY)
    start.current = { x: p.x, y: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    // prevent native text selection while dragging
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    if (!start.current || !hostRef.current) return
    if (ptrIdRef.current !== null && e.pointerId !== ptrIdRef.current) return
    const p = toLocal(e.clientX, e.clientY)
    setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) })
  }
  const finish = (clientX: number, clientY: number) => {
    if (!start.current || !hostRef.current) return
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) }
    if (finalBox.w >= 1 && finalBox.h >= 1) onSelection({ pdfPageNumber, viewportBox: finalBox })
    start.current = null
    ptrIdRef.current = null
    setBox(null)
    document.body.style.removeProperty('user-select')
  }
  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { start.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') }

  // Se l'utente rilascia fuori (es. scrollbar), chiudi in sicurezza
  useEffect(() => {
    const onWinUp = (e: MouseEvent) => { if (start.current) finish(e.clientX, e.clientY) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { start.current = null; ptrIdRef.current = null; setBox(null); document.body.style.removeProperty('user-select') } }
    window.addEventListener('mouseup', onWinUp, true)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mouseup', onWinUp, true); window.removeEventListener('keydown', onKey, true) }
  }, [])

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e)=>{ e.preventDefault() }}
      style={{ touchAction:'none', pointerEvents: enabled ? 'auto' : 'none', cursor: enabled ? 'crosshair' : 'default' }}
    >
      {box && (
        <div className="absolute border-2 border-blue-500/80 bg-blue-500/10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      )}
    </div>
  )
}


