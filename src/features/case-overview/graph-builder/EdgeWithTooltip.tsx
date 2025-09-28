import React from 'react'
import { createPortal } from 'react-dom'
import { BaseEdge, EdgeProps, useReactFlow } from 'reactflow'
import { labelFor } from './RelationPicker'
import { Pencil, Palette, Trash2 } from 'lucide-react'

export default function EdgeWithTooltip(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, style, data } = props
  const rf = useReactFlow()
  const [hover, setHover] = React.useState(false)
  const pathRef = React.useRef<SVGPathElement | null>(null)
  const textRef = React.useRef<SVGTextElement | null>(null)
  const overlayRef = React.useRef<HTMLDivElement | null>(null)
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const hideTimer = React.useRef<number | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const [showPalette, setShowPalette] = React.useState(false)
  const [paletteScreen, setPaletteScreen] = React.useState<{ left:number; top:number } | null>(null)
  const [selected, setSelected] = React.useState(false)
  const toolbarTimer = React.useRef<number | null>(null)
  const GRACE_MS = 350
  const cancelToolbarHide = () => { if (toolbarTimer.current) { window.clearTimeout(toolbarTimer.current); toolbarTimer.current = null } }
  const scheduleToolbarHide = () => { cancelToolbarHide(); toolbarTimer.current = window.setTimeout(()=> setHover(false), GRACE_MS) as unknown as number }
  const [iconHover, setIconHover] = React.useState<null | 'edit' | 'palette' | 'trash'>(null)
  const pickPopoverPosition = React.useCallback((svg: SVGSVGElement, sx:number, sy:number, tx:number, ty:number) => {
    const popW = 180, popH = 138, gap = 12, CLEAR = 14
    const ctm = svg.getScreenCTM()!
    const toScreen = (p:{x:number;y:number}) => { const pt = svg.createSVGPoint(); pt.x = p.x; pt.y = p.y; const s = pt.matrixTransform(ctm); return { x: s.x, y: s.y } }
    const rect = svg.getBoundingClientRect()
    const sSrc = toScreen({ x: sx, y: sy })
    const sTgt = toScreen({ x: tx, y: ty })
    const tryPlace = (p:{x:number;y:number}, v:'top'|'bottom', h:'right'|'left') => {
      let left = h==='right' ? p.x + gap : p.x - popW - gap
      let top = v==='top' ? p.y - popH - gap : p.y + gap
      const fitsRect = (left >= rect.left && top >= rect.top && (left+popW) <= rect.right && (top+popH) <= rect.bottom)
      if (!fitsRect) return null
      if (v==='top' && (top + popH) > (p.y - CLEAR)) return null
      if (v==='bottom' && top < (p.y + CLEAR)) return null
      return { left, top }
    }
    let pick = tryPlace(sSrc, 'top', 'right')
    if (!pick) pick = tryPlace(sTgt, 'bottom', 'right')
    if (!pick) pick = tryPlace(sSrc, 'bottom', 'right')
    if (!pick) pick = tryPlace(sTgt, 'top', 'right')
    if (!pick) pick = tryPlace(sSrc, 'top', 'left')
    if (!pick) pick = tryPlace(sTgt, 'bottom', 'left')
    if (!pick) pick = tryPlace(sSrc, 'bottom', 'left')
    if (!pick) pick = tryPlace(sTgt, 'top', 'left')
    if (!pick) {
      pick = { left: Math.min(Math.max(rect.left+gap, sSrc.x-popW/2), rect.right-popW-gap), top: Math.min(Math.max(rect.top+gap, sSrc.y-popH/2), rect.bottom-popH-gap) }
    }
    const left = Math.max(8, Math.min(window.innerWidth - popW - 8, pick.left))
    const top = Math.max(8, Math.min(window.innerHeight - popH - 8, pick.top))
    return { left, top }
  }, [])

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
  // Tangency at the icon circle border (node center is the circle center)
  const R_SRC = 13.5
  const R_TGT = 13.5
  // Prefer real node centers (icon circle centers)
  const SIZE = 26
  const getCenter = (nid: string | undefined) => {
    if (!nid) return null
    const n: any = rf.getNode(nid)
    if (!n) return null
    if (n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number') {
      const centerY = n.position.y - ((n.height ?? (SIZE + 40)) / 2) + SIZE / 2
      return { x: n.position.x, y: centerY }
    }
    const ax = (n.positionAbsolute?.x ?? 0)
    const ay = (n.positionAbsolute?.y ?? 0)
    const w = n.width ?? 72
    return { x: ax + w / 2, y: ay + SIZE / 2 }
  }
  const srcC = getCenter((props as any).source) || { x: sourceX, y: sourceY }
  const tgtC = getCenter((props as any).target) || { x: targetX, y: targetY }
  const dx = tgtC.x - srcC.x
  const dy = tgtC.y - srcC.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Project along the center line so the segment is radial for both circles
  const sx = srcC.x + ux * R_SRC
  const sy = srcC.y + uy * R_SRC
  const tx = tgtC.x - ux * R_TGT
  const ty = tgtC.y - uy * R_TGT
  // Draw from source → target so markerEnd renders at the destination
  const path = `M ${sx},${sy} L ${tx},${ty}`
  // const midX = (sx + tx) / 2
  // const midY = (sy + ty) / 2
  const title = (data?.tooltip as string) || ''
  const strokeDasharray = data?.dashed ? '6 6' : undefined
  const isPreview = (data as any)?.preview === true
  const edgeStyle: React.CSSProperties = { ...(style||{}), stroke: (data as any)?.strokeColor ?? (style as any)?.stroke ?? '#0f172a', strokeWidth: (data as any)?.strokeWidth ?? (style as any)?.strokeWidth ?? 0.75, strokeLinecap: 'round' as any, opacity: isPreview ? 0.6 : 1, strokeDasharray: isPreview ? '6 3' : undefined }
  // Caption layout computed by SVG textPath; no external pencil offset now
  return (
    <g>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...edgeStyle, strokeDasharray }} />
      {/* Edge toolbar at source */}
      <g transform={`translate(${sx}, ${sy})`} onMouseEnter={()=>{ cancelToolbarHide(); setHover(true) }} onMouseLeave={()=>scheduleToolbarHide()}>
        <rect x={-6} y={-12} width={80} height={24} fill="transparent" pointerEvents="all" onMouseEnter={()=>{ cancelToolbarHide(); setHover(true) }} onMouseLeave={()=>scheduleToolbarHide()} onMouseDown={(e)=>e.stopPropagation()} />
        <g transform="translate(0,0)" style={{ opacity: (hover || selected || showPalette) ? 1 : 0, cursor:'default' }}>
          {/* Per-icon hitboxes for stable hover/click */}
          <rect x={0} y={-8} width={16} height={16} fill="transparent" pointerEvents="all"
            onMouseEnter={()=>setIconHover('edit')} onMouseLeave={()=>setIconHover(null)} onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e)=>{ e.stopPropagation(); const ev = new CustomEvent('gb:edit-edge', { detail: { edgeId: id, sourceId: (props as any).source, targetId: (props as any).target, x: sx, y: sy } }); window.dispatchEvent(ev) }} />
          <rect x={18} y={-8} width={16} height={16} fill="transparent" pointerEvents="all"
            onMouseEnter={()=>setIconHover('palette')} onMouseLeave={()=>setIconHover(null)} onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e)=>{ e.stopPropagation();
              try {
                const svg = pathRef.current?.ownerSVGElement as SVGSVGElement | undefined
                if (svg) {
                  const pos = pickPopoverPosition(svg, sx, sy, tx, ty)
                  setPaletteScreen(pos)
                } else {
                  setPaletteScreen({ left: Math.max(8, Math.min(window.innerWidth - 188, sx + 16)), top: Math.max(8, Math.min(window.innerHeight - 146, sy - 16)) })
                }
              } catch { setPaletteScreen({ left: Math.max(8, Math.min(window.innerWidth - 188, sx + 16)), top: Math.max(8, Math.min(window.innerHeight - 146, sy - 16)) }) }
              setShowPalette(true) }} />
          <rect x={36} y={-8} width={16} height={16} fill="transparent" pointerEvents="all"
            onMouseEnter={()=>setIconHover('trash')} onMouseLeave={()=>setIconHover(null)} onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e)=>{ e.stopPropagation(); const ev = new CustomEvent('gb:delete-edge', { detail: { id } }); window.dispatchEvent(ev) }} />
          {/* Icons */}
          <g transform="translate(0,0)"
            onMouseEnter={()=>setIconHover('edit')} onMouseLeave={()=>setIconHover(null)}
            onClick={(e)=>{ e.stopPropagation(); const ev = new CustomEvent('gb:edit-edge', { detail: { edgeId: id, sourceId: (props as any).source, targetId: (props as any).target, x: sx, y: sy } }); window.dispatchEvent(ev) }}>
            <Pencil width={12} height={12} color={iconHover==='edit' ? '#0284c7' : '#9ca3af'} />
          </g>
          <g transform="translate(18,0)"
            onMouseEnter={()=>setIconHover('palette')} onMouseLeave={()=>setIconHover(null)}
            onClick={(e)=>{ e.stopPropagation();
              try {
                const svg = pathRef.current?.ownerSVGElement as SVGSVGElement | undefined
                if (!svg || !svg.getScreenCTM) { setPaletteScreen({ left: tx + 16, top: ty + 16 }); setShowPalette(true); return }
                const pos = pickPopoverPosition(svg, sx, sy, tx, ty)
                setPaletteScreen(pos)
              } catch { setPaletteScreen({ left: Math.max(8, Math.min(window.innerWidth - 188, tx + 16)), top: Math.max(8, Math.min(window.innerHeight - 146, ty + 16)) }) }
              setShowPalette(true) }}>
            <Palette width={12} height={12} color={iconHover==='palette' ? '#0284c7' : '#9ca3af'} />
          </g>
          <g transform="translate(36,0)"
            onMouseEnter={()=>setIconHover('trash')} onMouseLeave={()=>setIconHover(null)}
            onClick={(e)=>{ e.stopPropagation(); const ev = new CustomEvent('gb:delete-edge', { detail: { id } }); window.dispatchEvent(ev) }}>
            <Trash2 width={12} height={12} color={iconHover==='trash' ? '#dc2626' : '#9ca3af'} />
          </g>
        </g>
      </g>
      {/* Invisible overlay with native tooltip */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={6} pointerEvents="stroke"
        onMouseEnter={() => { cancelToolbarHide(); setHover(true); if (rafRef.current) cancelAnimationFrame(rafRef.current); showDeleteAtMid() }}
        onMouseMove={() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => showDeleteAtMid()) as unknown as number }}
        onMouseLeave={()=>{ if (!showPalette) scheduleToolbarHide(); if (hideTimer.current) window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(()=>{ if(btnRef.current) btnRef.current.style.display='none' },140) as unknown as number }}
        onClick={(e)=>{ e.stopPropagation(); setSelected(true) }}>
        {title ? <title>{title}</title> : null}
      </path>
      {/* Two parallel hover bands (+/- 10px) */}
      {(() => { const off = 10; const nx = -uy * off; const ny = ux * off; const p1 = `M ${sx+nx},${sy+ny} L ${tx+nx},${ty+ny}`; const p2 = `M ${sx-nx},${sy-ny} L ${tx-nx},${ty-ny}`; return (
        <g pointerEvents="stroke" stroke="transparent" strokeWidth={10} fill="none">
          <path d={p1} onMouseEnter={()=>{ cancelToolbarHide(); setHover(true) }} onMouseLeave={()=>{ if (!showPalette) scheduleToolbarHide() }} />
          <path d={p2} onMouseEnter={()=>{ cancelToolbarHide(); setHover(true) }} onMouseLeave={()=>{ if (!showPalette) scheduleToolbarHide() }} />
        </g>
      )})()}
      {/* Caption (relation) al centro con matita incorporata */}
      {(data as any)?.relation && (
        <g>
          <path ref={pathRef} id={`${id}-label`} d={path} fill="none" stroke="none" />
          {/* Testo + matita nello stesso wrapper */}
          <g>
            {/* removed large caption hitbox to limit clickable area to the edge strip */}
            <text ref={textRef} fontSize={(data as any)?.captionFontSizePx ?? 10} fill={(data as any)?.captionColor || '#0f172a'} dy={-2} style={{ fontWeight: (data as any)?.captionBold ? 600 : 300, fontStyle: (data as any)?.captionItalic ? 'italic' : 'normal', textTransform: 'none' }}
              pointerEvents="all" onMouseEnter={()=>{ cancelToolbarHide(); setHover(true) }} onMouseLeave={()=>scheduleToolbarHide()}>
              <textPath href={`#${id}-label`} startOffset="50%" textAnchor="middle">
                {(() => { const raw = labelFor((data as any).relation) || ''; const low = raw.toLocaleLowerCase('it-IT').trim(); return low.endsWith(' di') ? low : `${low} di`; })()}
              </textPath>
            </text>
            {/* caption pencil near text removed in favor of source toolbar */}
          </g>
        </g>
      )}
      {showPalette && paletteScreen && (
        <EdgeStylePortal id={id} left={paletteScreen.left} top={paletteScreen.top} data={data} onClose={()=>{ setShowPalette(false); setSelected(false); scheduleToolbarHide(); setPaletteScreen(null) }} />
      )}
    </g>
  )
}
function EdgeStylePortal({ id, left, top, data, onClose }: { id:string; left:number; top:number; data:any; onClose: ()=>void }) {
  const [open, setOpen] = React.useState(true)
  const orig = React.useRef({
    strokeWidth: data?.strokeWidth ?? 0.75,
    strokeColor: data?.strokeColor || '#0f172a',
    captionFontSizePx: data?.captionFontSizePx ?? 8,
    captionColor: data?.captionColor || '#0f172a',
    captionBold: !!data?.captionBold,
    captionItalic: !!data?.captionItalic,
  })
  const [local, setLocal] = React.useState(orig.current)
  const preview = (patch: Partial<typeof local>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    window.dispatchEvent(new CustomEvent('gb:edge-style', { detail:{ id, data: next } }))
  }
  if (!open) return null as any
  return createPortal(
    <div style={{ position:'fixed', left, top, width:180, height:138, zIndex:10000, pointerEvents:'auto' }} onMouseDown={(e)=>e.stopPropagation()}>
      <div className="bg-white border shadow-xl rounded p-2 text-[12px]">
        <div className="flex items-center gap-[5px] mb-2">
          <span className="text-slate-600 mr-1">—</span>
          <input className="h-1 w-28" type="range" min={0} max={4} value={local.strokeWidth} onChange={(e)=>preview({ strokeWidth: Number(e.target.value) })} />
          <input className="h-4 w-4" type="color" value={local.strokeColor} onChange={(e)=>preview({ strokeColor: e.target.value })} />
        </div>
        <div className="flex items-center gap-[5px] mb-2">
          <span className="text-slate-600 mr-1">aA</span>
          <input className="h-1 w-28" type="range" min={6} max={12} value={local.captionFontSizePx} onChange={(e)=>preview({ captionFontSizePx: Number(e.target.value) })} />
          <input className="h-4 w-4" type="color" value={local.captionColor} onChange={(e)=>preview({ captionColor: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <button type="button" className={`px-2 py-0.5 border rounded ${local.captionBold ? 'bg-slate-800 text-white' : 'text-slate-700'}`} onClick={()=>preview({ captionBold: !local.captionBold })}>Bold</button>
          <button type="button" className={`px-2 py-0.5 border rounded ${local.captionItalic ? 'bg-slate-800 text-white' : 'text-slate-700'}`} onClick={()=>preview({ captionItalic: !local.captionItalic })}>Italic</button>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button className="px-2 py-1 border rounded" onClick={()=>{ window.dispatchEvent(new CustomEvent('gb:edge-style', { detail:{ id, data: orig.current } })); setOpen(false); onClose() }}>Annulla</button>
          <button className="px-2 py-1 bg-blue-600 text-white rounded" onClick={()=>{ setOpen(false); onClose() }}>Applica</button>
        </div>
      </div>
    </div>,
    document.body
  )
}


