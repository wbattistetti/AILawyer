/**
 * Test dell'evidenziazione dei riscontri testuali nativi.
 */

import { describe, expect, it } from 'vitest'
import { splitHighlightedSnippet } from './highlight-snippet'

describe('splitHighlightedSnippet', () => {
  it('evidenzia marca, modello e targa senza alterare il testo', () => {
    const snippet = 'Autovettura Suzuki Swift di colore grigio targata CW692HR.'
    const parts = splitHighlightedSnippet(snippet, ['Suzuki Swift', 'CW692HR'])
    expect(parts.map(part => part.text).join('')).toBe(snippet)
    expect(parts.filter(part => part.highlighted).map(part => part.text)).toEqual([
      'Suzuki Swift',
      'CW692HR',
    ])
  })

  it('gestisce termini duplicati e caratteri regex', () => {
    const parts = splitHighlightedSnippet('Dott. Mario Rossi', ['Dott.', 'dott.'])
    expect(parts.filter(part => part.highlighted)).toHaveLength(1)
    expect(parts.map(part => part.text).join('')).toBe('Dott. Mario Rossi')
  })
})
