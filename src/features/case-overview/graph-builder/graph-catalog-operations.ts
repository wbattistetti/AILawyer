/**
 * Operazioni pure sul catalogo dei grafi di una pratica.
 *
 * Il catalogo è una mappa immutabile `id → SavedGraph`. Ogni operazione
 * restituisce la stessa istanza quando non cambia nulla, così React può usare
 * l'identità per evitare render inutili.
 */

import {
  createEmptySavedGraph,
  extractGraphContent,
  graphContentSignature,
  nextGraphName,
  withGraphContent,
  type GraphContent,
  type SavedGraph,
} from './graphSerialization'

export type GraphCatalogState = ReadonlyMap<string, SavedGraph>

function replace(catalog: GraphCatalogState, graph: SavedGraph): Map<string, SavedGraph> {
  return new Map(catalog).set(graph.id, graph)
}

function touch(graph: SavedGraph, changes: Partial<SavedGraph>): SavedGraph {
  return { ...graph, ...changes, updatedAt: new Date().toISOString() }
}

/**
 * Fonde lo stato salvato con le voci già presenti. Le voci locali assenti dallo
 * stato salvato vengono preservate: corrispondono a tab ripristinate dal layout
 * prima che la pratica finisse di caricare.
 */
export function mergeSavedGraphs(
  catalog: GraphCatalogState,
  saved: SavedGraph[],
): Map<string, SavedGraph> {
  const merged = new Map<string, SavedGraph>()
  saved.forEach((graph) => merged.set(graph.id, { ...graph, note: graph.note ?? '' }))
  catalog.forEach((graph, id) => {
    if (!merged.has(id)) merged.set(id, graph)
  })
  return merged
}

/** Aggiunge un grafo vuoto con nome generico progressivo. */
export function addGraph(
  catalog: GraphCatalogState,
  graphId: string,
): { catalog: Map<string, SavedGraph>; graph: SavedGraph } {
  const names = Array.from(catalog.values()).map((graph) => graph.name)
  const graph = createEmptySavedGraph(graphId, nextGraphName(names))
  return { catalog: replace(catalog, graph), graph }
}

/** Registra un grafo solo se assente, senza toccare quello esistente. */
export function ensureGraph(
  catalog: GraphCatalogState,
  graphId: string,
  name: string,
): GraphCatalogState {
  if (catalog.has(graphId)) return catalog
  return replace(catalog, createEmptySavedGraph(graphId, name))
}

export function renameGraph(
  catalog: GraphCatalogState,
  graphId: string,
  name: string,
): GraphCatalogState {
  const current = catalog.get(graphId)
  if (!current || current.name === name) return catalog
  return replace(catalog, touch(current, { name }))
}

export function setGraphNote(
  catalog: GraphCatalogState,
  graphId: string,
  note: string,
): GraphCatalogState {
  const current = catalog.get(graphId)
  if (!current || current.note === note) return catalog
  return replace(catalog, touch(current, { note }))
}

/** Sostituisce nodi/edge/viewport lasciando intatti nome, nota e creazione. */
export function setGraphContent(
  catalog: GraphCatalogState,
  graphId: string,
  content: GraphContent,
): GraphCatalogState {
  const current = catalog.get(graphId)
  if (!current) return catalog
  if (graphContentSignature(extractGraphContent(current)) === graphContentSignature(content)) {
    return catalog
  }
  return replace(catalog, withGraphContent(current, content))
}

export function removeGraph(catalog: GraphCatalogState, graphId: string): GraphCatalogState {
  if (!catalog.has(graphId)) return catalog
  const next = new Map(catalog)
  next.delete(graphId)
  return next
}
