/**
 * Test etichette e sottotitoli schede entità.
 */

import { describe, expect, it } from 'vitest'
import {
  entityCardSubtitle,
  entityDisplayLabel,
  entitySubtypeLabel,
  listEntityProperties,
} from './display'
import type { GenericEntity } from './types'

function person(partial: Partial<GenericEntity> & Pick<GenericEntity, 'label' | 'properties'>): GenericEntity {
  return {
    id: 'person:1',
    praticaId: 'p1',
    kind: 'person',
    subtype: 'legal-role',
    confidence: 0.9,
    occurrenceCount: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('entity display', () => {
  it('mostra titolo+nome come etichetta e ruolo/sede sotto', () => {
    const entity = person({
      label: 'Dott.ssa Ilaria Calò',
      properties: {
        title: 'Dott.ssa',
        fullName: 'Ilaria Calò',
        role: 'Sostituto Procuratore',
        office: 'Foro di Roma',
      },
    })
    expect(entityDisplayLabel(entity)).toBe('Dott.ssa Ilaria Calò')
    expect(entityCardSubtitle(entity)).toBe('Sostituto Procuratore · Foro di Roma')
    const props = listEntityProperties(entity)
    expect(props.map(row => row.key)).toEqual(['role', 'office'])
    expect(props.every(row => row.key !== 'title' && row.key !== 'fullName')).toBe(true)
  })

  it('localizza i sottotipi utili e nasconde quelli ridondanti', () => {
    expect(entitySubtypeLabel(person({
      label: 'Mario Rossi',
      properties: {},
    }))).toBe('Ruolo giuridico')
    expect(entitySubtypeLabel({
      ...person({ label: 'AB123CD', properties: { plate: 'AB123CD' } }),
      kind: 'vehicle',
      subtype: 'registered',
    })).toBeUndefined()
    expect(entitySubtypeLabel({
      ...person({ label: 'Bar Centrale', properties: { category: 'bar' } }),
      kind: 'place',
      subtype: 'venue',
    })).toBe('Bar')
  })

  it('non ripete l’indirizzo sotto il titolo della scheda luogo', () => {
    const address: GenericEntity = {
      ...person({
        label: 'Via Roma 12',
        properties: { address: 'Via Roma 12', city: 'Roma' },
      }),
      kind: 'place',
      subtype: 'address',
    }
    expect(entityCardSubtitle(address)).toBeUndefined()
  })
})
