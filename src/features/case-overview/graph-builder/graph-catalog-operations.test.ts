/**
 * Test delle operazioni sul catalogo grafi: il contenuto deve sopravvivere alle
 * modifiche di metadati e le operazioni neutre non devono cambiare identità.
 */

import { describe, expect, it } from 'vitest'
import {
  addGraph,
  ensureGraph,
  mergeSavedGraphs,
  removeGraph,
  renameGraph,
  setGraphContent,
  setGraphNote,
  type GraphCatalogState,
} from './graph-catalog-operations'
import {
  createEmptySavedGraph,
  serializeGraphContent,
  type GraphContent,
  type SavedGraph,
} from './graphSerialization'
import type { BuilderNode } from './types'

function buildContent(nodeId: string, x = 12): GraphContent {
  const node: BuilderNode = {
    id: nodeId,
    type: 'builder',
    position: { x, y: 34 },
    data: { kind: 'person', label: 'Mario Rossi' },
  }
  return serializeGraphContent([node], [])
}

function catalogWith(...graphs: SavedGraph[]): GraphCatalogState {
  return new Map(graphs.map((graph) => [graph.id, graph]))
}

describe('addGraph', () => {
  it('assegna nomi generici progressivi', () => {
    const first = addGraph(new Map(), 'graph-1')
    const second = addGraph(first.catalog, 'graph-2')

    expect(first.graph.name).toBe('Grafo')
    expect(second.graph.name).toBe('Grafo 2')
    expect(second.catalog.size).toBe(2)
  })
})

describe('ensureGraph', () => {
  it('registra il grafo mancante', () => {
    const catalog = ensureGraph(new Map(), 'graph-1', 'Ripristinato')

    expect(catalog.get('graph-1')?.name).toBe('Ripristinato')
  })

  it('non tocca un grafo già presente', () => {
    const existing = catalogWith({ ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' })

    const catalog = ensureGraph(existing, 'graph-1', 'Altro nome')

    expect(catalog).toBe(existing)
  })
})

describe('mergeSavedGraphs', () => {
  it('preserva le voci locali assenti dallo stato salvato', () => {
    const local = catalogWith(createEmptySavedGraph('graph-da-layout', 'Ripristinato'))
    const saved = [createEmptySavedGraph('graph-salvato', 'Salvato')]

    const merged = mergeSavedGraphs(local, saved)

    expect(Array.from(merged.keys()).sort()).toEqual(['graph-da-layout', 'graph-salvato'])
  })

  it('lo stato salvato prevale sulle voci locali con lo stesso id', () => {
    const local = catalogWith(createEmptySavedGraph('graph-1', 'Segnaposto'))
    const saved = [{ ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' }]

    const merged = mergeSavedGraphs(local, saved)

    expect(merged.get('graph-1')?.name).toBe('Mappa')
    expect(merged.get('graph-1')?.note).toBe('appunto')
  })
})

describe('setGraphContent', () => {
  it('registra nodi ed edge del canvas', () => {
    const catalog = setGraphContent(
      catalogWith(createEmptySavedGraph('graph-1', 'Mappa')),
      'graph-1',
      buildContent('n1'),
    )

    expect(catalog.get('graph-1')?.nodes).toHaveLength(1)
    expect(catalog.get('graph-1')?.nodes[0].position).toEqual({ x: 12, y: 34 })
  })

  it('ignora un contenuto identico, per non innescare salvataggi a vuoto', () => {
    const withContent = setGraphContent(
      catalogWith(createEmptySavedGraph('graph-1', 'Mappa')),
      'graph-1',
      buildContent('n1'),
    )

    expect(setGraphContent(withContent, 'graph-1', buildContent('n1'))).toBe(withContent)
  })

  it('ignora i grafi eliminati, per non resuscitarli allo smontaggio della tab', () => {
    const empty: GraphCatalogState = new Map()

    expect(setGraphContent(empty, 'graph-eliminato', buildContent('n1'))).toBe(empty)
  })
})

describe('metadati e contenuto restano indipendenti', () => {
  it('rinominare e annotare non cancella i nodi', () => {
    let catalog = setGraphContent(
      catalogWith(createEmptySavedGraph('graph-1', 'Grafo')),
      'graph-1',
      buildContent('n1'),
    )

    catalog = renameGraph(catalog, 'graph-1', 'Mappa indagini')
    catalog = setGraphNote(catalog, 'graph-1', 'appunto')

    const graph = catalog.get('graph-1')
    expect(graph?.name).toBe('Mappa indagini')
    expect(graph?.note).toBe('appunto')
    expect(graph?.nodes).toHaveLength(1)
  })

  it('aggiornare il contenuto non tocca nome, nota e data di creazione', () => {
    const original = { ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' }

    const catalog = setGraphContent(catalogWith(original), 'graph-1', buildContent('n1', 99))

    const graph = catalog.get('graph-1')
    expect(graph?.name).toBe('Mappa')
    expect(graph?.note).toBe('appunto')
    expect(graph?.createdAt).toBe(original.createdAt)
  })

  it('rinomina e nota invariate non cambiano il catalogo', () => {
    const catalog = catalogWith({ ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' })

    expect(renameGraph(catalog, 'graph-1', 'Mappa')).toBe(catalog)
    expect(setGraphNote(catalog, 'graph-1', 'appunto')).toBe(catalog)
  })
})

describe('removeGraph', () => {
  it('elimina il grafo indicato', () => {
    const catalog = removeGraph(catalogWith(createEmptySavedGraph('graph-1', 'Mappa')), 'graph-1')

    expect(catalog.size).toBe(0)
  })

  it('è neutra su un id sconosciuto', () => {
    const catalog = catalogWith(createEmptySavedGraph('graph-1', 'Mappa'))

    expect(removeGraph(catalog, 'graph-inesistente')).toBe(catalog)
  })
})
