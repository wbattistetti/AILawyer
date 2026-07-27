/**
 * Test deduplica prudente delle varianti OCR persona.
 */

import { describe, expect, it } from 'vitest'
import type { PersonRecord } from './entity-index'
import {
  findBestPersonMatch,
  identityMatchScore,
} from './person-identity-matcher'

const person = (overrides: Partial<PersonRecord> = {}): PersonRecord => ({
  id: 'p1',
  full_name: 'Di Santo Ugo Emilio',
  date_of_birth: '1989-11-05',
  place_of_birth: 'Napoli',
  titles: [],
  confidence: 0.8,
  occCount: 1,
  updatedAt: 1,
  ...overrides,
})

describe('person-identity-matcher', () => {
  it('unisce maiuscole e nomi abbreviati con stessa data di nascita', () => {
    expect(identityMatchScore(
      person(),
      'SANTO UGO',
      { date_of_birth: '1989-11-05', place_of_birth: 'Napoli' }
    )).toBeGreaterThan(0)
  })

  it('unisce un errore OCR limitato solo con data di nascita concorde', () => {
    const existing = person({ full_name: 'Tranchino Gennaro', date_of_birth: '1985-12-19' })
    expect(identityMatchScore(
      existing,
      'Trancilino Gennaro',
      { date_of_birth: '1985-12-19' }
    )).toBeGreaterThan(0)
    expect(identityMatchScore(
      existing,
      'Trancilino Gennaro',
      {}
    )).toBe(-1)
  })

  it('non fonde omonimi con date incompatibili', () => {
    expect(identityMatchScore(
      person(),
      'Di Santo Ugo Emilio',
      { date_of_birth: '1970-01-01' }
    )).toBe(-1)
  })

  it('seleziona il candidato compatibile migliore', () => {
    const match = findBestPersonMatch(
      [
        person({ id: 'wrong', full_name: 'Mario Rossi', date_of_birth: '1970-01-01' }),
        person({ id: 'right' }),
      ],
      'Santo Ugo',
      { date_of_birth: '1989-11-05', place_of_birth: 'Napoli' }
    )
    expect(match).toBe('right')
  })
})

