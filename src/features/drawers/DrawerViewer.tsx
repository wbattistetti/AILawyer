import React from 'react'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash } from 'lucide-react'

function iconFor(title?: string) {
  const s = (title || '').toLowerCase()
  if (s.includes('verbale')) return <FileText size={24} className="text-amber-600" />
  if (s.includes('difens')) return <Gavel size={24} className="text-emerald-600" />
  if (s.includes('incontri') || s.includes('eventi')) return <Zap size={24} className="text-pink-600" />
  if (s.includes('intercett')) return <Hash size={24} className="text-pink-600" />
  if (s.includes('procura')) return <Landmark size={24} className="text-violet-600" />
  if (s.includes('ufficio pg')) return <Shield size={24} className="text-slate-700" />
  if (s.includes('contatti') || s.includes('telefon')) return <Phone size={24} className="text-blue-600" />
  if (s.includes('timeline') || s.includes('termini')) return <Clock size={24} className="text-slate-600" />
  if (s.includes('anagrafe') || s.includes('avvocati') || s.includes('elenco nomi')) return <Users size={24} className="text-blue-700" />
  if (s.includes('reati')) return <Boxes size={24} className="text-slate-700" />
  return <Boxes size={24} className="text-slate-600" />
}

export function DrawerViewer({ id, title }: { id: string; title: string }) {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Niente header qui: titolo/icona saranno nella tab */}
      <div className="flex-1 overflow-auto p-3 text-sm">
        <div className="text-muted-foreground">Viewer del cassetto</div>
        <div className="mt-1"><span className="font-medium">ID:</span> {id}</div>
        <div className="mt-2 text-muted-foreground">Qui si può rendere un viewer specifico per tipo di cassetto.</div>
      </div>
    </div>
  )
}

export default DrawerViewer


