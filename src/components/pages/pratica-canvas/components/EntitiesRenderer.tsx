/**
 * Pannello dock delle entità tipizzate: collega store documenti e apertura occorrenze.
 */

import React from 'react'
import { DockWorkspaceV3Handle } from '../../../DockWorkspaceV3'
import { EntityCardsPanel } from '../../../../features/generic-entities/EntityCardsPanel'
import { openOccurrenceInViewer } from '../../../../features/entities/open-occurrence-in-viewer'
import { findPracticeDocument } from '../../../../features/entities/practice-document-source'
import { useViewerSearchNavigatorRegistry } from '../../../search/ViewerSearchNavigatorProvider'

interface EntitiesRendererProps {
  praticaId: string
  dockV2Ref: React.RefObject<DockWorkspaceV3Handle | null>
  toast: { (options: { title: string; description?: string; variant?: string }): void }
}

/** Renderizza il pannello entità nel workspace dock. */
export function EntitiesRenderer({ praticaId, dockV2Ref, toast }: EntitiesRendererProps) {
  const registry = useViewerSearchNavigatorRegistry()

  return (
    <EntityCardsPanel
      praticaId={praticaId}
      onOpenOccurrence={(occurrence, context) => {
        void (async () => {
          const document = findPracticeDocument(praticaId, occurrence.docId)
          if (!document) {
            throw new Error(`Documento non trovato per la fonte ${occurrence.docId}`)
          }
          const isWord = document.mime?.includes('word')
            || document.filename.toLowerCase().endsWith('.docx')
            || document.filename.toLowerCase().endsWith('.doc')
          try {
            await openOccurrenceInViewer({
              registry,
              openDoc: (doc) => {
                dockV2Ref.current?.openDoc(doc)
              },
              target: {
                docId: document.id,
                title: document.filename,
                page: occurrence.page,
                box: occurrence.box,
                snippet: occurrence.snippet,
                occurrenceId: occurrence.id,
                highlightQuery: context?.highlightQuery || occurrence.snippet?.slice(0, 80),
                highlightTerms: context?.highlightTerms,
                kind: isWord ? 'word' : 'pdf',
              },
            })
            toast({
              title: 'Aperto nel Tavolo',
              description: `${document.filename} · p. ${occurrence.page}`,
            })
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Apertura fonte fallita'
            toast({ title: 'Impossibile aprire la fonte', description: message, variant: 'destructive' })
            throw cause instanceof Error ? cause : new Error(message)
          }
        })()
      }}
    />
  )
}
