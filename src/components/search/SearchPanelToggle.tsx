/**
 * Toggle condiviso Cerca / Chiudi ricerca (documento e globale).
 */

import { PanelRightOpen, Search } from 'lucide-react'

interface SearchPanelToggleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  openLabel?: string
  closeLabel?: string
  className?: string
  /** Evita che Dockview rubi il focus al click. */
  stopPropagation?: boolean
}

/**
 * Un solo controllo UI per aprire/chiudere il pannello ricerca.
 */
export function SearchPanelToggle({
  open,
  onOpenChange,
  openLabel = 'Cerca',
  closeLabel = 'Chiudi ricerca',
  className = '',
  stopPropagation = false
}: SearchPanelToggleProps) {
  if (open) {
    return (
      <button
        type="button"
        className={`px-2 py-1 border rounded bg-accent text-accent-foreground hover:bg-accent/80 text-sm ${className}`}
        title={closeLabel}
        aria-label={closeLabel}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation()
          onOpenChange(false)
        }}
      >
        <PanelRightOpen size={16} className="inline-block mr-1 rotate-180" />
        {closeLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`px-2 py-1 border rounded bg-background text-foreground hover:bg-muted text-sm ${className}`}
      title={openLabel}
      aria-label={openLabel}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation()
        onOpenChange(true)
      }}
    >
      <Search size={16} className="inline-block mr-1" />
      {openLabel}
    </button>
  )
}
