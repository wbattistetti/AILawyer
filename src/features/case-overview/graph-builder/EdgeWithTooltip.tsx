import React from 'react'
import { BaseEdge, EdgeProps } from 'reactflow'
import { labelFor } from './RelationPicker'
import { Pencil } from 'lucide-react'

export default function EdgeWithTooltip(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, style, data } = props
  const [hover, setHover] = React.useState(false)
  const [labelHover, setLabelHover] = React.useState(false)
  const hoverTimer = React.useRef<number | null>(null)
  const setHoverSafe = (active: boolean) => {
    if (active) {
      if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
      setLabelHover(true)
    } else {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(() => setLabelHover(false), 140) as unknown as number
    }
  }
  const pathRef = React.useRef<SVGPathElement | null>(null)
  const textRef = React.useRef<SVGTextElement | null>(null)
  const [pencilOffset, setPencilOffset] = React.useState<number | null>(null)
  const [hitbox, setHitbox] = React.useState<{ x:number; y:number; w:number; h:number } | null>(null)
  const overlayRef = React.useRef<HTMLDivElement | null>(null)
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const hideTimer = React.useRef<number | null>(null)
  const rafRef = React.useRef<number | null>(null)

  const ensureOverlay = () => {
    if (!overlayRef.current) {
      let ov = document.getElementById('gb-edge-overlay') as HTMLDivElement | null
      if (!ov) {
        ov = document.createElement('div')
        ov.id = 'gb-edge-overlay'
        Object.assign(ov.style, { position:'fixed', inset:'0', pointerEvents:'none', zIndex: 9999 })
        document.body.appendChild(ov)
      }
      overlayRef.current = ov
    }
    if (!btnRef.current) {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('aria-label','Elimina collegamento')
      Object.assign(b.style, { position:'fixed', left:'0px', top:'0px', width:'22px', height:'22px', display:'none', border:'none', background:'transparent', color:'#9ca3af', pointerEvents:'auto', cursor:'pointer' })
      b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
      b.onmouseenter = () => { if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null } }
      b.onmouseleave = () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(()=>{ if (btnRef.current) btnRef.current.style.display='none' }, 140) as unknown as number }
      overlayRef.current!.appendChild(b)
      btnRef.current = b
    }
  }

  const showDeleteAt = (xSvg:number, ySvg:number) => {
    ensureOverlay()
    if (!btnRef.current || !pathRef.current) return
    const svg = (pathRef.current as any).ownerSVGElement as SVGSVGElement
    const pt = svg.createSVGPoint()
    pt.x = xSvg; pt.y = ySvg
    const ctm = (pathRef.current as any).getScreenCTM?.()
    const sp = ctm ? pt.matrixTransform(ctm) : { x: xSvg, y: ySvg }
    // non-scaled size: inverse scale by reading viewport transform
    try {
      const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null
      const m = vp?.style?.transform?.match(/scale\(([^)]+)\)/)
      const z = m ? parseFloat(m[1]) : 1
      const inv = 1 / Math.max(0.01, z)
      btnRef.current.style.transform = `translate(0,0) scale(${inv})`
      btnRef.current.style.transformOrigin = 'center'
    } catch { btnRef.current.style.transform = 'translate(0,0)' }
    btnRef.current.style.left = `${Math.round(sp.x)}px`
    btnRef.current.style.top = `${Math.round(sp.y)}px`
    btnRef.current.style.display = 'block'
    btnRef.current.onclick = (e) => { e.stopPropagation(); try { const ev = new CustomEvent('gb:delete-edge', { detail: { id } }); window.dispatchEvent(ev) } catch {}; btnRef.current!.style.display = 'none' }
  }

  const showDeleteAtMid = () => {
    const vx = tx - sx, vy = ty - sy
    const len = Math.hypot(vx, vy) || 1
    const mx = sx + vx / 2
    const my = sy + vy / 2
    const nx = -vy / len, ny = vx / len
    const off = 4
    showDeleteAt(mx + nx * off, my + ny * off)
  }
  // Compute tangent points using a virtual circle radius tuned to our node visuals
  const R_SRC = 36 // include label block below the icon for source node
  const R_TGT = 36 // include label block for target node
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = sourceX + ux * R_SRC
  const sy = sourceY + uy * R_SRC
  const tx = targetX - ux * R_TGT
  const ty = targetY - uy * R_TGT
  const path = `M ${sx},${sy} L ${tx},${ty}`
  const midX = (sx + tx) / 2
  const midY = (sy + ty) / 2
  const title = (data?.tooltip as string) || ''
  const strokeDasharray = data?.dashed ? '6 6' : undefined
  const isPreview = (data as any)?.preview === true
  const edgeStyle = { stroke: '#0f172a', strokeWidth: 0.75, strokeLinecap: 'round', opacity: isPreview ? 0.6 : 1, strokeDasharray: isPreview ? '6 3' : undefined, ...(style||{}) }
  // Calcola posizione matita appena noto il bbox del testo
  React.useEffect(() => {
    try {
      if (!pathRef.current || !textRef.current) return
      const total = (pathRef.current as any).getTotalLength?.() || 0
      const textNode = textRef.current as any
      const length = (textNode.getComputedTextLength?.() || 0) as number
      const offset = Math.min(total - 1, total / 2 + length / 2 + 2) // +2px margine
      setPencilOffset(offset)
      try {
        const bb = (textRef.current as any).getBBox?.()
        if (bb) setHitbox({ x: bb.x, y: bb.y - 4, w: bb.width + 14, h: bb.height + 10 })
      } catch {}
    } catch {}
  }, [data?.relation, sx, sy, tx, ty])
  return (
    <g>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...edgeStyle, strokeDasharray }} />
      {/* Invisible overlay with native tooltip */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} pointerEvents="stroke"
        onMouseEnter={() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); showDeleteAtMid() }}
        onMouseMove={() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => showDeleteAtMid()) as unknown as number }}
        onMouseLeave={()=>{ if (hideTimer.current) window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(()=>{ if(btnRef.current) btnRef.current.style.display='none' },140) as unknown as number }}>
        {title ? <title>{title}</title> : null}
      </path>
      {/* Caption (relation) al centro con matita incorporata */}
      {(data as any)?.relation && (
        <g>
          <path ref={pathRef} id={`${id}-label`} d={path} fill="none" stroke="none" />
          {/* Testo + matita nello stesso wrapper */}
          <g>
            {hitbox && (
              <rect x={hitbox.x - 8} y={hitbox.y - 8} width={hitbox.w + 28} height={hitbox.h + 20} fill="transparent" pointerEvents="all"
                onMouseEnter={()=>setHoverSafe(true)} onMouseLeave={()=>setHoverSafe(false)} />
            )}
            <text ref={textRef} fontSize={6} fill="#0f172a" dy={-2} style={{ fontWeight: 300, textTransform: 'none' }}>
              <textPath href={`#${id}-label`} startOffset="50%" textAnchor="middle">
                {(() => { const raw = labelFor((data as any).relation) || ''; const low = raw.toLocaleLowerCase('it-IT').trim(); return low.endsWith(' di') ? low : `${low} di`; })()}
              </textPath>
            </text>
            {(labelHover || hover) && pencilOffset != null && (
              <g>
                <text fontSize={9} fill="#6b7280">
                  <textPath href={`#${id}-label`} startOffset={`${pencilOffset + 2}px`} textAnchor="start">✎</textPath>
                </text>
                <text fontSize={14} fill="transparent" style={{ cursor:'pointer' }}
                  onMouseEnter={()=>setHoverSafe(true)} onMouseLeave={()=>setHoverSafe(false)}
                  onClick={(e)=>{ e.stopPropagation(); try { const ev = new CustomEvent('gb:edit-edge', { detail: { edgeId: id, sourceId: (props as any).source, targetId: (props as any).target, x: 0, y: 0 } }); window.dispatchEvent(ev) } catch {} }}>
                    <textPath href={`#${id}-label`} startOffset={`${pencilOffset + 2}px`} textAnchor="start">.</textPath>
                </text>
              </g>
            )}
          </g>
        </g>
      )}
    </g>
  )
}


