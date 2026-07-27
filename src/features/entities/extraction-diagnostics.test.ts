/**
 * Test diagnostica per documento della pipeline anagrafica.
 */

import { describe, expect, it } from 'vitest'
import {
  createExtractionDiagnostic,
  formatZeroExtractionDiagnostics,
} from './extraction-diagnostics'

describe('extraction diagnostics', () => {
  it('distingue assenza testo da nessun candidato', () => {
    const noText = createExtractionDiagnostic({
      docId: '1',
      title: 'vuoto.pdf',
      source: 'database-ocr',
      pages: 1,
      tokenCount: 0,
      textCharacters: 0,
      candidateCount: 0,
    })
    const noCandidates = createExtractionDiagnostic({
      docId: '2',
      title: 'atto.pdf',
      source: 'native-pdf',
      pages: 2,
      tokenCount: 120,
      textCharacters: 650,
      candidateCount: 0,
    })

    expect(noText.status).toBe('no-text')
    expect(noCandidates.status).toBe('no-candidates')
  })

  it('formatta il report solo quando il batch non produce candidati', () => {
    const diagnostic = createExtractionDiagnostic({
      docId: '2',
      title: 'atto.pdf',
      source: 'local-ocr',
      pages: 2,
      tokenCount: 120,
      textCharacters: 650,
      candidateCount: 0,
    })
    expect(formatZeroExtractionDiagnostics([diagnostic])).toContain('atto.pdf')

    const extracted = createExtractionDiagnostic({
      ...diagnostic,
      candidateCount: 1,
    })
    expect(formatZeroExtractionDiagnostics([extracted])).toBeNull()
  })
})
