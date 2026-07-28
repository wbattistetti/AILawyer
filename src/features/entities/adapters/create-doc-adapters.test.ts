/**
 * Test factory adapter multi-formato e readiness in-memory.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Documento } from '../../../types'
import { createDocAdapters } from './create-doc-adapters'
import { ClientPdfDocAdapter } from './ClientPdfDocAdapter'
import { MammothDocAdapter } from './MammothDocAdapter'
import { ResolvedContentDocAdapter } from './ResolvedContentDocAdapter'
import { StoredOcrDocAdapter } from './StoredOcrDocAdapter'

vi.mock('../../../lib/api', () => ({
  api: {
    getLocalFileUrl: (key: string) => `http://files.test/${encodeURIComponent(key)}`,
  },
}))

function doc(partial: Partial<Documento> & Pick<Documento, 'id' | 'filename'>): Documento {
  return {
    praticaId: 'p1',
    compartoId: 'c1',
    mime: 'application/octet-stream',
    size: 1,
    s3Key: `keys/${partial.filename}`,
    hash: `hash-${partial.id}`,
    ocrStatus: 'pending',
    tags: [],
    createdAt: new Date().toISOString(),
    ...partial,
  } as Documento
}

describe('createDocAdapters', () => {
  it('usa ClientPdf per PDF nativi e Mammoth per Word', () => {
    const result = createDocAdapters([
      doc({
        id: '1',
        filename: '84704.pdf',
        mime: 'application/pdf',
        hasNativeText: true,
        localUrl: 'blob:native',
      } as Documento & { localUrl: string }),
      doc({
        id: '2',
        filename: 'ANALISI.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        localUrl: 'blob:word',
      } as Documento & { localUrl: string }),
      doc({ id: '3', filename: 'foto.png', mime: 'image/png' }),
    ])

    expect(result.adapters).toHaveLength(2)
    expect(result.adapters[0]).toBeInstanceOf(ClientPdfDocAdapter)
    expect(result.adapters[1]).toBeInstanceOf(MammothDocAdapter)
    expect(result.waitingOnOcr).toEqual([])
    expect(result.skipped).toEqual([
      expect.objectContaining({ docId: '3', reason: 'unsupported' }),
    ])
  })

  it('usa StoredOcr quando ocrText è già sullo store', () => {
    const { adapters } = createDocAdapters([
      doc({
        id: 'pdf-ocr',
        filename: 'scan.pdf',
        mime: 'application/pdf',
        hasNativeText: false,
        ocrStatus: 'completed',
        ocrText: 'VOLTA Alessandro',
      }),
    ])
    expect(adapters[0]).toBeInstanceOf(StoredOcrDocAdapter)
  })

  it('usa ResolvedContent quando OCR è completato ma ocrText non è in store', () => {
    const { adapters } = createDocAdapters([
      doc({
        id: 'pdf-ocr-api',
        filename: 'scan.pdf',
        mime: 'application/pdf',
        hasNativeText: false,
        ocrStatus: 'completed',
      }),
    ])
    expect(adapters[0]).toBeInstanceOf(ResolvedContentDocAdapter)
  })

  it('mette in waitingOnOcr i PDF con OCR in corso', () => {
    const result = createDocAdapters([
      doc({
        id: 'busy',
        filename: 'scan.pdf',
        mime: 'application/pdf',
        hasNativeText: false,
        ocrStatus: 'processing',
      }),
    ])
    expect(result.adapters).toHaveLength(0)
    expect(result.waitingOnOcr).toEqual([
      { docId: 'busy', title: 'scan.pdf' },
    ])
  })

  it('salta i PDF scansionati senza OCR', () => {
    const result = createDocAdapters([
      doc({
        id: 'need',
        filename: 'scan.pdf',
        mime: 'application/pdf',
        hasNativeText: false,
        ocrStatus: 'pending',
      }),
    ])
    expect(result.adapters).toHaveLength(0)
    expect(result.skipped[0]).toMatchObject({
      docId: 'need',
      reason: 'unreadable',
    })
  })

  it('espone getIdentity senza I/O', () => {
    const { adapters } = createDocAdapters([
      doc({
        id: 'pdf-1',
        filename: 'a.pdf',
        mime: 'application/pdf',
        hasNativeText: true,
        localUrl: 'blob:a',
      } as Documento & { localUrl: string }),
    ])
    expect(adapters[0].getIdentity()).toEqual({
      praticaId: 'p1',
      docId: 'pdf-1',
      title: 'a.pdf',
      hash: 'hash-pdf-1',
    })
  })
})
