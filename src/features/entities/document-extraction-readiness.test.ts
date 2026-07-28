/**
 * Test gate readiness estrazione (nativo / OCR / in corso).
 */

import { describe, expect, it } from 'vitest'
import type { Documento } from '../../types'
import {
  classifyExtractionReadiness,
  formatOcrInProgressMessage,
  listOcrInProgressTitles,
} from './document-extraction-readiness'

function doc(partial: Partial<Documento> & Pick<Documento, 'id' | 'filename'>): Documento {
  return {
    praticaId: 'p1',
    compartoId: 'c1',
    mime: 'application/pdf',
    size: 1,
    s3Key: `${partial.id}.pdf`,
    hash: `hash-${partial.id}`,
    ocrStatus: 'pending',
    tags: [],
    createdAt: new Date().toISOString(),
    ...partial,
  } as Documento
}

describe('classifyExtractionReadiness', () => {
  it('marca i PDF con testo nativo come ready-native', () => {
    expect(classifyExtractionReadiness(doc({
      id: '1',
      filename: 'nativo.pdf',
      hasNativeText: true,
    })).status).toBe('ready-native')
  })

  it('tratta hasNativeText undefined come ready-native (rilevazione ancora in corso)', () => {
    expect(classifyExtractionReadiness(doc({
      id: '1b',
      filename: 'forse-nativo.pdf',
    })).status).toBe('ready-native')
  })

  it('marca i DOCX come ready-native', () => {
    expect(classifyExtractionReadiness(doc({
      id: '2',
      filename: 'atto.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })).status).toBe('ready-native')
  })

  it('marca OCR completato come ready-ocr', () => {
    expect(classifyExtractionReadiness(doc({
      id: '3',
      filename: 'scan.pdf',
      hasNativeText: false,
      ocrStatus: 'completed',
    })).status).toBe('ready-ocr')
  })

  it('marca ready-ocr se ocrText è già sul documento', () => {
    expect(classifyExtractionReadiness(doc({
      id: '3b',
      filename: 'scan.pdf',
      hasNativeText: false,
      ocrStatus: 'pending',
      ocrText: 'VOLTA Alessandro',
    })).status).toBe('ready-ocr')
  })

  it('rileva OCR in corso dallo stato documento', () => {
    expect(classifyExtractionReadiness(doc({
      id: '4',
      filename: 'scan.pdf',
      hasNativeText: false,
      ocrStatus: 'processing',
    })).status).toBe('ocr-in-progress')
  })

  it('rileva OCR in corso dal progress UI', () => {
    expect(classifyExtractionReadiness(
      doc({ id: '5', filename: 'scan.pdf', hasNativeText: false }),
      { progressByDocId: { '5': 40 } }
    ).status).toBe('ocr-in-progress')
  })

  it('richiede OCR se non nativo e non trascritto', () => {
    const result = classifyExtractionReadiness(doc({
      id: '6',
      filename: 'scan.pdf',
      hasNativeText: false,
      ocrStatus: 'pending',
    }))
    expect(result.status).toBe('ocr-required')
    expect(result.detail).toMatch(/OCR non completato/i)
  })

  it('formatta il messaggio di attesa OCR', () => {
    const titles = listOcrInProgressTitles([
      doc({ id: 'a', filename: 'A.pdf', hasNativeText: false, ocrStatus: 'processing' }),
      doc({ id: 'b', filename: 'B.pdf', hasNativeText: true }),
    ])
    expect(titles).toEqual(['A.pdf'])
    expect(formatOcrInProgressMessage(titles)).toMatch(/OCR ancora in corso/)
  })
})
