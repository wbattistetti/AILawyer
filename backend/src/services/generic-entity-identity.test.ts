/**
 * Test di validazione properties e fingerprint delle evidenze generiche.
 */

import { describe, expect, it } from 'vitest'
import {
  createGenericOccurrenceFingerprint,
  deserializeStringProperties,
  parseStringProperties,
  serializeStringProperties,
} from './generic-entity-identity'

describe('genericEntityIdentity', () => {
  it('accetta solo mappe string→string senza prototipi pericolosi', () => {
    expect(parseStringProperties({ city: 'Roma', plate: 'AB123CD' })).toEqual({
      city: 'Roma',
      plate: 'AB123CD',
    })
    expect(() => parseStringProperties(['x'])).toThrow(/string→string/)
    expect(() => parseStringProperties({ city: 1 })).toThrow(/non stringa/)
    expect(() => parseStringProperties(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(/non ammessa/)
  })

  it('serializza e deserializza properties in modo round-trip', () => {
    const properties = parseStringProperties({ phone: '+390612345678' })
    const raw = serializeStringProperties(properties)
    expect(deserializeStringProperties(raw)).toEqual({ phone: '+390612345678' })
  })

  it('genera fingerprint deterministiche e sensibili a pagina/propertyKeys', () => {
    const input = {
      entityKey: 'vehicle:ab123cd',
      docId: 'doc-1',
      page: 1,
      snippet: 'Targa   AB123CD',
      box: { x0Pct: 0.1, y0Pct: 0.2, x1Pct: 0.3, y1Pct: 0.4 },
      propertyKeys: ['plate', 'brand'],
    }
    expect(createGenericOccurrenceFingerprint(input)).toBe(createGenericOccurrenceFingerprint({
      ...input,
      snippet: 'Targa AB123CD',
      propertyKeys: ['brand', 'plate'],
    }))
    expect(createGenericOccurrenceFingerprint(input)).not.toBe(createGenericOccurrenceFingerprint({
      ...input,
      page: 2,
    }))
    expect(createGenericOccurrenceFingerprint(input)).not.toBe(createGenericOccurrenceFingerprint({
      ...input,
      propertyKeys: ['plate'],
    }))
  })
})
