/**
 * Verifies catalog merge, alphabetical sorting and sex-aware person icons.
 */
import { describe, expect, it } from 'vitest'
import type { PersonRecord } from '../../../types/person'
import type { GenericEntity } from '../../generic-entities/types'
import { buildGraphEntityCatalog } from './graph-entity-catalog'

function person(partial: Partial<PersonRecord> & Pick<PersonRecord, 'id' | 'full_name'>): PersonRecord {
  return {
    confidence: 1,
    occCount: 1,
    updatedAt: 1,
    ...partial,
  }
}

function entity(
  partial: Partial<GenericEntity> & Pick<GenericEntity, 'id' | 'kind' | 'label'>
): GenericEntity {
  return {
    praticaId: 'p1',
    subtype: 'mention',
    properties: {},
    confidence: 1,
    occurrenceCount: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('buildGraphEntityCatalog', () => {
  it('sorts alphabetically by display name', () => {
    const catalog = buildGraphEntityCatalog(
      [
        person({ id: '2', full_name: 'Zoe Verdi' }),
        person({ id: '1', full_name: 'Marco Rossi' }),
      ],
      []
    )
    expect(catalog.map(item => item.label)).toEqual(['Marco Rossi', 'Zoe Verdi'])
  })

  it('infers female icon from honorific title', () => {
    const catalog = buildGraphEntityCatalog(
      [],
      [
        entity({
          id: 'e1',
          kind: 'person',
          label: 'Dott.ssa Vanessa R. Rivero',
          properties: {
            fullName: 'Vanessa R. Rivero',
            title: 'Dott.ssa',
            role: 'Consulente',
          },
        }),
      ]
    )
    expect(catalog[0]).toMatchObject({
      kind: 'female',
      label: 'Vanessa R. Rivero',
      subtitle: 'Consulente',
    })
  })

  it('deduplicates generic person mentions already covered by anagraphic records', () => {
    const catalog = buildGraphEntityCatalog(
      [person({ id: 'p1', full_name: 'Marco Rossi', profession: 'Imprenditore' })],
      [
        entity({
          id: 'e1',
          kind: 'person',
          label: 'Marco Rossi',
          properties: { fullName: 'Marco Rossi', role: 'Socio' },
        }),
        entity({
          id: 'e2',
          kind: 'organization',
          label: 'Edelweiss Srl',
          subtype: 'company',
          properties: { legalForm: 'Srl' },
        }),
      ]
    )
    expect(catalog).toHaveLength(2)
    expect(catalog.find(item => item.label === 'Marco Rossi')?.subtitle).toContain('Imprenditore')
    expect(catalog.find(item => item.label === 'Edelweiss Srl')?.kind).toBe('company')
  })
})
