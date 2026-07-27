/**
 * Test per serializzazione catalogo grafi e naming.
 */

import { describe, expect, it } from 'vitest'
import {
  createEmptySavedGraph,
  nextGraphName,
  parseGraphsState,
  serializeGraphsState,
} from './graphSerialization'

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
