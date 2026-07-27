/**
 * Test termini di evidenziazione entità (marca/modello/colore/targa).
 */

import { describe, expect, it } from 'vitest'
import { buildEntityHighlightTerms } from './entity-highlight-terms'
import type { GenericEntity } from './types'

describe('buildEntityHighlightTerms', () => {
  it('espone tutte le caratteristiche del veicolo, incluso il colore composto', () => {
    const entity: GenericEntity = {
      id: 'v1',
      praticaId: 'p1',
      kind: 'vehicle',
      subtype: 'registered',
      label: 'Fiat Punto grigio chiaro targa CH340GW',
      properties: {
        make: 'Fiat',
        model: 'Punto',
        color: 'grigio chiaro',
        plate: 'CH340GW',
      },
      confidence: 0.9,
      occurrenceCount: 1,
      updatedAt: 1,
      reviewStatus: 'ok',
    }
    const terms = buildEntityHighlightTerms(entity)
    expect(terms).toEqual(
      expect.arrayContaining(['Fiat', 'Punto', 'grigio chiaro', 'grigio', 'chiaro', 'CH340GW'])
    )
  })
})
