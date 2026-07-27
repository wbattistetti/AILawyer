/**
 * Test classificazione documenti per l’estrazione batch.
 */

import { describe, expect, it } from 'vitest'
import { resolveExtractionDocumentKind, unsupportedDocumentDetail } from './document-kind'

describe('resolveExtractionDocumentKind', () => {
  it('riconosce i PDF', () => {
    expect(resolveExtractionDocumentKind({ filename: 'atto.pdf' })).toBe('pdf')
    expect(resolveExtractionDocumentKind({ filename: 'x', mime: 'application/pdf' })).toBe('pdf')
  })

  it('riconosce i DOCX come word', () => {
    expect(resolveExtractionDocumentKind({ filename: 'ANALISI ATTI DEFINITIVO.docx' })).toBe('word')
  })

  it('marca i .doc legacy come unsupported', () => {
    expect(resolveExtractionDocumentKind({ filename: 'vecchio.doc' })).toBe('unsupported')
    expect(unsupportedDocumentDetail({ filename: 'vecchio.doc' })).toMatch(/legacy/i)
  })

  it('marca immagini e altri formati come unsupported', () => {
    expect(resolveExtractionDocumentKind({ filename: 'foto.png' })).toBe('unsupported')
  })
})
