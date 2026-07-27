/**
 * Test validazione box per ritagli fonti.
 */

import { describe, expect, it } from 'vitest'
import { isUsableOccurrenceBox } from './occurrence-box'

describe('isUsableOccurrenceBox', () => {
  it('rifiuta box degeneri', () => {
    expect(isUsableOccurrenceBox({ x0Pct: 0, x1Pct: 0, y0Pct: 0, y1Pct: 0 })).toBe(false)
    expect(isUsableOccurrenceBox(undefined)).toBe(false)
  })

  it('rifiuta la banda sintetica del testo piano', () => {
    expect(isUsableOccurrenceBox({
      x0Pct: 0.2,
      x1Pct: 0.4,
      y0Pct: 0.05,
      y1Pct: 0.12,
    })).toBe(false)
  })

  it('accetta box OCR reali', () => {
    expect(isUsableOccurrenceBox({
      x0Pct: 0.12,
      x1Pct: 0.48,
      y0Pct: 0.41,
      y1Pct: 0.45,
    })).toBe(true)
  })
})
