/**
 * Test dello store in memoria delle schede anagrafiche.
 */

import { describe, expect, it } from 'vitest'
import type { PersonRecord } from './entity-index'
import {
  consumePersonExtractionRequest,
  createDocumentSignature,
  getPersonDraft,
  initializePersonDraft,
  mergePersonDraftFromExtraction,
  removePersonFromDraft,
  replacePersonDraft,
  requestPersonExtraction,
} from './person-draft-store'

function person(id: string): PersonRecord {
  return {
    id,
    praticaId: 'practice-test',
    full_name: `Persona ${id}`,
    titles: [],
    confidence: 1,
    occCount: 0,
    updatedAt: 1,
  }
}

describe('person-draft-store', () => {
  it('produce la stessa firma indipendentemente dall’ordine', () => {
    const first = createDocumentSignature([
      { id: 'b', hash: '2' },
      { id: 'a', hash: '1' },
    ])
    const second = createDocumentSignature([
      { id: 'a', hash: '1' },
      { id: 'b', hash: '2' },
    ])
    expect(first).toBe(second)
  })

  it('non sovrascrive una bozza già modificata durante la reinizializzazione', () => {
    const praticaId = 'practice-initialize'
    initializePersonDraft({
      praticaId,
      persons: [person('saved')],
      occurrences: [],
      documentSignature: 'initial',
      hasExtracted: true,
    })
    replacePersonDraft({
      praticaId,
      persons: [person('draft')],
      occurrences: [],
      snapshots: [],
      documentSignature: 'updated',
    })
    initializePersonDraft({
      praticaId,
      persons: [person('stale')],
      occurrences: [],
      documentSignature: 'initial',
      hasExtracted: true,
    })

    expect(getPersonDraft(praticaId)?.persons.map(item => item.id)).toEqual(['draft'])
  })

  it('distingue schede esistenti ma non aggiornate sui documenti correnti', () => {
    const praticaId = 'practice-stale'
    initializePersonDraft({
      praticaId,
      persons: [person('saved')],
      occurrences: [],
      documentSignature: 'documents-with-new-file',
      hasExtracted: true,
      isCurrent: false,
    })

    const state = getPersonDraft(praticaId)
    expect(state?.hasExtracted).toBe(true)
    expect(state?.extractedDocumentSignature).toBeNull()
  })

  it('rimuove la scheda e le relative occorrenze', () => {
    const praticaId = 'practice-remove'
    initializePersonDraft({
      praticaId,
      persons: [person('one'), person('two')],
      occurrences: [],
      documentSignature: 'documents',
      hasExtracted: true,
    })
    removePersonFromDraft(praticaId, 'one')

    const state = getPersonDraft(praticaId)
    expect(state?.persons.map(item => item.id)).toEqual(['two'])
    expect(state?.dirty).toBe(true)
  })

  it('accoda una richiesta di estrazione anche senza bozza preesistente', () => {
    const praticaId = 'practice-request'
    requestPersonExtraction(praticaId)
    const pending = getPersonDraft(praticaId)
    expect(pending?.extractRequested).toBe(true)
    expect(pending?.extracting).toBe(true)
    expect(consumePersonExtractionRequest(praticaId)).toBe(true)
    expect(getPersonDraft(praticaId)?.extractRequested).toBe(false)
  })

  it('mergea l’estrazione senza cancellare i documenti non rianalizzati', () => {
    const praticaId = 'practice-merge-extraction'
    initializePersonDraft({
      praticaId,
      persons: [
        person('alice'),
        person('bob'),
      ],
      occurrences: [
        {
          id: 'o-alice',
          personKey: 'alice',
          docId: 'doc-a',
          docTitle: 'A',
          page: 1,
          snippet: 'a',
          box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
          createdAt: 1,
        },
        {
          id: 'o-bob',
          personKey: 'bob',
          docId: 'doc-b',
          docTitle: 'B',
          page: 1,
          snippet: 'b',
          box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
          createdAt: 1,
        },
      ],
      documentSignature: 'old',
      hasExtracted: true,
    })

    const merged = mergePersonDraftFromExtraction({
      praticaId,
      persons: [person('carla')],
      occurrences: [
        {
          id: 'o-carla',
          personKey: 'carla',
          docId: 'doc-c',
          docTitle: 'C',
          page: 1,
          snippet: 'c',
          box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
          createdAt: 2,
        },
      ],
      snapshots: [],
      processedDocIds: ['doc-c'],
      documentSignature: 'new',
    })

    expect(merged.persons.map(item => item.id).sort()).toEqual(['alice', 'bob', 'carla'])
    expect(merged.occurrences.map(item => item.id).sort()).toEqual(['o-alice', 'o-bob', 'o-carla'])
    expect(merged.dirty).toBe(true)
    expect(merged.extracting).toBe(false)
  })
})
