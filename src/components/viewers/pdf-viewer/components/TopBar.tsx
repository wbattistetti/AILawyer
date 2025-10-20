import React from 'react'
import { Search, PanelRightOpen } from 'lucide-react'

interface TopBarProps {
  totalPages: number
  pageInput: string
  onPageInputChange: (value: string) => void
  onJump: (page1Based: number) => void
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
  const handlePageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const p = Math.max(1, Math.min(totalPages || 1, parseInt(pageInput || '1', 10)))
      onJump(p)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onOpenSearchPanel()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1 text-sm bg-white">
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <input 
          className="w-16 border rounded px-1 py-0.5 text-center" 
          value={pageInput} 
          onChange={(e) => onPageInputChange(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={handlePageKeyDown}
        />
        <span className="text-muted-foreground whitespace-nowrap px-1">/ {totalPages || '-'}</span>
      </div>

      {/* Quick search bar - hidden when panel open */}
      {!showAdvanced && (
        <div className="flex items-center gap-1 ml-2">
          <Search size={16} className="text-gray-500" />
          <input 
            value={searchQ} 
            onChange={(e) => onSearchQChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Cerca nel documento" 
            className="w-72 border rounded px-2 py-1" 
          />
          <button 
            className="px-2 py-1 border rounded" 
            title="Apri pannello ricerca" 
            onClick={onOpenSearchPanel}
          >
            <PanelRightOpen size={16} />
          </button>
        </div>
      )}
      
      {/* Button to close panel when open */}
      {showAdvanced && (
        <button 
          className="px-2 py-1 border rounded bg-blue-100 border-blue-400" 
          title="Chiudi pannello ricerca" 
          onClick={onCloseSearchPanel}
        >
          <PanelRightOpen size={16} className="rotate-180" />
        </button>
      )}
    </div>
  )
}
