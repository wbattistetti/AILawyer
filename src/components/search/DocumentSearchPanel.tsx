/**
 * Pannello di ricerca documento: compose chrome + provider + albero.
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { cryptoRandom } from '../../utils/misc'
import { SearchProvider } from './SearchProvider'
import { SearchPanelTree, type SearchPanelTreeHandle } from './SearchPanelTree'
import { SearchPanelChrome } from './SearchPanelChrome'
import type { DocumentSearchAdapter, SearchResultNode, SearchScope } from './types'

interface DocumentSearchPanelProps {
  adapter: DocumentSearchAdapter
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  width: number
  resizingRef: React.MutableRefObject<boolean>
  query: string
  onQueryChange: (query: string) => void
  enableExpandedContext?: boolean
  copyPageTextOnNavigate?: boolean
}

export const DocumentSearchPanel = React.memo(function DocumentSearchPanel({
  adapter,
  isOpen,
  onOpenChange,
  width,
  resizingRef,
  query,
  onQueryChange,
  enableExpandedContext = false,
  copyPageTextOnNavigate = false
}: DocumentSearchPanelProps) {
  const searchTreeRef = useRef<SearchPanelTreeHandle>(null)

  const runSearch = useCallback(
    async (searchQuery: string, scope: SearchScope): Promise<SearchResultNode> => {
      const matches = await adapter.search(searchQuery, scope)
      return {
        id: cryptoRandom(),
        query: searchQuery,
        scope,
        total: matches.length,
        groups: [{ doc: adapter.document, matches }]
      }
    },
    [adapter]
  )

  const adapterFactory = useCallback(
    (docId: string) => {
      if (docId !== adapter.document.id) {
        throw new Error(`Adapter ricerca non disponibile per il documento "${docId}"`)
      }
      return { goToMatch: adapter.goToMatch }
    },
    [adapter]
  )

  useLayoutEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(() => searchTreeRef.current?.focusInput())
  }, [isOpen])

  return (
    <>
      {isOpen && (
        <div
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            resizingRef.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          className="group cursor-col-resize transition-colors hover:bg-muted bg-transparent flex items-center justify-center"
          style={{
            width: '6px',
            minWidth: '6px',
            height: '100%',
            position: 'relative',
            zIndex: 1000,
            userSelect: 'none',
            touchAction: 'none'
          }}
          title="Trascina per ridimensionare"
        >
          <GripVertical size={12} className="text-transparent group-hover:text-muted-foreground transition-colors" />
        </div>
      )}

      <SearchPanelChrome
        kind="document"
        data-component="document-search-panel"
        data-document-kind={adapter.document.kind}
        title={`Cerca in ${adapter.document.title || 'questo documento'}`}
        onClose={() => onOpenChange(false)}
        style={{
          width: isOpen ? width : 0,
          minWidth: 0,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        <SearchProvider
          defaultScope="current"
          initialQuery={query}
          autoSearch={false}
          onSearch={runSearch}
          adapterFactory={adapterFactory}
        >
          <SearchPanelTree
            ref={searchTreeRef}
            rolePrefix={adapter.document.kind}
            showInput
            showScopeSelector={false}
            initialQuery={query}
            searchQuery={query}
            onSearchQueryChange={onQueryChange}
            domUncontrolledSearch
            resetSearchKey={adapter.document.id}
            isVisible={isOpen}
            enableExpandedContext={enableExpandedContext}
            copyPageTextOnNavigate={copyPageTextOnNavigate}
            currentScopeLabel={adapter.document.kind === 'pdf' ? 'Questo PDF' : 'Questo documento'}
          />
        </SearchProvider>
      </SearchPanelChrome>
    </>
  )
})
