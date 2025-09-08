import React from 'react'
import { Eye, Table, Trash } from 'lucide-react'

interface ThumbCardProps {
  title: string
  imgSrc: string
  selected?: boolean
  onSelect?: () => void
  onPreview?: () => void
  onTable?: () => void
  onRemove?: () => void
}

export function ThumbCard({ title, imgSrc, selected, onSelect, onPreview, onTable, onRemove }: ThumbCardProps) {
  return (
    <div
      className="relative group select-none rounded-md"
      title={title}
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      onDoubleClick={(e) => { e.stopPropagation(); onPreview?.() }}
    >
      <div className={`w-40 h-56 border rounded-sm bg-white overflow-hidden flex items-center justify-center ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        <img src={imgSrc} alt={title} className="max-w-full max-h-full object-contain" />
      </div>
      {/* Hover actions - centered */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
        <div className="pointer-events-auto inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm shadow px-2 py-1 rounded">
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPreview?.() }}
            aria-label="Anteprima"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTable?.() }}
            aria-label="Azione tabella"
          >
            <Table className="w-4 h-4" />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-white"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove?.() }}
            aria-label="Rimuovi"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mt-1 text-xs break-words leading-snug max-w-[10rem]">{title}</div>
    </div>
  )
}


