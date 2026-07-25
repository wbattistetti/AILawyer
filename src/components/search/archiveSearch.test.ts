/**
 * Test della normalizzazione dei risultati della ricerca globale.
 */

import { describe, expect, it } from 'vitest'
import { normalizeArchiveSearchResults, type PracticeSearchDocument } from './archiveSearch'

const documents: PracticeSearchDocument[] = [
  { id: 'doc-1', title: 'Atto.pdf', hash: 'hash-1', kind: 'pdf' },
  { id: 'doc-2', title: 'Memoria.pdf', hash: 'hash-2', kind: 'pdf' }
]

const match = (docId: string, page: number, filename?: string) => ({
  docId,
  filename: filename || `${docId}.pdf`,
  page,
  snippet: `Occorrenza a pagina ${page}`,
  x0Pct: 10,
  x1Pct: 30,
  y0Pct: 20,
  y1Pct: 25,
  charIdx: 4,
  qLen: 6
})

describe('normalizeArchiveSearchResults', () => {
  it('raggruppa le occorrenze nell’ordine dei documenti della pratica', () => {
    const result = normalizeArchiveSearchResults('ricorso', documents, [
      match('doc-2', 3),
      match('doc-1', 1),
      match('doc-1', 2)
    ])

    expect(result.total).toBe(3)
    expect(result.groups.map((group) => group.doc.title)).toEqual(['Atto.pdf', 'Memoria.pdf'])
    expect(result.groups[0].matches.map((item) => item.page)).toEqual([1, 2])
    expect(result.groups[0].matches[0].rects).toEqual([
      { x0Pct: 10, x1Pct: 30, y0Pct: 20, y1Pct: 25 }
    ])
  })

  it('accetta match della pratica assenti dallo store UI usando il filename backend', () => {
    const result = normalizeArchiveSearchResults('ricorso', documents, [
      match('doc-db-only', 1, 'Arresto Di Nardo.pdf')
    ])

    expect(result.total).toBe(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].doc.id).toBe('doc-db-only')
    expect(result.groups[0].doc.title).toBe('Arresto Di Nardo.pdf')
  })

  it('rifiuta coordinate fuori dal range percentuale', () => {
    expect(() =>
      normalizeArchiveSearchResults('ricorso', documents, [
        { ...match('doc-1', 1), x1Pct: 101 }
      ])
    ).toThrow('deve essere tra 0 e 100')
  })
})
