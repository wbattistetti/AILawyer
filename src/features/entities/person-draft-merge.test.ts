/**
 * Test del merge incrementale delle estrazioni anagrafiche.
 */

import { describe, expect, it } from 'vitest'
import type { OccurrenceRecord, PersonRecord } from './entity-index'
import { mergePersonExtractionSlices } from './person-draft-merge'

const person = (id: string, overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  id,
  praticaId: 'p1',
  full_name: id,
  titles: [],
  confidence: 0.8,
  occCount: 1,
  updatedAt: 1,
  ...overrides,
})

const occurrence = (
  id: string,
  personKey: string,
  docId: string
): OccurrenceRecord => ({
  id,
  praticaId: 'p1',
  personKey,
  docId,
  docTitle: `${docId}.pdf`,
  page: 1,
  snippet: personKey,
  box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
  createdAt: 1,
})

describe('mergePersonExtractionSlices', () => {
  it('conserva anagrafiche di documenti non rianalizzati e aggiunge le nuove', () => {
    const previous = {
      persons: [person('mario', { full_name: 'Mario Rossi' })],
      occurrences: [occurrence('occ-a', 'mario', 'doc-a')],
      snapshots: [],
    }
    const incoming = {
      persons: [person('luigi', { full_name: 'Luigi Bianchi' })],
      occurrences: [occurrence('occ-b', 'luigi', 'doc-b')],
      snapshots: [],
    }

    const merged = mergePersonExtractionSlices(previous, incoming, ['doc-b'])
    expect(merged.persons.map(item => item.id).sort()).toEqual(['luigi', 'mario'])
    expect(merged.occurrences.map(item => item.id).sort()).toEqual(['occ-a', 'occ-b'])
  })

  it('deduplica la stessa persona e somma le evidenze', () => {
    const previous = {
      persons: [person('mario', { full_name: 'Mario Rossi', phone: '333' })],
      occurrences: [occurrence('occ-a', 'mario', 'doc-a')],
      snapshots: [],
    }
    const incoming = {
      persons: [person('mario', {
        full_name: 'Mario Rossi',
        email: 'mario@example.com',
        confidence: 0.99,
        updatedAt: 10,
      })],
      occurrences: [occurrence('occ-b', 'mario', 'doc-b')],
      snapshots: [],
    }

    const merged = mergePersonExtractionSlices(previous, incoming, ['doc-b'])
    expect(merged.persons).toHaveLength(1)
    expect(merged.persons[0]).toMatchObject({
      id: 'mario',
      phone: '333',
      email: 'mario@example.com',
      occCount: 2,
      confidence: 0.99,
    })
  })

  it('rimuove solo le occorrenze del documento eliminato e ricalcola i contatori', () => {
    const previous = {
      persons: [
        person('shared', { occCount: 3 }),
        person('removed-only'),
      ],
      occurrences: [
        occurrence('shared-a-1', 'shared', 'doc-a'),
        occurrence('shared-a-2', 'shared', 'doc-a'),
        occurrence('shared-b', 'shared', 'doc-b'),
        occurrence('removed-only-a', 'removed-only', 'doc-a'),
      ],
      snapshots: [],
    }

    const merged = mergePersonExtractionSlices(
      previous,
      { persons: [], occurrences: [], snapshots: [] },
      ['doc-a']
    )

    expect(merged.occurrences.map(item => item.id)).toEqual(['shared-b'])
    expect(merged.persons).toHaveLength(1)
    expect(merged.persons[0]).toMatchObject({ id: 'shared', occCount: 1 })
  })
})
