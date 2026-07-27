/**
 * Test factory adapter multi-formato.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Documento } from '../../../types'
import { createDocAdapters } from './create-doc-adapters'
import { MammothDocAdapter } from './MammothDocAdapter'
import { ResolvedContentDocAdapter } from './ResolvedContentDocAdapter'

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
    ...partial,
  } as Documento
}

describe('createDocAdapters', () => {
  it('crea adapter PDF e Word e salta i non supportati', () => {
    const result = createDocAdapters([
      doc({ id: '1', filename: '84704.pdf', mime: 'application/pdf' }),
      doc({ id: '2', filename: 'ANALISI.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      doc({ id: '3', filename: 'foto.png', mime: 'image/png' }),
    ])

    expect(result.adapters).toHaveLength(2)
    expect(result.adapters[0]).toBeInstanceOf(ResolvedContentDocAdapter)
    expect(result.adapters[1]).toBeInstanceOf(MammothDocAdapter)
    expect(result.skipped).toEqual([
      expect.objectContaining({ docId: '3', reason: 'unsupported' }),
    ])
  })

  it('espone getIdentity senza I/O', () => {
    const { adapters } = createDocAdapters([
      doc({ id: 'pdf-1', filename: 'a.pdf', mime: 'application/pdf' }),
    ])
    expect(adapters[0].getIdentity()).toEqual({
      praticaId: 'p1',
      docId: 'pdf-1',
      title: 'a.pdf',
      hash: 'hash-pdf-1',
    })
  })
})
