/**
 * Context workspace multi-grafo: catalogo, note aperte e azioni tab/panel.
 * I pannelli Dockview restano montati e si aggiornano via context.
 */

import React, { createContext, useContext } from 'react'
import type { GraphContent, SavedGraph } from './graphSerialization'

export type GraphWorkspaceContextValue = {
  /** Catalogo dei grafi: fonte di verità di contenuto e metadati. */
  graphsById: ReadonlyMap<string, SavedGraph>
  /** False finché lo stato salvato della pratica non è stato letto. */
  isCatalogLoaded: boolean
  /** Messaggio di errore se lo stato salvato è illeggibile. */
  catalogLoadError: string | null
  openNoteByGraphId: ReadonlyMap<string, boolean>
  renameGraph: (graphId: string, name: string) => void
  setGraphNote: (graphId: string, note: string) => void
  toggleGraphNote: (graphId: string) => void
  closeGraphNote: (graphId: string) => void
  deleteGraph: (graphId: string) => void
  /** Riversa nel catalogo nodi/edge/viewport correnti di un canvas. */
  updateGraphContent: (graphId: string, content: GraphContent) => void
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
