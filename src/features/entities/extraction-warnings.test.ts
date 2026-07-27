/**
 * Test report warning estrazione parziale.
 */

import { describe, expect, it } from 'vitest'
import { formatExtractionWarnings } from './extraction-warnings'

describe('formatExtractionWarnings', () => {
  it('restituisce null se non ci sono problemi', () => {
    expect(formatExtractionWarnings([])).toBeNull()
  })

  it('elenca titolo e dettaglio per ogni documento', () => {
    const message = formatExtractionWarnings([
      { docId: '1', title: 'x.docx', reason: 'unsupported', detail: 'Formato non supportato' },
      { docId: '2', title: 'y.pdf', reason: 'unreadable', detail: 'Invalid PDF structure.' },
    ])
    expect(message).toContain('x.docx')
    expect(message).toContain('y.pdf')
    expect(message).toContain('Invalid PDF structure.')
  })
})
