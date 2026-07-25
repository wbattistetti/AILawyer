/**
 * Ricerca globale della pratica: textbox in barra tab + pannello risultati a destra.
 */

import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Documento } from '../../../../types'
import type { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3'
import { searchPracticeArchive, type PracticeSearchDocument } from '../../../search/archiveSearch'
import { SearchInput } from '../../../search/SearchInput'
import { SearchPanelTree } from '../../../search/SearchPanelTree'
import { SearchProvider, useSearch } from '../../../search/SearchProvider'
import { SearchSurface } from '../../../search/SearchSurface'

interface SearchRendererProps {
  praticaId: string
  documenti: Documento[]
  dockV2Ref: React.RefObject<DockWorkspaceV3Handle | null>
  toast: (options: { title: string; description?: string }) => void
}

const waitForViewer = (docId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('app:viewer-ready', handleReady)
      reject(new Error(`Il viewer del documento "${docId}" non è diventato disponibile`))
    }, 10_000)
    const handleReady = (event: Event) => {
      const readyDocId = (event as CustomEvent<{ docId?: string }>).detail?.docId
      if (readyDocId !== docId) return
      window.clearTimeout(timeoutId)
      window.removeEventListener('app:viewer-ready', handleReady)
      resolve()
    }
    window.addEventListener('app:viewer-ready', handleReady)
  })

/**
 * Textbox sempre nella riga delle tab; i risultati aprono il pannello verticale condiviso.
 */
function PracticeSearchChrome({
  panelOpen,
  onPanelOpenChange,
  onError
}: {
  panelOpen: boolean
  onPanelOpenChange: (open: boolean) => void
  onError: (message: string) => void
}) {
  const { results } = useSearch()
  const [query, setQuery] = useState('')

  return (
    <SearchSurface
      kind="practice"
      className="flex h-full flex-col items-end pointer-events-none"
    >
      <div className="pointer-events-auto">
        <SearchInput
          rolePrefix="archive"
          searchQuery={query}
          onSearchQueryChange={setQuery}
          showScopeSelector={false}
          placeholder="Cerca in tutti i documenti…"
          variant="compact"
          onSearchStart={() => onPanelOpenChange(true)}
          onSearchError={(error) => onError(error.message)}
        />
      </div>

      {panelOpen && (
        <div className="pointer-events-auto flex min-h-0 w-80 flex-1 flex-col overflow-hidden border-l bg-background shadow-lg">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted px-3 py-2">
            <h3 className="truncate text-sm font-semibold">
              Risultati pratica{results[0] ? ` · ${results[0].total}` : ''}
            </h3>
            <button
              type="button"
              className="rounded p-1 hover:bg-background"
              title="Chiudi risultati"
              aria-label="Chiudi risultati"
              onClick={() => onPanelOpenChange(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SearchPanelTree
              rolePrefix="archive"
              showInput={false}
              showScopeSelector={false}
              enableExpandedContext={false}
              copyPageTextOnNavigate={false}
            />
          </div>
        </div>
      )}
    </SearchSurface>
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

  const searchableDocuments = useMemo<PracticeSearchDocument[]>(
    () => documenti
      .filter((document) => !praticaId || (document as Documento).praticaId === praticaId || !(document as Documento).praticaId)
      .map((document) => ({
        id: document.id,
        title: document.filename,
        hash: document.hash || '',
        kind: document.mime?.includes('word') ? 'word' : 'pdf'
      })),
    [documenti, praticaId]
  )

  const practiceDocuments = useMemo(
    () => documenti.filter((document) =>
      !document.praticaId || document.praticaId === praticaId
    ),
    [documenti, praticaId]
  )

  return (
    <SearchProvider
      defaultScope="archive"
      registry={{
        getAllDocs: () => searchableDocuments.map((document) => ({ ...document, pages: 0 })),
        getOpenDocs: () => [],
        ensureDocOpen: async (docId: string) => {
          const document = practiceDocuments.find((candidate) => candidate.id === docId)
          const title = document?.filename
            || searchableDocuments.find((candidate) => candidate.id === docId)?.title
            || docId

          const workspace = dockV2Ref.current
          if (!workspace) {
            throw new Error('Impossibile aprire il documento: workspace non pronto')
          }

          const viewerAlreadyMounted = workspace.openDoc({ id: docId, title })
          if (!viewerAlreadyMounted && !document?.mime?.includes('word')) {
            await waitForViewer(docId)
          }
          toast({ title: 'Documento aperto', description: title })
        }
      }}
      onSearch={(query) => searchPracticeArchive(query, praticaId, searchableDocuments)}
    >
      <PracticeSearchChrome
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        onError={(message) => {
          toast({ title: 'Ricerca non riuscita', description: message })
        }}
      />
    </SearchProvider>
  )
}
