/**
 * Test del merge incrementale delle estrazioni entità tipizzate.
 */

import { describe, expect, it } from 'vitest'
import { mergeEntityExtractionSlices } from './entity-draft-merge'
import type { GenericEntity, GenericOccurrence, GenericRelation } from './types'

const entity = (
  id: string,
  overrides: Partial<GenericEntity> = {}
): GenericEntity => ({
  id,
  praticaId: 'p1',
  kind: 'person',
  subtype: 'mention',
  label: id,
  properties: { fullName: id },
  confidence: 0.8,
  occurrenceCount: 1,
  updatedAt: 1,
  ...overrides,
})

const occurrence = (
  id: string,
  entityKey: string,
  docId: string
): GenericOccurrence => ({
  id,
  entityKey,
  docId,
  page: 1,
  title: `${docId}.pdf`,
  snippet: entityKey,
  box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
  confidence: 0.8,
})

describe('mergeEntityExtractionSlices', () => {
  it('aggiunge entità nuove senza cancellare quelle di documenti non rianalizzati', () => {
    const previous = {
      entities: [entity('person:mario')],
      occurrences: [occurrence('occ-a', 'person:mario', 'doc-a')],
      relations: [] as GenericRelation[],
    }
    const incoming = {
      entities: [entity('person:luigi', { label: 'Luigi Bianchi' })],
      occurrences: [occurrence('occ-b', 'person:luigi', 'doc-b')],
      relations: [] as GenericRelation[],
    }

    const merged = mergeEntityExtractionSlices(previous, incoming, ['doc-b'])
    expect(merged.entities.map(item => item.id).sort()).toEqual(['person:luigi', 'person:mario'])
    expect(merged.occurrences.map(item => item.id).sort()).toEqual(['occ-a', 'occ-b'])
    expect(merged.entities.find(item => item.id === 'person:mario')?.occurrenceCount).toBe(1)
    expect(merged.entities.find(item => item.id === 'person:luigi')?.occurrenceCount).toBe(1)
  })

  it('deduplica la stessa entità e somma le occorrenze', () => {
    const previous = {
      entities: [entity('person:mario', { properties: { fullName: 'Mario Rossi' } })],
      occurrences: [occurrence('occ-a', 'person:mario', 'doc-a')],
      relations: [] as GenericRelation[],
    }
    const incoming = {
      entities: [entity('person:mario', {
        label: 'Sig. Mario Rossi',
        properties: { fullName: 'Mario Rossi', role: 'Testimone' },
        confidence: 0.95,
        updatedAt: 9,
      })],
      occurrences: [occurrence('occ-b', 'person:mario', 'doc-b')],
      relations: [] as GenericRelation[],
    }

    const merged = mergeEntityExtractionSlices(previous, incoming, ['doc-b'])
    expect(merged.entities).toHaveLength(1)
    expect(merged.entities[0]).toMatchObject({
      id: 'person:mario',
      label: 'Sig. Mario Rossi',
      properties: { fullName: 'Mario Rossi', role: 'Testimone' },
      occurrenceCount: 2,
      confidence: 0.95,
    })
  })

  it('sostituisce le occorrenze dei documenti rianalizzati', () => {
    const previous = {
      entities: [entity('person:mario')],
      occurrences: [
        occurrence('occ-old', 'person:mario', 'doc-a'),
        occurrence('occ-keep', 'person:mario', 'doc-b'),
      ],
      relations: [] as GenericRelation[],
    }
    const incoming = {
      entities: [entity('person:mario')],
      occurrences: [occurrence('occ-new', 'person:mario', 'doc-a')],
      relations: [] as GenericRelation[],
    }

    const merged = mergeEntityExtractionSlices(previous, incoming, ['doc-a'])
    expect(merged.occurrences.map(item => item.id).sort()).toEqual(['occ-keep', 'occ-new'])
    expect(merged.entities[0]?.occurrenceCount).toBe(2)
  })

  it('rimuove le entità senza altre fonti e decrementa i contatori condivisi', () => {
    const previous = {
      entities: [
        entity('person:shared', { occurrenceCount: 3 }),
        entity('place:removed-only'),
      ],
      occurrences: [
        occurrence('shared-a-1', 'person:shared', 'doc-a'),
        occurrence('shared-a-2', 'person:shared', 'doc-a'),
        occurrence('shared-b', 'person:shared', 'doc-b'),
        occurrence('removed-only-a', 'place:removed-only', 'doc-a'),
      ],
      relations: [] as GenericRelation[],
    }

    const merged = mergeEntityExtractionSlices(
      previous,
      { entities: [], occurrences: [], relations: [] },
      ['doc-a']
    )

    expect(merged.occurrences.map(item => item.id)).toEqual(['shared-b'])
    expect(merged.entities).toHaveLength(1)
    expect(merged.entities[0]).toMatchObject({
      id: 'person:shared',
      occurrenceCount: 1,
    })
  })
})
