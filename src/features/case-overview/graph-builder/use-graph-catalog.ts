/**
 * Catalogo dei grafi di una pratica: stato React e persistenza.
 *
 * È l'unica fonte di verità di contenuto e metadati: i canvas montati vi
 * riversano le proprie modifiche, quindi chiudere una tab o cambiare pannello
 * non perde nulla. La logica sul catalogo vive in `graph-catalog-operations`;
 * qui restano solo lo stato, lo specchio sincrono e la persistenza differita.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  parseGraphsState,
  serializeGraphsState,
  type GraphContent,
  type SavedGraph,
} from './graphSerialization'
import * as catalogOps from './graph-catalog-operations'
import type { GraphCatalogState } from './graph-catalog-operations'

/** Attesa prima di scrivere il catalogo, per accorpare modifiche ravvicinate. */
const PERSIST_DEBOUNCE_MS = 500

export type UseGraphCatalogOptions = {
  /**
   * JSON `Pratica.graphsState`.
   * `undefined` = ancora in caricamento, `null` = pratica senza grafi salvati.
   */
  graphsState: string | null | undefined
  /** Riceve il catalogo serializzato; mai invocata prima del caricamento. */
  onPersist: (graphsState: string) => void
}

export type GraphCatalog = {
  graphsById: GraphCatalogState
  /** False finché lo stato salvato non è stato letto: i canvas devono attendere. */
  isLoaded: boolean
  /** Valorizzato se `graphsState` è illeggibile: il catalogo resta non caricato. */
  loadError: string | null
  openNoteByGraphId: ReadonlyMap<string, boolean>
  listGraphs: () => SavedGraph[]
  /** Crea un grafo vuoto con nome generico progressivo e lo restituisce. */
  createGraph: () => SavedGraph
  /** Registra un grafo mancante, per le tab ripristinate dal layout salvato. */
  ensureGraph: (graphId: string, name: string) => void
  renameGraph: (graphId: string, name: string) => void
  setGraphNote: (graphId: string, note: string) => void
  toggleGraphNote: (graphId: string) => void
  closeGraphNote: (graphId: string) => void
  removeGraph: (graphId: string) => void
  updateGraphContent: (graphId: string, content: GraphContent) => void
}

export function useGraphCatalog({ graphsState, onPersist }: UseGraphCatalogOptions): GraphCatalog {
  const [graphsById, setGraphsById] = useState<GraphCatalogState>(new Map())
  const [openNoteByGraphId, setOpenNoteByGraphId] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Specchio sincrono del catalogo: resta valido anche mentre React smonta
  // l'albero, quando gli aggiornamenti di stato verrebbero scartati.
  const graphsByIdRef = useRef(graphsById)
  const isLoadedRef = useRef(false)
  const onPersistRef = useRef(onPersist)
  const lastPersistedRef = useRef<string | null>(null)
  const pendingPayloadRef = useRef<string | null>(null)

  useEffect(() => {
    onPersistRef.current = onPersist
  }, [onPersist])

  /** Aggiorna insieme lo stato di render e lo specchio sincrono. */
  const commitCatalog = useCallback((
    update: (previous: GraphCatalogState) => GraphCatalogState,
  ) => {
    const next = update(graphsByIdRef.current)
    if (next === graphsByIdRef.current) return
    graphsByIdRef.current = next
    setGraphsById(next)
  }, [])

  useEffect(() => {
    if (isLoadedRef.current || graphsState === undefined) return
    let saved: SavedGraph[]
    try {
      saved = parseGraphsState(graphsState)
    } catch (err) {
      // Niente `isLoaded`: senza dati validi il catalogo non deve essere
      // riscritto, altrimenti sovrascriverebbe lo stato salvato con uno vuoto.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GRAPH-CATALOG] Stato grafi non leggibile:', message)
      setLoadError(message)
      return
    }
    commitCatalog((previous) => catalogOps.mergeSavedGraphs(previous, saved))
    isLoadedRef.current = true
    lastPersistedRef.current = serializeGraphsState(Array.from(graphsByIdRef.current.values()))
    setLoadError(null)
    setIsLoaded(true)
  }, [graphsState, commitCatalog])

  const flushPersist = useCallback(() => {
    const payload = pendingPayloadRef.current
    pendingPayloadRef.current = null
    if (payload === null || payload === lastPersistedRef.current) return
    lastPersistedRef.current = payload
    onPersistRef.current(payload)
  }, [])

  const flushPersistRef = useRef(flushPersist)
  useEffect(() => {
    flushPersistRef.current = flushPersist
  }, [flushPersist])

  useEffect(() => {
    if (!isLoaded) return
    const payload = serializeGraphsState(Array.from(graphsById.values()))
    if (payload === lastPersistedRef.current) return
    pendingPayloadRef.current = payload
    const timer = setTimeout(() => flushPersistRef.current(), PERSIST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [graphsById, isLoaded])

  // Chiusura della pratica: l'ultima modifica non deve restare nel debounce.
  useEffect(() => () => {
    if (isLoadedRef.current) {
      pendingPayloadRef.current = serializeGraphsState(Array.from(graphsByIdRef.current.values()))
    }
    flushPersistRef.current()
  }, [])

  const listGraphs = useCallback(() => Array.from(graphsByIdRef.current.values()), [])

  const createGraph = useCallback(() => {
    const result = catalogOps.addGraph(graphsByIdRef.current, `graph-${Date.now()}`)
    commitCatalog(() => result.catalog)
    return result.graph
  }, [commitCatalog])

  const ensureGraph = useCallback((graphId: string, name: string) => {
    commitCatalog((previous) => catalogOps.ensureGraph(previous, graphId, name))
  }, [commitCatalog])

  const renameGraph = useCallback((graphId: string, name: string) => {
    commitCatalog((previous) => catalogOps.renameGraph(previous, graphId, name))
  }, [commitCatalog])

  const setGraphNote = useCallback((graphId: string, note: string) => {
    commitCatalog((previous) => catalogOps.setGraphNote(previous, graphId, note))
  }, [commitCatalog])

  const updateGraphContent = useCallback((graphId: string, content: GraphContent) => {
    commitCatalog((previous) => catalogOps.setGraphContent(previous, graphId, content))
  }, [commitCatalog])

  const removeGraph = useCallback((graphId: string) => {
    commitCatalog((previous) => catalogOps.removeGraph(previous, graphId))
    setOpenNoteByGraphId((previous) => {
      if (!previous.has(graphId)) return previous
      const next = new Map(previous)
      next.delete(graphId)
      return next
    })
  }, [commitCatalog])

  const toggleGraphNote = useCallback((graphId: string) => {
    setOpenNoteByGraphId((previous) => new Map(previous).set(graphId, !previous.get(graphId)))
  }, [])

  const closeGraphNote = useCallback((graphId: string) => {
    setOpenNoteByGraphId((previous) => new Map(previous).set(graphId, false))
  }, [])

  // Identità stabile: i pannelli grafo non devono ridisegnarsi a ogni render
  // del workspace, ma solo quando cambia davvero il catalogo.
  return useMemo(() => ({
    graphsById,
    isLoaded,
    loadError,
    openNoteByGraphId,
    listGraphs,
    createGraph,
    ensureGraph,
    renameGraph,
    setGraphNote,
    toggleGraphNote,
    closeGraphNote,
    removeGraph,
    updateGraphContent,
  }), [
    graphsById,
    isLoaded,
    loadError,
    openNoteByGraphId,
    listGraphs,
    createGraph,
    ensureGraph,
    renameGraph,
    setGraphNote,
    toggleGraphNote,
    closeGraphNote,
    removeGraph,
    updateGraphContent,
  ])
}
