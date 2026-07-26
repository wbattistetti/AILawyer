/**
 * Ricerca globale della pratica: colonna flex a destra (non overlay), chrome Cerca/Chiudi.
 */

import React, { useCallback, useMemo, useState } from 'react'
import type { Documento } from '../../../../types'
import type { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3'
import { searchPracticeArchive, type PracticeSearchDocument } from '../../../search/archiveSearch'
import { SearchInput } from '../../../search/SearchInput'
import { SearchPanelChrome } from '../../../search/SearchPanelChrome'
import { SearchPanelToggle } from '../../../search/SearchPanelToggle'
import { SearchPanelTree } from '../../../search/SearchPanelTree'
import { SearchProvider } from '../../../search/SearchProvider'
import { SearchSurface } from '../../../search/SearchSurface'
import type { DocumentMatch } from '../../../search/types'
import { resolvePracticeSearchDocument } from './resolvePracticeSearchDocument'

interface SearchRendererProps {
  praticaId: string
  documenti: Documento[]
  dockV2Ref: React.RefObject<DockWorkspaceV3Handle | null>
  toast: (options: { title: string; description?: string }) => void
}

/**
 * Stato chiuso: solo pulsante sulla tab bar. Stato aperto: colonna che spinge il dock.
 */
function PracticeSearchChrome({
  panelOpen,
  onPanelOpenChange
}: {
  panelOpen: boolean
  onPanelOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')

  if (!panelOpen) {
    return (
      <SearchSurface
        kind="practice"
        className="absolute right-0 top-0 z-[60] flex h-9 items-center bg-background px-1"
      >
        <SearchPanelToggle
          open={false}
          onOpenChange={onPanelOpenChange}
          openLabel="Cerca"
        />
      </SearchSurface>
    )
  }

  return (
    <SearchPanelChrome
      kind="practice"
      title="Cerca globale"
      headerContent={(
        <SearchInput
          rolePrefix="archive"
          searchQuery={query}
          onSearchQueryChange={setQuery}
          showScopeSelector={false}
          placeholder="Cerca in tutti i documenti…"
          variant="compact"
        />
      )}
      headerClassName="flex h-9 shrink-0 items-center border-b bg-background p-0"
      onClose={() => onPanelOpenChange(false)}
      className="w-80 shrink-0 border-l shadow-none"
    >
      <SearchPanelTree
        rolePrefix="archive"
        showInput={false}
        showScopeSelector={false}
        enableExpandedContext={false}
        copyPageTextOnNavigate={false}
      />
    </SearchPanelChrome>
  )
}

/**
 * Collegamento ricerca globale ↔ apertura documenti della pratica.
 */
export function SearchRenderer({
  praticaId,
  documenti,
  dockV2Ref,
  toast
}: SearchRendererProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  const practiceDocuments = useMemo(
    () => documenti.filter((document) =>
      !document.praticaId || document.praticaId === praticaId
    ),
    [documenti, praticaId]
  )

  const searchableDocuments = useMemo<PracticeSearchDocument[]>(
    () => practiceDocuments.map((document) => ({
      id: document.id,
      title: document.filename,
      hash: document.hash || '',
      kind: document.mime?.includes('word') ? 'word' : 'pdf',
      ...(document.s3Key ? { storageKey: document.s3Key } : {})
    })),
    [practiceDocuments]
  )

  const ensureDocOpen = useCallback(async (docId: string, match?: DocumentMatch): Promise<string> => {
    const document = resolvePracticeSearchDocument(
      practiceDocuments,
      docId,
      match?.docTitle
    )
    if (!document) {
      throw new Error(
        `Documento non disponibile nel tavolo: ${match?.docTitle || docId}`
      )
    }

    const workspace = dockV2Ref.current
    if (!workspace) {
      throw new Error('Impossibile aprire il documento: workspace non pronto')
    }

    const viewerAlreadyMounted = workspace.openDoc({
      id: document.id,
      title: document.filename
    })

    if (!viewerAlreadyMounted) {
      toast({ title: 'Documento aperto', description: document.filename })
    }

    return document.id
  }, [dockV2Ref, practiceDocuments, toast])

  return (
    <SearchProvider
      defaultScope="archive"
      registry={{
        getAllDocs: () => searchableDocuments.map((document) => ({ ...document, pages: 0 })),
        getOpenDocs: () => [],
        ensureDocOpen
      }}
      onSearch={async (query) => {
        setPanelOpen(true)
        return searchPracticeArchive(query, praticaId, searchableDocuments)
      }}
    >
      <PracticeSearchChrome
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
      />
    </SearchProvider>
  )
}
