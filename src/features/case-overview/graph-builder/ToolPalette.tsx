import React from 'react'
import { User, UserRound, Building2, Users, Coffee, UtensilsCrossed, Car, Bike, Gavel } from 'lucide-react'
import type { NodeKind } from './types'

const items: { id: NodeKind; label: string; Icon: any }[] = [
  { id: 'male', label: 'Uomo', Icon: User },
  { id: 'female', label: 'Donna', Icon: UserRound },
  { id: 'company', label: 'Impresa', Icon: Building2 },
  { id: 'meeting', label: 'Incontro', Icon: Users },
  { id: 'bar', label: 'Bar', Icon: Coffee },
  { id: 'restaurant', label: 'Ristorante', Icon: UtensilsCrossed },
  { id: 'vehicle', label: 'Veicolo', Icon: Car },
  { id: 'motorcycle', label: 'Moto', Icon: Bike },
  { id: 'other_investigation', label: 'Altra indagine', Icon: Gavel },
]

export function ToolPalette() {
  return (
    <div className="w-[84px] border-r bg-white h-full p-2 flex flex-col gap-2 select-none">
      {items.map(({ id, label, Icon }) => (
        <div
          key={id}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('application/x-node-kind', id); e.dataTransfer.effectAllowed = 'copy' }}
          className="flex flex-col items-center gap-1 p-2 rounded hover:bg-slate-50 cursor-grab active:cursor-grabbing"
          title={`Trascina ${label}`}
        >
          <Icon size={28} />
          <div className="text-[11px] text-center leading-tight">{label}</div>
        </div>
      ))}
    </div>
  )
}


