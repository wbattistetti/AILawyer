/**
 * Termini da evidenziare nelle fonti e nel viewer PDF per un'entità.
 */

import type { GenericEntity } from './types'

const VEHICLE_TERM_KEYS = ['make', 'model', 'color', 'plate', 'vin'] as const

/** Raccoglie le caratteristiche dell'entità come termini di highlight distinti. */
export function buildEntityHighlightTerms(entity: GenericEntity): string[] {
  const terms: string[] = []
  const push = (value?: string) => {
    const trimmed = value?.trim()
    if (!trimmed || trimmed.length < 2) return
    if (!terms.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
      terms.push(trimmed)
    }
  }

  if (entity.kind === 'vehicle') {
    for (const key of VEHICLE_TERM_KEYS) {
      const value = entity.properties[key]
      push(value)
      if (key === 'color' && value) {
        for (const part of value.split(/\s+/)) push(part)
      }
    }
    return terms
  }

  for (const value of Object.values(entity.properties)) {
    push(value)
  }
  return terms
}
