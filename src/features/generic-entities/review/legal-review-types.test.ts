/**
 * Test applySpanToOriginal per ricostruzione confini Fase B.
 */

import { describe, expect, it } from 'vitest'
import { applySpanToOriginal } from './legal-review-types'

describe('applySpanToOriginal', () => {
  it('ricostruisce la sottostringa sul testo originale', () => {
    const original = 'AAA Stazione dei Carabinieri specie durante BBB'
    const snippetStart = 4
    const label = applySpanToOriginal(original, snippetStart, [0, 24])
    expect(label).toBe('Stazione dei Carabinieri')
  })

  it('fallisce su span fuori range', () => {
    expect(() => applySpanToOriginal('abc', 0, [0, 10])).toThrow(/exceeds/)
  })
})
