/**
 * Test della normalizzazione coordinate match OCR/PDF.
 */

import { describe, expect, it } from 'vitest'
import { matchBoxToUnit } from './matchCoords'

describe('matchBoxToUnit', () => {
  it('converte percentuali 0-100 in unità 0-1', () => {
    expect(matchBoxToUnit({
      x0Pct: 20,
      y0Pct: 40,
      x1Pct: 30,
      y1Pct: 50
    })).toEqual({
      x0Pct: 0.2,
      y0Pct: 0.4,
      x1Pct: 0.3,
      y1Pct: 0.5
    })
  })

  it('lascia invariati i valori già in 0-1', () => {
    expect(matchBoxToUnit({
      x0Pct: 0.2,
      y0Pct: 0.4,
      x1Pct: 0.3,
      y1Pct: 0.5
    })).toEqual({
      x0Pct: 0.2,
      y0Pct: 0.4,
      x1Pct: 0.3,
      y1Pct: 0.5
    })
  })

  it('rifiuta coordinate fuori range', () => {
    expect(() => matchBoxToUnit({
      x0Pct: -1,
      y0Pct: 0,
      x1Pct: 10,
      y1Pct: 20
    })).toThrow('Coordinate match non valide: atteso range 0-100')
  })
})
