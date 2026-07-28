/**
 * Test della fonte documenti pratica (store → meta / adapter).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Documento } from '../../types'
import { useDocumentStore } from '../../stores/documentStore/store'
import {
  buildPracticeExtractionAdapters,
  getPracticeDocuments,
  listPracticeDocMeta,
} from './practice-document-source'

vi.mock('../../lib/api', () => ({
  api: {
    getLocalFileUrl: (key: string) => `http://files.test/${encodeURIComponent(key)}`,
  },
}))

function doc(partial: Partial<Documento> & Pick<Documento, 'id' | 'filename' | 'praticaId'>): Documento {
  return {
    compartoId: 'c1',
    mime: 'application/pdf',
    size: 1,
    s3Key: `keys/${partial.filename}`,
    hash: `hash-${partial.id}`,
    ocrStatus: 'pending',
    tags: [],
    ...partial,
  } as Documento
}

describe('practice-document-source', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      documents: new Map(),
      praticaId: null,
    })
  })

  it('legge solo i documenti della pratica richiesta', () => {
    useDocumentStore.getState().setDocuments([
      doc({ id: 'a', filename: 'a.pdf', praticaId: 'p1', s3Key: 'keys/a.pdf', hash: 'hash-a' }),
      doc({ id: 'b', filename: 'b.pdf', praticaId: 'p2', s3Key: 'keys/b.pdf', hash: 'hash-b' }),
    ])

    const docs = getPracticeDocuments('p1')
    expect(docs.map(d => d.filename)).toEqual(['a.pdf'])
    expect(listPracticeDocMeta('p1')).toEqual([
      expect.objectContaining({ title: 'a.pdf', praticaId: 'p1' }),
    ])
  })

  it('include i documenti temporanei senza praticaId nello store della pratica aperta', () => {
    useDocumentStore.getState().setDocuments([
      doc({ id: 'temp:1', filename: 'bozza.pdf', praticaId: '' as any, s3Key: 'temp/bozza.pdf', hash: 'h-temp' }),
    ])
    // praticaId vuoto: il filtro li tratta come scoped allo store corrente
    const without = getPracticeDocuments('p1')
    expect(without.map(d => d.filename)).toEqual(['bozza.pdf'])
  })

  it('costruisce adapter dai documenti live dello store', () => {
    useDocumentStore.getState().setDocuments([
      doc({
        id: '1',
        filename: 'atto.pdf',
        praticaId: 'p1',
        mime: 'application/pdf',
        hasNativeText: true,
        localUrl: 'blob:atto',
      } as Documento & { localUrl: string }),
      doc({
        id: '2',
        filename: 'nota.docx',
        praticaId: 'p1',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        localUrl: 'blob:nota',
      } as Documento & { localUrl: string }),
    ])

    const result = buildPracticeExtractionAdapters('p1')
    expect(result.adapters).toHaveLength(2)
    expect(result.skipped).toHaveLength(0)
    expect(result.waitingOnOcr).toHaveLength(0)
  })

  it('limita gli adapter ai soli documenti richiesti', () => {
    useDocumentStore.getState().setDocuments([
      doc({
        id: '1',
        filename: 'uno.pdf',
        praticaId: 'p1',
        hasNativeText: true,
        localUrl: 'blob:uno',
      } as Documento & { localUrl: string }),
      doc({
        id: '2',
        filename: 'due.pdf',
        praticaId: 'p1',
        hasNativeText: true,
        localUrl: 'blob:due',
      } as Documento & { localUrl: string }),
    ])

    // setDocuments usa s3Key come id quando hash non è SHA-256 completo
    expect(buildPracticeExtractionAdapters('p1', ['keys/due.pdf']).adapters).toHaveLength(1)
    expect(buildPracticeExtractionAdapters('p1', []).adapters).toHaveLength(0)
  })
})
