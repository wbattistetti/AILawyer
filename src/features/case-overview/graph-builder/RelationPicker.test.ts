/**
 * Verifies relation option filtering by node kinds and same-entity identity links.
 */
import { describe, expect, it } from 'vitest'
import { getRelationOptions } from './relation-catalog'

describe('getRelationOptions', () => {
  it('returns only stessa_entita when nodes share the same entity', () => {
    expect(getRelationOptions('female', 'female', { sameEntity: true })).toEqual(['stessa_entita'])
  })

  it('keeps the normal person-to-person catalog otherwise', () => {
    const options = getRelationOptions('female', 'female')
    expect(options).not.toContain('stessa_entita')
    expect(options).toContain('madre')
    expect(options).toContain('amicizia_affari')
    expect(options).toContain('collega')
  })

  it('offers address-oriented relations for person → place', () => {
    const options = getRelationOptions('female', 'place')
    expect(options).toContain('vive_presso')
    expect(options).toContain('residenza')
    expect(options).toContain('domicilio')
    expect(options).toContain('frequentatore')
    expect(options).not.toContain('dipendente')
    expect(options).not.toContain('proprietario')
    expect(options).not.toContain('gestore')
  })

  it('offers commercial relations for person → bar/restaurant', () => {
    const options = getRelationOptions('male', 'bar')
    expect(options).toContain('proprietario')
    expect(options).toContain('gestore')
    expect(options).toContain('dipendente')
    expect(options).toContain('frequentatore')
    expect(options).not.toContain('vive_presso')
    expect(options).not.toContain('residenza')
  })
})
