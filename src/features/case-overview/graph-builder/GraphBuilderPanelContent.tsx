/**
 * Contenuto pannello graph-builder: nota a tutta larghezza + canvas.
 *
 * Il canvas viene montato solo quando il catalogo è disponibile, così l'unica
 * idratazione parte da dati definitivi e non può sovrascrivere modifiche utente.
 */

import React, { useCallback } from 'react'
import GraphBuilder, { type GraphBuilderHandle } from './GraphBuilder'
import { GraphNoteBar } from './GraphNoteBar'
import { useGraphWorkspace } from './graph-workspace-context'

export type GraphBuilderPanelContentProps = {
  graphId: string
  praticaId?: string
  registerHandle: (graphId: string, handle: GraphBuilderHandle | null) => void
}

/** Shell del pannello grafo collegata al catalogo workspace. */
export function GraphBuilderPanelContent({
  graphId,
  praticaId,
  registerHandle,
}: GraphBuilderPanelContentProps) {
  const {
    graphsById,
    isCatalogLoaded,
    catalogLoadError,
    openNoteByGraphId,
    setGraphNote,
    closeGraphNote,
    updateGraphContent,
  } = useGraphWorkspace()
  const savedGraph = graphsById.get(graphId) ?? null
  const noteOpen = openNoteByGraphId.get(graphId) === true
  const noteValue = savedGraph?.note ?? ''

  const handleRef = useCallback(
    (handle: GraphBuilderHandle | null) => registerHandle(graphId, handle),
    [graphId, registerHandle],
  )

  if (catalogLoadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background p-4 text-sm text-destructive">
        Impossibile leggere i grafi salvati della pratica: {catalogLoadError}
      </div>
    )
  }

  if (!isCatalogLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-sm text-muted-foreground">
        Caricamento grafo…
      </div>
    )
  }

  if (!savedGraph) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background p-4 text-sm text-destructive">
        Grafo «{graphId}» assente dal catalogo della pratica: chiudi e riapri la tab.
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-hidden bg-background flex flex-col">
      {noteOpen && (
        <GraphNoteBar
          value={noteValue}
          onChange={(next) => setGraphNote(graphId, next)}
          onClose={() => closeGraphNote(graphId)}
        />
      )}
      <div className="flex-1 min-h-0">
        <GraphBuilder
          key={graphId}
          ref={handleRef}
          praticaId={praticaId}
          graphId={graphId}
          savedGraph={savedGraph}
          onGraphContentChange={updateGraphContent}
        />
      </div>
    </div>
  )
}
