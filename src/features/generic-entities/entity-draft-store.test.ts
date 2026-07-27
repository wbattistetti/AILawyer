/**
 * Test dello store in memoria delle entità tipizzate.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createEntityDocumentSignature,
  getEntityDraft,
  initializeEntityDraft,
  markEntityDraftSaved,
  mergeEntityDraftFromExtraction,
  replaceEntityDraft,
  requestEntityExtraction,
  consumeEntityExtractionRequest,
} from './entity-draft-store'
import type { GenericEntity } from './types'

const entity = (id: string): GenericEntity => ({
  id,
  praticaId: 'p1',
  kind: 'person',
  subtype: 'mention',
  label: 'Mario Rossi',
  properties: { fullName: 'Mario Rossi' },
  confidence: 0.8,
  occurrenceCount: 1,
  updatedAt: 1,
})

describe('entity-draft-store', () => {
  beforeEach(() => {
    // Ogni test usa un praticaId distinto per evitare leak tra casi.
  })

  it('non sovrascrive una bozza esistente in fase di init', () => {
    const praticaId = `init-${Math.random()}`
    replaceEntityDraft({
      praticaId,
      entities: [entity('e1')],
      occurrences: [],
      relations: [],
      documentSignature: 'a',
    })
    const again = initializeEntityDraft({
      praticaId,
      entities: [entity('e2')],
      occurrences: [],
      relations: [],
      documentSignature: 'b',
      hasExtracted: true,
    })
    expect(again.entities.map(item => item.id)).toEqual(['e1'])
  })

  it('richiede e consuma l\'estrazione in modo race-safe', () => {
    const praticaId = `req-${Math.random()}`
    requestEntityExtraction(praticaId)
    const draft = getEntityDraft(praticaId)
    expect(draft?.extractRequested).toBe(true)
    expect(draft?.extracting).toBe(true)
    expect(consumeEntityExtractionRequest(praticaId)).toBe(true)
    expect(getEntityDraft(praticaId)?.extractRequested).toBe(false)
  })

  it('marca dirty dopo replace e pulisce dopo save', () => {
    const praticaId = `dirty-${Math.random()}`
    replaceEntityDraft({
      praticaId,
      entities: [entity('e1')],
      occurrences: [],
      relations: [],
      documentSignature: createEntityDocumentSignature([{ id: 'd1', hash: 'h1' }]),
    })
    expect(getEntityDraft(praticaId)?.dirty).toBe(true)
    markEntityDraftSaved(praticaId, [entity('e1')])
    expect(getEntityDraft(praticaId)?.dirty).toBe(false)
  })

  it('in merge conserva le entità dei documenti non rianalizzati', () => {
    const praticaId = `merge-${Math.random()}`
    replaceEntityDraft({
      praticaId,
      entities: [entity('person:old')],
      occurrences: [{
        id: 'occ-old',
        entityKey: 'person:old',
        docId: 'doc-old',
        page: 1,
        title: 'old.pdf',
        snippet: 'old',
        box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
        confidence: 0.7,
      }],
      relations: [],
      documentSignature: 'sig-1',
    })

    const merged = mergeEntityDraftFromExtraction({
      praticaId,
      entities: [entity('person:new')],
      occurrences: [{
        id: 'occ-new',
        entityKey: 'person:new',
        docId: 'doc-new',
        page: 1,
        title: 'new.pdf',
        snippet: 'new',
        box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
        confidence: 0.9,
      }],
      relations: [],
      processedDocIds: ['doc-new'],
      documentSignature: 'sig-2',
    })

    expect(merged.entities.map(item => item.id).sort()).toEqual(['person:new', 'person:old'])
    expect(getEntityDraft(praticaId)?.entities.map(item => item.id).sort()).toEqual([
      'person:new',
      'person:old',
    ])
  })
})
