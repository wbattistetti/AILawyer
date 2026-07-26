/**
 * Test risoluzione documento da match della ricerca globale.
 */

import { describe, expect, it } from 'vitest'
import type { Documento } from '../../../../types'
import { resolvePracticeSearchDocument } from './resolvePracticeSearchDocument'

const documents = [
  {
    id: 'uuid-1',
    filename: 'Arresto Di Nardo.pdf',
    hash: 'abc123',
    s3Key: 'pratiche/x/Arresto.pdf',
    praticaId: 'p1'
  },
  {
    id: 'temp:deadbeef',
    filename: '84707.pdf',
    hash: 'deadbeef',
    praticaId: 'p1'
  }
] as Documento[]

describe('resolvePracticeSearchDocument', () => {
  it('risolve per id esatto', () => {
    expect(resolvePracticeSearchDocument(documents, 'uuid-1')?.filename).toBe('Arresto Di Nardo.pdf')
  })

  it('risolve per hash o s3Key quando l’id del match non coincide', () => {
    expect(resolvePracticeSearchDocument(documents, 'abc123')?.id).toBe('uuid-1')
    expect(resolvePracticeSearchDocument(documents, 'pratiche/x/Arresto.pdf')?.id).toBe('uuid-1')
  })

  it('risolve per filename se l’id backend non è nello store UI', () => {
    expect(
      resolvePracticeSearchDocument(documents, 'doc-db-only', 'Arresto Di Nardo.pdf')?.id
    ).toBe('uuid-1')
  })

  it('restituisce undefined se non c’è alcun collocatore', () => {
    expect(resolvePracticeSearchDocument(documents, 'missing', 'altro.pdf')).toBeUndefined()
  })
})
