/**
 * Verifies sex-aware person icon inference from titles and tax codes.
 */
import { describe, expect, it } from 'vitest'
import { inferPersonKind } from './person-icon-kind'

describe('inferPersonKind', () => {
  it('uses feminine honorific titles', () => {
    expect(inferPersonKind('Dott.ssa', undefined)).toBe('female')
  })

  it('uses masculine honorific titles', () => {
    expect(inferPersonKind('Dott.', undefined)).toBe('male')
  })

  it('keeps gender-neutral titles as person', () => {
    expect(inferPersonKind('Avv.', undefined)).toBe('person')
  })

  it('uses tax-code day encoding when present', () => {
    expect(inferPersonKind(undefined, 'RSSMRA85T12H501Z')).toBe('male')
    expect(inferPersonKind(undefined, 'RSSMRA85T52H501Z')).toBe('female')
  })

  it('falls back to neutral person when evidence is missing', () => {
    expect(inferPersonKind(undefined, undefined)).toBe('person')
  })
})
