/**
 * Test degli schemi di validazione del payload entità generiche.
 */

import { describe, expect, it } from 'vitest'
import { saveGenericEntitiesSchema } from './generic-entity-validation'

describe('saveGenericEntitiesSchema', () => {
  const baseEntity = {
    id: 'place:roma',
    kind: 'place' as const,
    subtype: 'city',
    label: 'Roma',
    properties: { city: 'Roma' },
    confidence: 0.9,
    occurrenceCount: 1,
  }

  const baseOccurrence = {
    id: 'occ-1',
    entityKey: 'place:roma',
    docId: 'doc-1',
    page: 1,
    title: 'Verbale',
    snippet: 'Comune di Roma',
    box: { x0Pct: 0.1, x1Pct: 0.2, y0Pct: 0.3, y1Pct: 0.4 },
    confidence: 0.8,
  }

  it('accetta uno snapshot minimale valido', () => {
    const parsed = saveGenericEntitiesSchema.parse({
      entities: [baseEntity],
      occurrences: [baseOccurrence],
      relations: [],
    })
    expect(parsed.entities).toHaveLength(1)
    expect(parsed.occurrences[0]?.title).toBe('Verbale')
  })

  it('rifiuta box fuori range e confidence non finite', () => {
    expect(() => saveGenericEntitiesSchema.parse({
      entities: [{ ...baseEntity, confidence: Number.NaN }],
      occurrences: [],
      relations: [],
    })).toThrow()

    expect(() => saveGenericEntitiesSchema.parse({
      entities: [baseEntity],
      occurrences: [{
        ...baseOccurrence,
        box: { x0Pct: -0.1, x1Pct: 0.2, y0Pct: 0.3, y1Pct: 0.4 },
      }],
      relations: [],
    })).toThrow()
  })

  it('rifiuta entityKey e evidenceOccurrenceIds orfani', () => {
    expect(() => saveGenericEntitiesSchema.parse({
      entities: [baseEntity],
      occurrences: [{ ...baseOccurrence, entityKey: 'missing' }],
      relations: [],
    })).toThrow()

    expect(() => saveGenericEntitiesSchema.parse({
      entities: [
        baseEntity,
        {
          ...baseEntity,
          id: 'org:comune',
          kind: 'organization' as const,
          subtype: 'public-body',
          label: 'Comune',
        },
      ],
      occurrences: [baseOccurrence],
      relations: [{
        id: 'rel-1',
        fromEntityId: 'org:comune',
        toEntityId: 'place:roma',
        kind: 'located-at',
        confidence: 0.5,
        evidenceOccurrenceIds: ['occ-missing'],
      }],
    })).toThrow()
  })

  it('rifiuta properties con prototipo o valori non stringa', () => {
    expect(() => saveGenericEntitiesSchema.parse({
      entities: [{ ...baseEntity, properties: { city: 1 } }],
      occurrences: [],
      relations: [],
    })).toThrow()

    expect(() => saveGenericEntitiesSchema.parse({
      entities: [{
        ...baseEntity,
        properties: JSON.parse('{"__proto__":{"x":1}}'),
      }],
      occurrences: [],
      relations: [],
    })).toThrow()
  })
})
