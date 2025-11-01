import React from 'react'
import type { DrawerType } from './types'

export type DrawerTabItem = {
  id: string
  label: string
  icon?: React.ReactNode
  color: string
  type?: DrawerType
}

type Props = {
  items: DrawerTabItem[]
  selectedId?: string
  onSelect: (id: string) => void
  className?: string
}

const numberWords = ['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
  'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti']

function getTabNumber(index: number): string {
  if (index < numberWords.length) {
    return numberWords[index]
  }
  return `Tab ${index + 1}`
}

export function DrawerTabStrip({ items, selectedId, onSelect, className }: Props) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1 overflow-x-auto ${className || ''}`}>
      {items.map((item, index) => {
        const isSelected = item.id === selectedId
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-t-lg border border-b-0
              transition-all whitespace-nowrap
              ${isSelected
                ? 'bg-white border-slate-300 shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }
            `}
            style={{
              borderTopColor: isSelected ? item.color : undefined,
              borderTopWidth: isSelected ? '3px' : undefined,
            }}
          >
            {item.icon && (
              <span className="flex-shrink-0" style={{ color: item.color }}>
                {item.icon}
              </span>
            )}
            <span className={`text-sm font-medium ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
              {item.label}
            </span>
            <span className={`text-xs ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>
              Tab {getTabNumber(index)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default DrawerTabStrip

