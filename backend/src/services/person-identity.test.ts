/**
 * Test della validazione identità e deduplicazione delle evidenze.
 */

import { describe, expect, it } from 'vitest'
import { createOccurrenceFingerprint, isValidItalianTaxCode } from './person-identity'

describe('personIdentity', () => {
  it('valida il checksum del codice fiscale', () => {
    expect(isValidItalianTaxCode('RSSMRA85T10A562G')).toBe(true)
    expect(isValidItalianTaxCode('RSSMRA85T10A562S')).toBe(false)
  })

  it('genera fingerprint deterministiche e sensibili alla pagina', () => {
    const input = {
      personKey: 'person-1',
      docId: 'doc-1',
      page: 1,
      snippet: 'Mario   Rossi',
      box: { x0Pct: 0.1, y0Pct: 0.2, x1Pct: 0.3, y1Pct: 0.4 },
    }
    expect(createOccurrenceFingerprint(input)).toBe(createOccurrenceFingerprint({
      ...input,
      snippet: 'Mario Rossi',
    }))
    expect(createOccurrenceFingerprint(input)).not.toBe(createOccurrenceFingerprint({
      ...input,
      page: 2,
    }))
  })
})
