/**
 * Graph edge with mid-point hover toolbar (edit caption, relation menu, delete).
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { BaseEdge, EdgeProps, useReactFlow } from 'reactflow'
import { Pencil, Settings2, Trash2 } from 'lucide-react'
import { abstractRelationCaption } from './relation-phrase'
import { addCustomRelation } from './custom-relation-store'
import InlineTextEditor from './InlineTextEditor'
import type { NodeKind, RelationKind } from './types'

const DEFAULT_CAPTION_FONT_SIZE_PX = 14

export default function EdgeWithTooltip(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, style, data } = props
  const rf = useReactFlow()
  const [hover, setHover] = React.useState(false)
  const pathRef = React.useRef<SVGPathElement | null>(null)
  const textRef = React.useRef<SVGTextElement | null>(null)
  const toolbarTimer = React.useRef<number | null>(null)
  const [editingCaption, setEditingCaption] = React.useState(false)
  const [captionDraft, setCaptionDraft] = React.useState('')
  const [iconHover, setIconHover] = React.useState<null | 'edit' | 'gear' | 'trash'>(null)

  const GRACE_MS = 350
  const cancelToolbarHide = () => {
    if (toolbarTimer.current) {
      window.clearTimeout(toolbarTimer.current)
      toolbarTimer.current = null
    }
  }
  const scheduleToolbarHide = () => {
    cancelToolbarHide()
    toolbarTimer.current = window.setTimeout(() => {
      if (!editingCaption) setHover(false)
    }, GRACE_MS) as unknown as number
  }

  const R_SRC = 20
  const R_TGT = 20
  const SIZE = 40
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
  const sx = srcC.x + ux * R_SRC
  const sy = srcC.y + uy * R_SRC
  const tx = tgtC.x - ux * R_TGT
  const ty = tgtC.y - uy * R_TGT
  const path = `M ${sx},${sy} L ${tx},${ty}`
  const midX = (sx + tx) / 2
  const midY = (sy + ty) / 2
  const title = (data?.tooltip as string) || ''
  const strokeDasharray = data?.dashed ? '6 6' : undefined
  const isPreview = (data as any)?.preview === true
  const baseStroke = (data as any)?.strokeWidth ?? (style as any)?.strokeWidth ?? 0.75
  const strokeWidth = hover ? baseStroke * 2 : baseStroke
  const edgeStyle: React.CSSProperties = {
    ...(style || {}),
    stroke: (data as any)?.strokeColor ?? (style as any)?.stroke ?? '#0f172a',
    strokeWidth,
    strokeLinecap: 'round' as any,
    opacity: isPreview ? 0.6 : 1,
    strokeDasharray: isPreview ? '6 3' : undefined,
  }

  const sourceNode: any = rf.getNode((props as any).source)
  const sourceKind = (sourceNode?.data?.kind || 'person') as NodeKind
  const relation = (data as any)?.relation as RelationKind | undefined
  const captionFontSize = (data as any)?.captionFontSizePx ?? DEFAULT_CAPTION_FONT_SIZE_PX
  let caption = ''
  try {
    if (relation) {
      caption = abstractRelationCaption(relation, sourceKind, (data as any)?.customCaption)
    }
  } catch {
    caption = (data as any)?.customCaption || labelFallback(relation)
  }

  const openRelationMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    let clientX = e.clientX
    let clientY = e.clientY
    try {
      const svg = pathRef.current?.ownerSVGElement
      if (svg?.getScreenCTM) {
        const pt = svg.createSVGPoint()
        pt.x = midX
        pt.y = midY
        const sp = pt.matrixTransform(svg.getScreenCTM()!)
        clientX = sp.x
        clientY = sp.y
      }
    } catch { /* keep mouse coords */ }
    window.dispatchEvent(new CustomEvent('gb:edit-edge', {
      detail: {
        edgeId: id,
        sourceId: (props as any).source,
        targetId: (props as any).target,
        clientX,
        clientY,
        screen: true,
      },
    }))
  }

  const startCaptionEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCaptionDraft(caption || '')
    setEditingCaption(true)
    setHover(true)
  }

  const commitCaptionEdit = () => {
    const text = captionDraft.trim()
    setEditingCaption(false)
    if (!text) return
    try {
      const saved = addCustomRelation(text)
      window.dispatchEvent(new CustomEvent('gb:edge-caption', {
        detail: {
          id,
          relation: 'custom',
          customMiddle: saved.middle,
          customCaption: saved.caption,
        },
      }))
    } catch {
      // empty caption rejected
    }
  }

  const toolbarVisible = hover || editingCaption

  return (
    <g>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...edgeStyle, strokeDasharray }} />
      <path ref={pathRef} id={`${id}-label`} d={path} fill="none" stroke="none" />

      {/* Hit band on the path + parallel tolerance bands */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        pointerEvents="stroke"
        onMouseEnter={() => { cancelToolbarHide(); setHover(true) }}
        onMouseLeave={() => scheduleToolbarHide()}
      >
        {title ? <title>{title}</title> : null}
      </path>
      {(() => {
        const off = 10
        const nx = -uy * off
        const ny = ux * off
        const p1 = `M ${sx + nx},${sy + ny} L ${tx + nx},${ty + ny}`
        const p2 = `M ${sx - nx},${sy - ny} L ${tx - nx},${ty - ny}`
        return (
          <g pointerEvents="stroke" stroke="transparent" strokeWidth={10} fill="none">
            <path d={p1} onMouseEnter={() => { cancelToolbarHide(); setHover(true) }} onMouseLeave={() => scheduleToolbarHide()} />
            <path d={p2} onMouseEnter={() => { cancelToolbarHide(); setHover(true) }} onMouseLeave={() => scheduleToolbarHide()} />
          </g>
        )
      })()}

      {/* Mid-edge toolbar: pencil / gear / trash */}
      <g
        transform={`translate(${midX}, ${midY})`}
        onMouseEnter={() => { cancelToolbarHide(); setHover(true) }}
        onMouseLeave={() => scheduleToolbarHide()}
        style={{ opacity: toolbarVisible ? 1 : 0, pointerEvents: toolbarVisible ? 'all' : 'none' }}
      >
        <rect x={-36} y={-14} width={72} height={28} fill="white" fillOpacity={0.92} rx={6} stroke="#e2e8f0" />
        <rect x={-32} y={-10} width={20} height={20} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => setIconHover('edit')} onMouseLeave={() => setIconHover(null)}
          onMouseDown={e => e.stopPropagation()} onClick={startCaptionEdit} />
        <rect x={-10} y={-10} width={20} height={20} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => setIconHover('gear')} onMouseLeave={() => setIconHover(null)}
          onMouseDown={e => e.stopPropagation()} onClick={openRelationMenu} />
        <rect x={12} y={-10} width={20} height={20} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => setIconHover('trash')} onMouseLeave={() => setIconHover(null)}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('gb:delete-edge', { detail: { id } }))
          }} />
        <g transform="translate(-30, -8)" style={{ pointerEvents: 'none' }}>
          <Pencil width={16} height={16} color={iconHover === 'edit' ? '#0284c7' : '#9ca3af'} />
        </g>
        <g transform="translate(-8, -8)" style={{ pointerEvents: 'none' }}>
          <Settings2 width={16} height={16} color={iconHover === 'gear' ? '#0284c7' : '#9ca3af'} />
        </g>
        <g transform="translate(14, -8)" style={{ pointerEvents: 'none' }}>
          <Trash2 width={16} height={16} color={iconHover === 'trash' ? '#dc2626' : '#9ca3af'} />
        </g>
      </g>

      {/* Caption */}
      {relation && !editingCaption && (
        <g>
          <rect
            x={midX - Math.max(48, caption.length * captionFontSize * 0.55) / 2}
            y={midY - ((captionFontSize + 6) / 2) - 1 - (toolbarVisible ? 18 : 0)}
            width={Math.max(48, caption.length * captionFontSize * 0.55)}
            height={captionFontSize + 6}
            rx={3}
            fill="white"
            fillOpacity={0.92}
            pointerEvents="none"
          />
          <text
            ref={textRef}
            x={midX}
            y={midY - (toolbarVisible ? 18 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={captionFontSize}
            fill={(data as any)?.captionColor || '#0f172a'}
            style={{
              fontFamily: 'var(--font-family)',
              fontWeight: (data as any)?.captionBold ? 600 : 400,
              fontStyle: (data as any)?.captionItalic ? 'italic' : 'normal',
            }}
            pointerEvents="all"
            onMouseEnter={() => { cancelToolbarHide(); setHover(true) }}
            onMouseLeave={() => scheduleToolbarHide()}
            onDoubleClick={startCaptionEdit}
          >
            {caption}
          </text>
        </g>
      )}

      {editingCaption && createPortal(
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 10000,
            pointerEvents: 'none',
          }}
        >
          <CaptionEditPortal
            edgeId={id}
            draft={captionDraft}
            onChange={setCaptionDraft}
            onCommit={commitCaptionEdit}
            onCancel={() => setEditingCaption(false)}
            pathRef={pathRef}
            midX={midX}
            midY={midY}
          />
        </div>,
        document.body,
      )}
    </g>
  )
}

function CaptionEditPortal({
  draft,
  onChange,
  onCommit,
  onCancel,
  pathRef,
  midX,
  midY,
}: {
  edgeId: string
  draft: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  pathRef: React.RefObject<SVGPathElement | null>
  midX: number
  midY: number
}) {
  const [screen, setScreen] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 })

  React.useEffect(() => {
    const svg = pathRef.current?.ownerSVGElement
    if (!svg?.getScreenCTM) {
      setScreen({ left: midX, top: midY })
      return
    }
    const pt = svg.createSVGPoint()
    pt.x = midX
    pt.y = midY
    const sp = pt.matrixTransform(svg.getScreenCTM()!)
    setScreen({ left: sp.x - 90, top: sp.y - 40 })
  }, [pathRef, midX, midY])

  return (
    <div
      style={{
        position: 'fixed',
        left: screen.left,
        top: screen.top,
        pointerEvents: 'auto',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <InlineTextEditor
        value={draft}
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
        aria-label="Caption relazione"
        placeholder="Nuova relazione"
        autoWidth
        style={{
          padding: '2px 4px',
          borderRadius: 4,
          background: '#ffffff',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.12)',
          fontSize: DEFAULT_CAPTION_FONT_SIZE_PX,
        }}
        inputStyle={{ fontSize: DEFAULT_CAPTION_FONT_SIZE_PX }}
      />
    </div>
  )
}

function labelFallback(relation: RelationKind | undefined): string {
  if (!relation || relation === 'custom') return 'Relazione'
  return String(relation)
}
