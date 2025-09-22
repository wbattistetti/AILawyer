import React, { useMemo } from 'react'
import type { CaseGraph } from '../types/graph'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash } from 'lucide-react'
import { DrawerWall, DrawerItem } from '../../drawers/DrawerWall'

export function CabinetView({ graph, onOpen }: { graph: CaseGraph; onOpen: (nodeId: string) => void }) {
  const colorFor = (label?: string) => {
    const s = (label || '').toLowerCase()
    // Usa gli stessi colori del flowchart (GraphCanvas.colorFor)
    if (s.includes('avvocati') || s.includes('elenco nomi') || s.includes('anagrafe ent')) return '#3b82f6' // blue
    if (s.includes('atti ed eventi') || s.includes('incontri') || s.includes('intercett')) return '#ec4899' // pink
    if (s.includes('verbale')) return '#f59e0b' // amber
    if (s.includes('difens')) return '#10b981' // emerald
    return '#64748b' // slate (default)
  }

  const iconFor = (label?: string) => {
    const s = (label || '').toLowerCase()
    if (s.includes('verbale')) return <FileText className="w-4 h-4 text-amber-600" />
    if (s.includes('difens')) return <Gavel className="w-4 h-4 text-emerald-600" />
    if (s.includes('incontri') || s.includes('eventi')) return <Zap className="w-4 h-4 text-pink-600" />
    if (s.includes('intercett')) return <Hash className="w-4 h-4 text-pink-600" />
    if (s.includes('procura')) return <Landmark className="w-4 h-4 text-violet-600" />
    if (s.includes('ufficio pg')) return <Shield className="w-4 h-4 text-slate-700" />
    if (s.includes('contatti') || s.includes('telefon')) return <Phone className="w-4 h-4 text-blue-600" />
    if (s.includes('timeline') || s.includes('termini')) return <Clock className="w-4 h-4 text-slate-600" />
    if (s.includes('anagrafe') || s.includes('avvocati') || s.includes('elenco nomi')) return <Users className="w-4 h-4 text-blue-700" />
    if (s.includes('reati')) return <Boxes className="w-4 h-4 text-slate-700" />
    return <Boxes className="w-4 h-4 text-slate-600" />
  }

  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({})
  const items: DrawerItem[] = useMemo(() => graph.nodes.map(n => ({
    id: n.id,
    color: colorFor(n.label),
    label: n.label,
    icon: iconFor(n.label),
    isOpen: !!openMap[n.id],
  })), [graph, openMap])

  const handleToggle = (id: string) => {
    setOpenMap(m => ({ ...m, [id]: !m[id] }))
    onOpen(id)
  }

  return (
    <DrawerWall items={items} onToggle={handleToggle} className="w-full h-full" />
  )
}

export default CabinetView


