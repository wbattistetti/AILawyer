/**
 * Context workspace multi-grafo: catalogo, note aperte e azioni tab/panel.
 * I pannelli Dockview restano montati e si aggiornano via context.
 */

import React, { createContext, useContext } from 'react'
import type { SavedGraph } from './graphSerialization'

export type GraphWorkspaceContextValue = {
  graphsById: Map<string, SavedGraph>
  openNoteByGraphId: Map<string, boolean>
  renameGraph: (graphId: string, name: string) => void
  setGraphNote: (graphId: string, note: string) => void
  toggleGraphNote: (graphId: string) => void
  closeGraphNote: (graphId: string) => void
  deleteGraph: (graphId: string) => void
}

const GraphWorkspaceContext = createContext<GraphWorkspaceContextValue | null>(null)

export function GraphWorkspaceProvider({
  value,
  children,
}: {
  value: GraphWorkspaceContextValue
  children: React.ReactNode
}) {
  return (
    <GraphWorkspaceContext.Provider value={value}>
      {children}
    </GraphWorkspaceContext.Provider>
  )
}

/** Accesso tipizzato al workspace grafi; fallisce se usato fuori dal provider. */
export function useGraphWorkspace(): GraphWorkspaceContextValue {
  const ctx = useContext(GraphWorkspaceContext)
  if (!ctx) {
    throw new Error('useGraphWorkspace richiede GraphWorkspaceProvider')
  }
  return ctx
}
