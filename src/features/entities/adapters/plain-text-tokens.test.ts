/**
 * Test tokenizzazione testo piano per adapter Word.
 */

import { describe, expect, it } from 'vitest'
import { pageText } from '../extract-text-utils'
import { tokenizePlainTextAsPage } from './plain-text-tokens'

describe('tokenizePlainTextAsPage', () => {
  it('restituisce array vuoto per testo vuoto', () => {
    expect(tokenizePlainTextAsPage('')).toEqual([])
    expect(tokenizePlainTextAsPage('   ')).toEqual([])
  })

  it('produce un token per parola con box percentuali ordinati', () => {
    const tokens = tokenizePlainTextAsPage('Mario Rossi nato a Roma')
    expect(tokens.map(token => token.text)).toEqual(['Mario', 'Rossi', 'nato', 'a', 'Roma'])
    expect(tokens[0].x0Pct).toBe(0)
    expect(tokens[tokens.length - 1].x1Pct).toBe(1)
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].x0Pct).toBeGreaterThanOrEqual(tokens[i - 1].x0Pct)
    }
  })

  it('preserva le righe reali senza spezzare il loro contenuto', () => {
    const tokens = tokenizePlainTextAsPage(
      'prima riga completa\nseconda riga con grigio\nterza riga completa'
    )

    expect(pageText(tokens)).toBe(
      'prima riga completa\nseconda riga con grigio\nterza riga completa'
    )
    expect(new Set(tokens.map(token => token.y0Pct))).toHaveLength(3)
  })
})
