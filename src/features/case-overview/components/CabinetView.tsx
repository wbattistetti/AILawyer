import React, { useMemo } from 'react'
import type { CaseGraph } from '../types/graph'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash } from 'lucide-react'
import { DrawerWall, DrawerItem } from '../../drawers/DrawerWall'
import type { DrawerType } from '../../drawers/types'
// Aggiungi import per API call
import { api } from '@/lib/api'
import { useState, useEffect } from 'react'
import type { Comparto } from '@/types'

export function CabinetView({ graph, onOpen, praticaId }: {
  graph: CaseGraph;
  onOpen: (nodeId: string) => void;
  praticaId: string;
}) {

  const [comparti, setComparti] = useState<Comparto[]>([])
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  // Chiamata API diretta invece di useQuery
  useEffect(() => {
    if (praticaId) {
      api.getComparti(praticaId)
        .then(comparti => {
          setComparti(comparti)
        })
        .catch(console.error)
    }
  }, [praticaId])

  const colorFor = (label?: string) => {
    const s = (label || '').toLowerCase()

    // Colori per i comparti dell'armadio
    if (s.includes('da classificare')) return '#ef4444' // red
    if (s.includes('admin') || s.includes('procure')) return '#8b5cf6' // violet
    if (s.includes('parti') || s.includes('anagrafiche')) return '#3b82f6' // blue
    if (s.includes('corrispondenza') || s.includes('pec')) return '#06b6d4' // cyan
    if (s.includes('denuncia') || s.includes('querela') || s.includes('reato')) return '#dc2626' // red-600
    if (s.includes('indagini') || s.includes('preliminari')) return '#f59e0b' // amber
    if (s.includes('perizie') || s.includes('consulenze') || s.includes('ctp') || s.includes('ctu')) return '#10b981' // emerald
    if (s.includes('prove') || s.includes('allegati') || s.includes('foto') || s.includes('audio') || s.includes('chat')) return '#ec4899' // pink
    if (s.includes('udienze') || s.includes('verbali')) return '#f59e0b' // amber
    if (s.includes('provvedimenti') || s.includes('giudice') || s.includes('gip') || s.includes('gup') || s.includes('trib')) return '#6366f1' // indigo
    if (s.includes('cliente') || s === 'a') return '#84cc16' // lime (per i clienti)

    return '#64748b' // slate (default)
  }

  const iconFor = (label?: string) => {
    const s = (label || '').toLowerCase()

    // Icone per i comparti dell'armadio (più piccole)
    if (s.includes('da classificare')) return <Boxes className="w-3 h-3 text-red-600" />
    if (s.includes('admin') || s.includes('procure')) return <Landmark className="w-3 h-3 text-violet-600" />
    if (s.includes('parti') || s.includes('anagrafiche')) return <Users className="w-3 h-3 text-blue-600" />
    if (s.includes('corrispondenza') || s.includes('pec')) return <FileText className="w-3 h-3 text-cyan-600" />
    if (s.includes('denuncia') || s.includes('querela') || s.includes('reato')) return <Gavel className="w-3 h-3 text-red-600" />
    if (s.includes('indagini') || s.includes('preliminari')) return <Shield className="w-3 h-3 text-amber-600" />
    if (s.includes('perizie') || s.includes('consulenze') || s.includes('ctp') || s.includes('ctu')) return <FileText className="w-3 h-3 text-emerald-600" />
    if (s.includes('prove') || s.includes('allegati') || s.includes('foto') || s.includes('audio') || s.includes('chat')) return <Boxes className="w-3 h-3 text-pink-600" />
    if (s.includes('udienze') || s.includes('verbali')) return <Clock className="w-3 h-3 text-amber-600" />
    if (s.includes('provvedimenti') || s.includes('giudice') || s.includes('gip') || s.includes('gup') || s.includes('trib')) return <Gavel className="w-3 h-3 text-indigo-600" />
    if (s.includes('cliente') || s === 'a') return <Users className="w-3 h-3 text-lime-600" />

    return <Boxes className="w-3 h-3 text-slate-600" />
  }

  function typeFor(label?: string): DrawerType | undefined {
    const s = (label || '').toLowerCase()
    // Document collections
    if (s.includes('elenco verbali') || s.includes('verbale di sequestro') || s.includes('verbale di arresto') || s.includes('reati contestati') || s.includes('intercett')) return 'DocumentCollection'
    return undefined
  }

  // Usa tutti i comparti per i cassetti dell'armadio
  const allItems = useMemo(() => {
    // ✅ TUTTI i comparti/documenti per i cassetti dell'armadio
    const allCompartiItems = comparti?.map(c => {
      const color = colorFor(c.nome)
      const icon = iconFor(c.nome)
      console.log('[CABINET] Processing comparto:', c.nome, 'color:', color, 'icon:', icon)
      return {
        id: c.key,
        label: c.nome,
        color: color, // usa la funzione colorFor per i colori
        icon: icon, // usa la funzione iconFor per le icone
        isOpen: !!openMap[c.key],
        type: typeFor(c.nome) as const
      }
    }) || []

    console.log('[CABINET] Creating drawers:', allCompartiItems.length, 'items:', allCompartiItems)
    return allCompartiItems
  }, [comparti, openMap])

  const handleToggle = (id: string) => {
    setOpenMap(m => ({ ...m, [id]: !m[id] }))
    onOpen(id)
  }

  return (
    <DrawerWall items={allItems} onToggle={handleToggle} className="w-full h-full" />
  )
}

export default CabinetView


