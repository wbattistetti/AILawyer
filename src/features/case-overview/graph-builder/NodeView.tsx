import React from 'react'
import { Handle, Position, useViewport } from 'reactflow'
import { User, UserRound, Building2, Users, Coffee, UtensilsCrossed, Car, Bike, Trash2, Pencil, Palette, Menu, Droplet, X, Paintbrush, CaseSensitive, Bold, Italic } from 'lucide-react'
import type { NodeStyle } from './types'
import type { BuilderNodeData, NodeKind } from './types'

const iconMap: Record<NodeKind, any> = {
  male: User,
  female: UserRound,
  company: Building2,
  meeting: Users,
  bar: Coffee,
  restaurant: UtensilsCrossed,
  vehicle: Car,
  motorcycle: Bike,
}

function colorFor(kind: NodeKind): string {
  switch (kind) {
    case 'male': return '#3b82f6' // blue
    case 'female': return '#f59e0b' // amber
    case 'company': return '#64748b' // slate
    case 'meeting': return '#8b5cf6' // violet
    case 'bar': return '#92400e' // amber-900
    case 'restaurant': return '#ef4444' // red
    case 'vehicle': return '#475569' // slate-600
    case 'motorcycle': return '#0ea5e9' // sky
    default: return '#64748b'
  }
}

export default function NodeView(props: any) {
  const data: BuilderNodeData = props.data
  const nodeId: string | undefined = (data as any).nodeId ?? props.id
  const size = 26 // ~35% smaller than previous 40
  const Icon = iconMap[data.kind]
  let col = colorFor(data.kind)
  if (data.kind === 'male') col = '#60a5fa' // azzurro
  if (data.kind === 'female') col = '#ec4899' // rosa
  const ps = data.details?.hasPs ? 'Sì' : 'No'
  const dob = data.details?.dob || ''
  const ageStr = dob ? ` (${calcAgeFromDob(dob)})` : ''
  const ref = React.useRef<HTMLDivElement | null>(null)
  const { zoom } = useViewport()
  const inv = 1 / Math.max(0.01, zoom)
  React.useEffect(() => {
    if (data.centerAt && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const ev = new CustomEvent('gb:center-node', { detail: { id: nodeId, width: r.width, height: r.height, center: data.centerAt } })
      window.dispatchEvent(ev)
    }
  }, [data.centerAt])
  const [hoverLabel, setHoverLabel] = React.useState(false)
  const [openPal, setOpenPal] = React.useState(false)
  const [snapshot, setSnapshot] = React.useState<NodeStyle | undefined>(undefined)
  const [editing, setEditing] = React.useState(false)
  const [labelDraft, setLabelDraft] = React.useState<string>(data.label)
  const [multiDraft, setMultiDraft] = React.useState<string>('')
  const [editRect, setEditRect] = React.useState<{ w:number; h:number } | null>(null)
  const textRef = React.useRef<HTMLTextAreaElement | null>(null)
  const baseFontSize = data.style?.textFontSizePx ?? 6
  const baseFontWeight: React.CSSProperties['fontWeight'] = data.style?.textBold ? 700 : 300
  const baseFontStyle: React.CSSProperties['fontStyle'] = data.style?.textItalic ? 'italic' : 'normal'
  const baseTextColor = data.style?.textColor
  const labelWidth = Math.max(72, data.style?.labelWidthPx ?? 72)
  const labelRef = React.useRef<HTMLDivElement | null>(null)
  const [showResize, setShowResize] = React.useState(false)
  const startRef = React.useRef<{ startX: number; startW: number; side: 'left'|'right' } | null>(null)
  const onResizeStart = (e: React.MouseEvent, side: 'left'|'right') => {
    e.stopPropagation(); e.preventDefault()
    const rectW = labelRef.current?.getBoundingClientRect().width ?? labelWidth
    startRef.current = { startX: e.clientX, startW: rectW, side }
    const onMove = (ev: MouseEvent) => {
      const s = startRef.current; if (!s) return
      const dx = ev.clientX - s.startX
      let w = s.startW + (s.side === 'right' ? dx : -dx)
      w = Math.max(60, Math.min(260, w))
      const ns = { ...(data.style||{}), labelWidthPx: Math.round(w) } as NodeStyle
      window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: nodeId, style: ns } }))
    }
    const onUp = () => {
      startRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.dispatchEvent(new CustomEvent('gb:style-commit', { detail:{ id: nodeId } }))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  React.useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!ref.current) return
      const target = e.target as Node
      if (!ref.current.contains(target)) {
        setShowResize(false)
      }
    }
    window.addEventListener('mousedown', onDocMouseDown)
    return () => window.removeEventListener('mousedown', onDocMouseDown)
  }, [])
  React.useEffect(() => {
    if (editing && labelRef.current) {
      const r = labelRef.current.getBoundingClientRect()
      setEditRect({ w: r.width, h: r.height })
    }
  }, [editing])

  const autoResize = React.useCallback(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  React.useEffect(() => { if (editing) autoResize() }, [editing, autoResize])
  const openInlineEdit = () => {
    setEditing(true)
    setShowResize(false)
    const full = [data.label, (dob ? `${dob}${ageStr}` : ''), ((data.kind==='male'||data.kind==='female') ? `Precedenti PS: ${ps}` : '')].filter(Boolean).join('\n')
    setMultiDraft(full)
  }
  const [hoverNode, setHoverNode] = React.useState(false)
  return (
    <div ref={ref} onMouseEnter={()=>setHoverNode(true)} onMouseLeave={()=>setHoverNode(false)} style={{ width: labelWidth, pointerEvents: 'auto', position:'relative', fontWeight: baseFontWeight, fontStyle: baseFontStyle, color: baseTextColor }} className="select-none group drag-handle" >
      {/* Target al centro (connectionMode='loose' consente drop ovunque sul nodo) */}
      <Handle id="target-center" type="target" position={Position.Bottom} className="opacity-0" style={{ left:'50%', top:'50%', transform:'translate(-50%, -50%)' }} />
      <div className="mx-auto relative" style={{ width: size, height: size, borderRadius: '9999px', display:'grid', placeItems:'center', position:'relative', boxShadow:`0 0 0 ${Math.max(1, data.style?.ringWidth ?? 1)}px ${data.style?.ringColor ?? col}`, background: data.style?.ringFill ?? '#fff' }}>
        <Icon size={16} color={col} />
        {((data.style?.bigXSizePx ?? 0) > 0 || data.style?.showBigX) && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents:'none' }}>
            <X size={data.style?.bigXSizePx ?? 24} color={data.style?.bigXColor ?? (data.style?.ringColor ?? '#ef4444')} strokeWidth={3} />
          </div>
        )}
        {/* Floating action icons mid-right of circle */}
        <div className="absolute top-1/2 -translate-y-1/2 z-10" style={{ left: '100%', marginLeft: 8, transform:`translateY(-50%) scale(${inv})`, transformOrigin:'center left', opacity: hoverNode ? 1 : 0, transition:'opacity 120ms ease' }} onMouseEnter={()=>setHoverNode(true)}>
          <div className="flex items-center gap-2 text-slate-500">
            <button className="hover:text-sky-600 transition-colors" title="Modifica etichetta" onClick={(e)=>{ e.stopPropagation(); openInlineEdit() }}>
              <Pencil size={12} />
            </button>
            <button className="hover:text-sky-600 transition-colors" title="Stile nodo" onClick={(e)=>{ e.stopPropagation(); setSnapshot(data.style); setOpenPal(true) }}>
              <Palette size={12} />
            </button>
            <button className="hover:text-red-600 transition-colors" title="Elimina" onClick={(e)=>{ e.stopPropagation(); data.onDelete && data.onDelete() }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
      <div ref={labelRef} className="mt-1 text-center leading-tight px-1 whitespace-pre-line relative" style={{ fontSize: baseFontSize }} title={data.label} onMouseEnter={()=>setHoverLabel(true)} onMouseLeave={()=>setHoverLabel(false)} onClick={(e)=>{ e.stopPropagation(); setShowResize(v=>!v) }}>
        {editing && (
          <textarea
            autoFocus
            ref={textRef}
            className="absolute left-0 top-0 w-full border border-slate-300 rounded-md px-1 py-0.5 text-[inherit] leading-tight resize-none overflow-hidden bg-white/95 shadow-sm"
            style={{ width: Math.max((editRect?.w || 0), 140), height: editRect?.h ? editRect.h * 1.1 : 'auto', minHeight: editRect?.h ? editRect.h * 1.1 : 24 }}
            value={multiDraft}
            onChange={(e)=>{ setMultiDraft(e.target.value); autoResize() }}
            onClick={(e)=>e.stopPropagation()}
            onKeyDown={(e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); window.dispatchEvent(new CustomEvent('gb:rename-node', { detail:{ id: nodeId, fullText: multiDraft } })); setEditing(false); } if (e.key==='Escape'){ setEditing(false); setMultiDraft('') } }}
            onBlur={()=>{ window.dispatchEvent(new CustomEvent('gb:rename-node', { detail:{ id: nodeId, fullText: multiDraft } })); setEditing(false) }}
          />
        )}
        <div className={`relative ${editing ? 'opacity-0 pointer-events-none' : ''}`}>
          <div className="inline-block align-middle w-full">{data.label}</div>
          {data.labelBlock ? (
            <div className="whitespace-pre-line">{data.labelBlock}</div>
          ) : (
            <>
              {dob && <div>{dob}{ageStr}</div>}
              {(data.kind==='male' || data.kind==='female') && (
                <div className="text-slate-600" style={{ color: baseTextColor || undefined }}>Precedenti PS: {ps}</div>
              )}
            </>
          )}
        </div>
        {showResize && (
          <div className="pointer-events-auto" style={{ position:'absolute', inset: 0, transform:`scale(${inv})`, transformOrigin:'top left' }}>
            <div className="absolute w-2 h-2 -top-1 -left-1 bg-sky-500 border border-white rounded-sm cursor-ew-resize" onMouseDown={(e)=>onResizeStart(e,'left')} title="Ridimensiona" />
            <div className="absolute w-2 h-2 -bottom-1 -left-1 bg-sky-500 border border-white rounded-sm cursor-ew-resize" onMouseDown={(e)=>onResizeStart(e,'left')} title="Ridimensiona" />
            <div className="absolute w-2 h-2 -top-1 -right-1 bg-sky-500 border border-white rounded-sm cursor-ew-resize" onMouseDown={(e)=>onResizeStart(e,'right')} title="Ridimensiona" />
            <div className="absolute w-2 h-2 -bottom-1 -right-1 bg-sky-500 border border-white rounded-sm cursor-ew-resize" onMouseDown={(e)=>onResizeStart(e,'right')} title="Ridimensiona" />
          </div>
        )}
      </div>
      <Handle id="center" type="source" position={Position.Bottom} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ left:'50%', top:'50%', transform:'translate(-50%,-50%)', width:16, height:16, background:'#334155', borderRadius: 9999 }} />

      {openPal && (
        <div className="absolute z-50 bg-white border shadow-xl rounded p-3 text-[12px] nodrag w-48" style={{ left: 76, top: -4, transform: `scale(${inv})`, transformOrigin: 'top left' }} onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()}>
          <div className="mb-2 font-medium">Stile nodo</div>
          <div className="grid gap-1.5 items-center">
            {/* Spessore + Colore bordo */}
            <div className="grid grid-cols-[16px,1fr,24px] items-center gap-1.5">
              <Menu className="w-4 h-4 text-slate-600" title="Spessore bordo" />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="w-full h-1 nodrag" type="range" min={0} max={12} defaultValue={String(data.style?.ringWidth ?? 1)} onChange={(e)=>{ const ns = { ...(data.style||{}), ringWidth: Number(e.target.value) } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="h-5 w-5 nodrag" type="color" defaultValue={data.style?.ringColor ?? '#64748b'} title="Colore bordo" onChange={(e)=>{ const ns = { ...(data.style||{}), ringColor: e.target.value } as NodeStyle; if (ns.ringFill) { const base = ns.ringFillColor ?? e.target.value; ns.ringFill = toSoftGradient(base, ns.ringFillAlpha ?? 0.12) } window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
            </div>
            {/* Trasparenza + Colore riempimento */}
            <div className="grid grid-cols-[16px,1fr,24px] items-center gap-1.5">
              <Droplet className="w-4 h-4 text-slate-600" title="Riempimento (trasparente ⟵⟶ colore)" />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="w-full h-1 nodrag" type="range" min={0} max={100} defaultValue={String(data.style?.ringFill ? Math.round((data.style?.ringFillAlpha ?? 1)*100) : 0)}
                onChange={(e)=>{ const v = Number(e.target.value); const a = v/100; const base = data.style?.ringFillColor ?? data.style?.ringColor ?? '#64748b'; const ns = { ...(data.style||{}), ringFillAlpha: a, ringFill: v===0 ? null : toSoftGradient(base, a) } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="h-5 w-5 nodrag" type="color" defaultValue={data.style?.ringFillColor ?? (data.style?.ringColor ?? '#64748b')} title="Colore riempimento" onChange={(e)=>{ const base = e.target.value; const ns = { ...(data.style||{}), ringFillColor: base } as NodeStyle; const alpha = ns.ringFillAlpha ?? 0.12; ns.ringFill = (ns.ringFill || (data.style?.ringFillAlpha ?? 0) > 0) ? toSoftGradient(base, alpha) : null; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
            </div>
            {/* Font size + colore */}
            <div className="grid grid-cols-[16px,1fr,24px] items-center gap-1.5">
              <CaseSensitive className="w-4 h-4 text-slate-600" title="Dimensione font" />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="w-full h-1 nodrag" type="range" min={6} max={14} defaultValue={String(data.style?.textFontSizePx ?? 6)}
                onChange={(e)=>{ const ns = { ...(data.style||{}), textFontSizePx: Number(e.target.value) } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="h-5 w-5 nodrag" type="color" defaultValue={data.style?.textColor ?? '#0f172a'} title="Colore testo" onChange={(e)=>{ const ns = { ...(data.style||{}), textColor: e.target.value } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
            </div>
            {/* Bold / Italic toggles */}
            <div className="grid grid-cols-[16px,1fr,24px] items-center gap-1.5">
              <Bold className="w-4 h-4 text-slate-600" />
              <div className="flex items-center gap-2">
                <button className={`px-1 py-0.5 border rounded ${data.style?.textBold ? 'bg-slate-800 text-white' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{ e.stopPropagation(); const ns = { ...(data.style||{}), textBold: !data.style?.textBold } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} title="Grassetto" type="button"><Bold size={14} /></button>
                <button className={`px-1 py-0.5 border rounded ${data.style?.textItalic ? 'bg-slate-800 text-white' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{ e.stopPropagation(); const ns = { ...(data.style||{}), textItalic: !data.style?.textItalic } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} title="Corsivo" type="button"><Italic size={14} /></button>
              </div>
              <div />
            </div>
            {/* X size + color */}
            <div className="grid grid-cols-[16px,1fr,24px] items-center gap-1.5">
              <X className="w-4 h-4 text-slate-600" title="Dimensione 'X'" />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="w-full h-1 nodrag" type="range" min={0} max={36} defaultValue={String(data.style?.bigXSizePx ?? (data.style?.showBigX ? 24 : 0))}
                onChange={(e)=>{ const v = Number(e.target.value); const ns = { ...(data.style||{}), bigXSizePx: v, showBigX: v > 0 } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
              <input onMouseDown={(e)=>e.stopPropagation()} onPointerDown={(e)=>e.stopPropagation()} className="h-5 w-5 nodrag" type="color" defaultValue={data.style?.bigXColor ?? (data.style?.ringColor ?? '#ef4444')} title="Colore 'X'" onChange={(e)=>{ const ns = { ...(data.style||{}), bigXColor: e.target.value } as NodeStyle; window.dispatchEvent(new CustomEvent('gb:style-preview', { detail:{ id: data.nodeId, style: ns } })) }} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="px-2 py-1 border rounded" onClick={()=>{ window.dispatchEvent(new CustomEvent('gb:style-apply', { detail:{ id: data.nodeId, style: snapshot } })); setOpenPal(false) }}>Annulla</button>
            <button className="px-2 py-1 bg-blue-600 text-white rounded" onClick={()=>{ window.dispatchEvent(new CustomEvent('gb:style-commit', { detail:{ id: data.nodeId } })); setOpenPal(false) }}>Applica</button>
          </div>
        </div>
      )}
    </div>
  )
}

function calcAgeFromDob(dob: string): number | '' {
  const m = dob.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return ''
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const hasHadBirthday = (now.getMonth() > d.getMonth()) || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate())
  if (!hasHadBirthday) age--
  return age
}

function toSoftGradient(hex: string, alpha: number): string {
  const m = hex.replace('#','').match(/.{1,2}/g)
  if (!m) return ''
  const [r,g,b] = m.map(s=>parseInt(s,16))
  const a1 = Math.max(0, Math.min(1, alpha))
  const a2 = Math.max(0, Math.min(1, alpha/3))
  return `linear-gradient(180deg, rgba(${r},${g},${b},${a1}), rgba(${r},${g},${b},${a2}))`
}


