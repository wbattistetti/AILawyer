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
  onDrop?: (files: File[], drawerId: string) => void
}

export function DrawerTabStrip({ items, selectedId, onSelect, className, onDrop }: Props) {
  const [draggedOverId, setDraggedOverId] = React.useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent, drawerId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
      setDraggedOverId(drawerId)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedOverId(null)
  }

  const handleDrop = (e: React.DragEvent, drawerId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedOverId(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && onDrop) {
      onDrop(files, drawerId)
    }
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-1 overflow-x-auto ${className || ''}`}>
      {items.map((item, index) => {
        const isSelected = item.id === selectedId
        const isDraggedOver = draggedOverId === item.id
        const tabNumber = index + 1

        return (
          <button
            key={item.id}
            onClick={() => {
              console.log('[DRAWER-TAB-STRIP][CLICK]', { itemId: item.id, itemLabel: item.label })
              onSelect(item.id)
            }}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-t-lg border border-b-0
              transition-all whitespace-nowrap
              ${isSelected
                ? 'bg-white border-slate-300 shadow-sm'
                : isDraggedOver
                ? 'bg-blue-50 border-blue-300 shadow-md'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }
            `}
            style={{
              borderTopColor: isSelected ? item.color : undefined,
              borderTopWidth: isSelected ? '3px' : undefined,
            }}
          >
            {/* Numero all'inizio */}
            <span className={`text-sm font-semibold ${isSelected ? 'text-slate-700' : 'text-slate-500'}`}>
              {tabNumber}
            </span>

            {/* Icona */}
            {item.icon && (
              <span className="flex-shrink-0" style={{ color: item.color }}>
                {item.icon}
              </span>
            )}

            {/* Descrizione */}
            <span className={`text-sm font-medium ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default DrawerTabStrip

