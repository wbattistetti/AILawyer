/**
 * Test per serializzazione catalogo grafi e naming.
 */

import { describe, expect, it } from 'vitest'
import {
  createEmptySavedGraph,
  deserializeGraph,
  extractGraphContent,
  graphContentSignature,
  nextGraphName,
  parseGraphsState,
  serializeGraphContent,
  serializeGraphsState,
  withGraphContent,
  type GraphContent,
} from './graphSerialization'
import type { BuilderEdge, BuilderNode } from './types'

const noop = () => {}

function buildNode(id: string, x: number): BuilderNode {
  return {
    id,
    type: 'builder',
    position: { x, y: 10 },
    data: { kind: 'person', label: `Nodo ${id}`, style: { ringColor: '#f00' } },
  }
}

function buildEdge(id: string, source: string, target: string): BuilderEdge {
  return {
    id,
    source,
    target,
    type: 'tooltip',
    markerEnd: { type: 'arrowclosed', color: '#333' } as BuilderEdge['markerEnd'],
    data: { relation: 'socio', dashed: true },
  }
}

describe('nextGraphName', () => {
  it('usa Grafo se libero', () => {
    expect(nextGraphName([])).toBe('Grafo')
    expect(nextGraphName(['Altro'])).toBe('Grafo')
  })

  it('incrementa se Grafo è preso', () => {
    expect(nextGraphName(['Grafo'])).toBe('Grafo 2')
    expect(nextGraphName(['Grafo', 'Grafo 2'])).toBe('Grafo 3')
  })
})

describe('serializeGraphContent', () => {
  it('conserva posizione, stile e dati degli edge', () => {
    const content = serializeGraphContent([buildNode('n1', 5)], [buildEdge('e1', 'n1', 'n1')], { x: 1, y: 2, zoom: 3 })

    expect(content.viewport).toEqual({ x: 1, y: 2, zoom: 3 })
    expect(content.nodes[0].position).toEqual({ x: 5, y: 10 })
    expect(content.nodes[0].data.style).toEqual({ ringColor: '#f00' })
    expect(content.edges[0].data.relation).toBe('socio')
    expect(content.edges[0].markerEnd).toEqual({ type: 'arrowclosed', color: '#333' })
  })

  it('scarta le proprietà runtime iniettate nel canvas', () => {
    const withRuntimeData: BuilderNode = {
      ...buildNode('n1', 5),
      data: { kind: 'person', label: 'Nodo', onDelete: noop, nodeId: 'n1', startEditing: true },
    }

    const [node] = serializeGraphContent([withRuntimeData], []).nodes

    expect(node.data).not.toHaveProperty('onDelete')
    expect(node.data).not.toHaveProperty('startEditing')
  })
})

describe('graphContentSignature', () => {
  it('è stabile per il round-trip canvas → contenuto', () => {
    const original = serializeGraphContent(
      [buildNode('n1', 5), buildNode('n2', 80)],
      [buildEdge('e1', 'n1', 'n2')],
      { x: 0, y: 0, zoom: 1 },
    )

    const hydrated = deserializeGraph(original, noop)
    const republished = serializeGraphContent(hydrated.nodes, hydrated.edges, hydrated.viewport)

    expect(graphContentSignature(republished)).toBe(graphContentSignature(original))
  })

  it('cambia quando un nodo si sposta', () => {
    const before = serializeGraphContent([buildNode('n1', 5)], [])
    const after = serializeGraphContent([buildNode('n1', 6)], [])

    expect(graphContentSignature(after)).not.toBe(graphContentSignature(before))
  })

  it('allinea la forma del catalogo a quella del canvas', () => {
    const content = serializeGraphContent([buildNode('n1', 5)], [buildEdge('e1', 'n1', 'n1')], { x: 1, y: 2, zoom: 3 })
    const stored = withGraphContent(createEmptySavedGraph('graph-1', 'Mappa'), content)

    expect(graphContentSignature(extractGraphContent(stored))).toBe(graphContentSignature(content))
  })
})

describe('withGraphContent', () => {
  it('sostituisce il contenuto preservando i metadati', () => {
    const stored = { ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' }
    const content: GraphContent = serializeGraphContent([buildNode('n1', 5)], [])

    const updated = withGraphContent(stored, content)

    expect(updated.id).toBe('graph-1')
    expect(updated.name).toBe('Mappa')
    expect(updated.note).toBe('appunto')
    expect(updated.createdAt).toBe(stored.createdAt)
    expect(updated.nodes).toHaveLength(1)
  })
})

describe('parseGraphsState / serializeGraphsState', () => {
  it('round-trip preserva name e note', () => {
    const graphs = [
      { ...createEmptySavedGraph('graph-1', 'Mappa'), note: 'appunto' },
    ]
    const raw = serializeGraphsState(graphs)
    const parsed = parseGraphsState(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('graph-1')
    expect(parsed[0].name).toBe('Mappa')
    expect(parsed[0].note).toBe('appunto')
  })

  it('round-trip preserva la firma del contenuto', () => {
    const content = serializeGraphContent([buildNode('n1', 5)], [buildEdge('e1', 'n1', 'n1')], { x: 1, y: 2, zoom: 3 })
    const stored = withGraphContent(createEmptySavedGraph('graph-1', 'Mappa'), content)

    const [reloaded] = parseGraphsState(serializeGraphsState([stored]))

    expect(graphContentSignature(extractGraphContent(reloaded))).toBe(graphContentSignature(content))
  })

  it('accetta array vuoto e null', () => {
    expect(parseGraphsState(null)).toEqual([])
    expect(parseGraphsState('')).toEqual([])
    expect(parseGraphsState('[]')).toEqual([])
  })

  it('fallisce su JSON non array', () => {
    expect(() => parseGraphsState('{"id":"x"}')).toThrow(/array/)
  })

  it('fallisce su voce senza id', () => {
    expect(() => parseGraphsState('[{"name":"Grafo"}]')).toThrow(/id/)
  })
})
