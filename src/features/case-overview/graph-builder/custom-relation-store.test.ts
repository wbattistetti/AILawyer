/**
 * Verifies custom relation persistence helpers.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { addCustomRelation, clearCustomRelations, listCustomRelations } from './custom-relation-store'

describe('custom-relation-store', () => {
  beforeEach(() => {
    clearCustomRelations()
  })

  it('stores a custom relation and lists it', () => {
    const saved = addCustomRelation('abita vicino a')
    expect(saved.middle).toBe('abita vicino a')
    expect(saved.caption).toBe('Abita Vicino A')
    expect(listCustomRelations().map(item => item.id)).toContain(saved.id)
  })

  it('rejects empty custom relations', () => {
    expect(() => addCustomRelation('   ')).toThrow(/vuota/i)
  })
})
