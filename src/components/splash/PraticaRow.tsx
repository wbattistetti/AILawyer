import React from 'react'
import { FileEdit, Trash2 } from 'lucide-react'
import { Pratica } from '@/types'

interface PraticaRowProps {
  pratica: Pratica
  isDraft: boolean
  isDeleting: boolean
  secondsLeft: number
  hovered: boolean
  onOpen: () => void
  onDelete: () => void
  onUndo: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function PraticaRow({
  pratica,
  isDraft,
  isDeleting,
  secondsLeft,
  hovered,
  onOpen,
  onDelete,
  onUndo,
  onMouseEnter,
  onMouseLeave
}: PraticaRowProps) {
  return (
    <div
      className={`group relative border-b last:border-b-0 transition ${
        isDraft
          ? 'border-amber-100 hover:bg-amber-50 bg-amber-50/30'
          : 'hover:bg-slate-50'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={onOpen}
        className="w-full text-left p-2.5 pr-40"
      >
        <div className="font-medium flex items-center gap-2 text-sm">
          {isDraft && (
            <FileEdit className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <span className={`font-mono text-xs ${isDraft ? 'text-amber-700' : 'text-slate-600'}`}>
            {pratica.numeroRuolo || 'N/A'}
          </span>
          <span className={isDraft ? 'text-amber-900' : 'text-slate-900'}>
            {pratica.cliente}
          </span>
        </div>
      </button>

      {/* Toast Undo o Delete Button */}
      {isDeleting ? (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUndo()
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium text-white whitespace-nowrap"
          >
            Annulla eliminazione
          </button>
          <span className="text-xs text-slate-500 min-w-[30px] text-right">
            {secondsLeft}s
          </span>
        </div>
      ) : (
        hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-red-100 rounded text-red-600"
            title="Elimina pratica"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )
      )}
    </div>
  )
}
