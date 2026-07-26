/**
 * Chrome condiviso del pannello ricerca (header + corpo + SearchSurface).
 */

import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'
import { SearchSurface } from './SearchSurface'

interface SearchPanelChromeProps {
  kind: 'document' | 'practice'
  title: string
  headerContent?: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  headerClassName?: string
  'data-component'?: string
  'data-document-kind'?: string
}

/**
 * Intestazione e cornice unificate per pannello documento e pratica.
 */
export function SearchPanelChrome({
  kind,
  title,
  headerContent,
  onClose,
  children,
  className = '',
  style,
  headerClassName = 'document-search-header flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted flex-shrink-0',
  ...dataAttrs
}: SearchPanelChromeProps) {
  return (
    <SearchSurface
      kind={kind}
      className={`relative z-50 isolate h-full border-l bg-background flex flex-col overflow-hidden min-w-0 ${className}`}
      style={style}
      {...dataAttrs}
    >
      <div className={headerClassName}>
        {headerContent ?? (
          <h3 className="min-w-0 truncate font-semibold text-sm" title={title}>
            {title}
          </h3>
        )}
        <button
          type="button"
          className="rounded p-1 hover:bg-background"
          title="Chiudi pannello"
          aria-label="Chiudi pannello"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </SearchSurface>
  )
}
