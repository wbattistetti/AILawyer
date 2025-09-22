import React from 'react'
import { Handle, Position } from 'reactflow'
import { User, Users, FileText, Gavel, Package, Hash, Clock, Briefcase, Landmark, Smartphone, Zap, FileBadge, Shield } from 'lucide-react'
import type { CaseNode } from '../types/graph'

function shapePath(kind: string, w: number, h: number) {
  const r = 10
  // Unifica la forma: sempre rettangolo arrotondato
  return <rect x={0} y={0} width={w} height={h} rx={r} />
}

export function NodeBlock({ node, color, count }: { node: CaseNode; color: string; count: number }) {
  const w = 160, h = 80
  const log = (...a: any[]) => { try { if ((window as any).__OV_LOG) console.log('[OV][node]', ...a) } catch {} }
  const isCenter = node.id === 'soggetto'
  // Specific overrides by id/label
  const labelLc = (node.label || '').toLowerCase()
  const iconOverride = (() => {
    if (node.id === 'avvocati' || labelLc.includes('avvocati')) return Briefcase
    if (node.id === 'procura' || labelLc.includes('procura')) return Landmark
    if (node.id === 'ufficioPG' || labelLc.includes('ufficio pg')) return Shield
    if (labelLc.includes('contatti') && labelLc.includes('telefon')) return Smartphone
    if (labelLc.includes('elenco') && labelLc.includes('nomi')) return Users
    if (labelLc.includes('atti') && labelLc.includes('eventi')) return Zap
    if (labelLc.includes('verbale') && labelLc.includes('sequest')) return FileBadge
    // "manette" non presente in tutte le versioni di lucide-react; fallback a FileBadge
    if (labelLc.includes('verbale') && labelLc.includes('arrest')) return FileBadge
    return undefined
  })()

  const Icon = iconOverride ?? (() => {
    switch (node.kind) {
      case 'ENTITY': return User
      case 'DOCUMENT': return FileText
      case 'MEASURE': return Gavel
      case 'EVENT': return Hash
      case 'EVIDENCE': return Package
      case 'TIMELINE': return Clock
      case 'CONTAINER':
      default: return Users
    }
  })()
  return (
    <div className="relative pointer-events-auto cursor-grab active:cursor-grabbing drag-handle" style={{ width: w, height: h, WebkitUserSelect:'none', userSelect:'none' }} onMouseDown={(e)=>{ log('mousedown', node.id, {x:e.clientX,y:e.clientY, btn:e.button}) }} onPointerDown={(e)=>{ log('pointerdown', node.id, {x:e.clientX,y:e.clientY, btn:e.button}) }}>
      {/* Target at bottom center for all nodes */}
      <Handle id="bottom" type="target" position={Position.Bottom} className="opacity-0" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 0 }} />
      {/* Target at visual center for precise border intersection computations */}
      <Handle id="center" type="target" position={Position.Bottom} className="opacity-0" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      {/* Source at center only for the central node. The edge path inside the node stays hidden under the node. */}
      {isCenter && (
        <Handle id="center" type="source" position={Position.Bottom} className="opacity-0" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      )}
      <svg width={w} height={h} style={{ pointerEvents: 'none' }}>
        {/* Opaque fill to hide edges passing underneath the node, so links appear to exit/enter at the border */}
        <g fill="#ffffff" stroke="none">
          {shapePath(node.kind, w, h)}
        </g>
        <g fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2}>
          {shapePath(node.kind, w, h)}
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-[12px] select-none px-2">
        <Icon size={30} strokeWidth={2.25} className="shrink-0 text-neutral-700" />
        <div className="font-medium text-center break-words text-ellipsis overflow-hidden" style={{ lineHeight: '1.1', maxWidth: w - 48 }} title={node.label}>{node.label}</div>
      </div>
      <div className="absolute top-1 right-1 text-[10px] bg-white border rounded px-1 nodrag">{count}</div>
    </div>
  )
}


