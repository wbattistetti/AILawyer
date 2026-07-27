/**
 * Verifica la ricostruzione delle righe visive senza alterare gli offset.
 */

import { describe, expect, it } from 'vitest'
import { bboxForSubstring, pageText } from './extract-text-utils'
import type { Token } from './extract-types'

const token = (
  text: string,
  x0Pct: number,
  x1Pct: number,
  y0Pct: number,
  y1Pct: number
): Token => ({ text, x0Pct, x1Pct, y0Pct, y1Pct })

describe('extract-text-utils', () => {
  it('unisce token sulla stessa riga e inserisce newline tra righe visive', () => {
    const tokens = [
      token('riga', 0.1, 0.2, 0.10, 0.12),
      token('sopra', 0.22, 0.35, 0.10, 0.12),
      token('Fiat', 0.1, 0.2, 0.20, 0.22),
      token('grigio', 0.22, 0.35, 0.20, 0.22),
      token('riga', 0.1, 0.2, 0.30, 0.32),
      token('sotto', 0.22, 0.35, 0.30, 0.32),
    ]

    expect(pageText(tokens)).toBe('riga sopra\nFiat grigio\nriga sotto')
  })

  it('mantiene gli offset compatibili con bboxForSubstring', () => {
    const tokens = [
      token('sopra', 0.1, 0.2, 0.10, 0.12),
      token('Fiat', 0.1, 0.2, 0.20, 0.22),
      token('grigio', 0.22, 0.35, 0.20, 0.22),
      token('sotto', 0.1, 0.2, 0.30, 0.32),
    ]
    const text = pageText(tokens)
    const start = text.indexOf('grigio')

    expect(bboxForSubstring(tokens, start, 'grigio'.length)).toEqual({
      x0Pct: 0.22,
      x1Pct: 0.35,
      y0Pct: 0.20,
      y1Pct: 0.22,
    })
  })
})
