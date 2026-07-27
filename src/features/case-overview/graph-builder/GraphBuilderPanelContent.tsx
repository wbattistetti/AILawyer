/**
 * Contenuto pannello graph-builder: nota a tutta larghezza + canvas.
 */

import React from 'react'
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
  const { graphsById, openNoteByGraphId, setGraphNote, closeGraphNote } = useGraphWorkspace()
  const savedGraph = graphsById.get(graphId) ?? null
  const graphName = savedGraph?.name ?? 'Grafo'
  const noteOpen = openNoteByGraphId.get(graphId) === true
  const noteValue = savedGraph?.note ?? ''

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
          ref={(handle) => registerHandle(graphId, handle)}
          praticaId={praticaId}
          graphId={graphId}
          graphName={graphName}
          savedGraph={savedGraph}
        />
      </div>
    </div>
  )
}
