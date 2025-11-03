import React from 'react'
import { Search } from 'lucide-react'

interface TopBarProps {
  totalPages: number
  pageInput: string
  onPageInputChange: (value: string) => void
  onJump: (page: number) => void
  searchQ: string
  onSearchQChange: (value: string) => void
  onOpenSearchPanel: () => void
  showAdvanced: boolean
  onCloseSearchPanel: () => void
}

export const TopBar: React.FC<TopBarProps> = ({
  totalPages,
  pageInput,
  onPageInputChange,
  onJump,
  searchQ,
  onSearchQChange,
  onOpenSearchPanel,
  showAdvanced,
  onCloseSearchPanel
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1 text-sm bg-white flex-shrink-0">
      <div className="flex items-center gap-1">
        <input
          className="w-16 border rounded px-1 py-0.5 text-center"
          value={pageInput}
          onChange={(e) => onPageInputChange(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const p = Math.max(1, Math.min(totalPages || 1, parseInt(pageInput || '1', 10)))
              onJump(p)
            }
          }}
        />
        <span className="text-muted-foreground whitespace-nowrap px-1">/ {totalPages || '-'}</span>
      </div>

      {/* Pulsante Cerca a destra della toolbar */}
      <div className="ml-auto flex items-center gap-2">
        {showAdvanced ? (
          <button
            className="px-3 py-1 border rounded bg-blue-100 border-blue-400 hover:bg-blue-200"
            title="Chiudi pannello ricerca"
            onClick={onCloseSearchPanel}
          >
            Chiudi ricerca
          </button>
        ) : (
          <button
            className="px-3 py-1 border rounded bg-white hover:bg-gray-50"
            title="Apri pannello ricerca"
            onClick={onOpenSearchPanel}
          >
            <Search size={16} className="inline-block mr-1" />
            Cerca
          </button>
        )}
      </div>
    </div>
  )
}