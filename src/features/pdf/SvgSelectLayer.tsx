import * as React from 'react'

type Viewport = any // PDFPageViewport di pdf.js
type Box = { x: number; y: number; w: number; h: number }
const DEBUG = true
const dlog = (...args: any[]) => { if (DEBUG) { try { console.debug('[SVGSEL]', ...args) } catch {} } }

export function SvgSelectLayer({ enabled, pageIndex, onSelect }: {
  enabled: boolean
  pageIndex: number // 0-based
  onSelect: (p: { pageNumber: number; viewportBox: Box }) => void
}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const startRef = React.useRef<{ x: number; y: number } | null>(null)
  const [box, setBox] = React.useState<Box | null>(null)
  const [ptrId, setPtrId] = React.useState<number | null>(null)
  const isDraggingRef = React.useRef<boolean>(false)
  const isFrozenRef = React.useRef<boolean>(false)

  const toLocal = (clientX: number, clientY: number) => {
    const el = svgRef.current!
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width, clientX - r.left))
    const y = Math.max(0, Math.min(r.height, clientY - r.top))
    return { x, y }
  }

  const cleanup = (clearBox = true) => {
    if (clearBox) setBox(null)
    startRef.current = null
    setPtrId(null)
    document.body.style.removeProperty('user-select')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return
    e.preventDefault(); e.stopPropagation()
    const el = svgRef.current!
    ;(el as any).setPointerCapture?.(e.pointerId)
    setPtrId(e.pointerId)
    isDraggingRef.current = true
    isFrozenRef.current = false
    const p = toLocal(e.clientX, e.clientY)
    // Se esiste un box stabilizzato e il click è fuori, cancella e non avvia una nuova selezione
    if (box) {
      const inside = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
      if (!inside) {
        dlog('clear on outside click')
        cleanup()
        return
      }
    }
    startRef.current = p
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    document.body.style.userSelect = 'none'
    dlog('down', { pageIndex, ptrId: e.pointerId, p })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return
    if (isFrozenRef.current || !isDraggingRef.current || ptrId == null || e.pointerId !== ptrId) return
    e.preventDefault(); e.stopPropagation()
    const p = toLocal(e.clientX, e.clientY)
    const s = startRef.current
    if (!s) return
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
    dlog('move', { ptrId, dragging: isDraggingRef.current, frozen: isFrozenRef.current, p })
  }

  const finish = (clientX: number, clientY: number) => {
    const s = startRef.current
    if (!s || !svgRef.current) return cleanup()
    const p = toLocal(clientX, clientY)
    const finalBox = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }
    if (finalBox.w >= 4 && finalBox.h >= 4) {
      // Mantieni visibile il rettangolo finché il caller non invia un clear
      setBox(finalBox)
      onSelect({ pageNumber: pageIndex + 1, viewportBox: finalBox })
      dlog('up+freeze', {
        ptrId,
        pageIndex,
        viewportBox: finalBox,
      })
    }
    // Rilascia pointer capture ma non cancellare il box
    try { (svgRef.current as any)?.releasePointerCapture?.(ptrId as any) } catch {}
    isDraggingRef.current = false
    isFrozenRef.current = true
    cleanup(false)
  }

  const onPointerUp = (e: React.PointerEvent) => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); finish(e.clientX, e.clientY) }
  const onPointerCancel = () => { dlog('cancel'); isDraggingRef.current = false; isFrozenRef.current = false; cleanup() }
  const onPointerLeave = () => { if (ptrId != null) { dlog('leave'); isDraggingRef.current = false; isFrozenRef.current = false; cleanup() } }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cleanup()
    const onClear = () => cleanup()
    window.addEventListener('keydown', onKey)
    window.addEventListener('ai-select-clear' as any, onClear as any)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('ai-select-clear' as any, onClear as any) }
  }, [])

  React.useEffect(() => {
    const el = svgRef.current?.parentElement?.parentElement // wrapper pagina
    if (!el) return
    if (enabled) el.classList.add('ai-select-enabled')
    else el.classList.remove('ai-select-enabled')
    if (!enabled) setBox(null)
  }, [enabled])

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: enabled ? 'auto' : 'none', touchAction: 'none' as any }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      aria-hidden
    >
      {box && (
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="rgba(59,130,246,.12)" stroke="rgba(59,130,246,.85)" strokeWidth={2} rx={2} ry={2} />
      )}
    </svg>
  )
}


