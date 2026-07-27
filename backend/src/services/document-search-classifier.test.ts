/**
 * Test della classificazione dei documenti per la ricerca globale.
 */

import { describe, expect, it } from 'vitest'
import {
  classifyDocumentForSearch,
  type SearchDocumentMetadata
} from './document-search-classifier'

const document = (
  overrides: Partial<SearchDocumentMetadata> = {}
): SearchDocumentMetadata => ({
  id: 'doc-1',
  filename: 'atto.pdf',
  mime: 'application/pdf',
  hasNativeText: false,
  ocrStatus: 'pending',
  ocrText: null,
  ...overrides
})

describe('classifyDocumentForSearch', () => {
  it('cerca PDF nativi e PDF con OCR', () => {
    expect(classifyDocumentForSearch(document({ hasNativeText: true }))).toEqual({
      kind: 'pdf',
      role: 'searchable'
    })
    expect(classifyDocumentForSearch(document({ ocrText: 'testo OCR' }))).toEqual({
      kind: 'pdf',
      role: 'searchable'
    })
  })

  it('richiede OCR solo per PDF scansionati privi di testo', () => {
    expect(classifyDocumentForSearch(document())).toEqual({
      kind: 'pdf',
      role: 'ocr-required'
    })
  })

  it('cerca DOCX e ignora immagini senza testo', () => {
    expect(classifyDocumentForSearch(document({
      filename: 'analisi.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }))).toEqual({ kind: 'docx', role: 'searchable' })

    expect(classifyDocumentForSearch(document({
      filename: 'foto.jpg',
      mime: 'image/jpeg'
    }))).toEqual({ kind: 'other', role: 'ignored' })
  })
})
