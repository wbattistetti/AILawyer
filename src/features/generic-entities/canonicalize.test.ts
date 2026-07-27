/**
 * Test di canonicalizzazione/deduplicazione multipagina e multidocumento.
 */

import { describe, expect, it } from 'vitest'
import { tokenizePlainTextAsPage } from '../entities/adapters/plain-text-tokens'
import { canonicalizeGenericExtraction } from './canonicalize'
import { detectGenericEntitiesOnPage } from './detect-page'

describe('canonicalizeGenericExtraction', () => {
  it('deduplica la stessa entità across pages/docs preservando ogni occorrenza', () => {
    const page1 = detectGenericEntitiesOnPage({
      docId: 'doc-1',
      title: 'a.pdf',
      page: 1,
      tokens: tokenizePlainTextAsPage('Il sig. Mario Rossi tel. 3331234567.'),
    })
    const page2 = detectGenericEntitiesOnPage({
      docId: 'doc-2',
      title: 'b.pdf',
      page: 3,
      tokens: tokenizePlainTextAsPage('Anche il sig. Mario Rossi risultava presente.'),
    })

    const result = canonicalizeGenericExtraction({
      praticaId: 'pratica-1',
      updatedAt: 1_700_000_000_000,
      batches: [
        {
          docId: 'doc-1',
          title: 'a.pdf',
          page: 1,
          hits: page1.hits,
          relationHints: page1.relationHints,
        },
        {
          docId: 'doc-2',
          title: 'b.pdf',
          page: 3,
          hits: page2.hits,
          relationHints: page2.relationHints,
        },
      ],
    })

    const persons = result.entities.filter(entity => entity.kind === 'person')
    expect(persons).toHaveLength(1)
    expect(persons[0].occurrenceCount).toBe(2)
    expect(persons[0].praticaId).toBe('pratica-1')
    expect(persons[0].updatedAt).toBe(1_700_000_000_000)

    const personOccs = result.occurrences.filter(occ => occ.entityKey === persons[0].id)
    expect(personOccs).toHaveLength(2)
    expect(personOccs.map(occ => occ.docId).sort()).toEqual(['doc-1', 'doc-2'])
    expect(personOccs.every(occ => occ.snippet.length > 0 && occ.box)).toBe(true)

    expect(result.relations.some(rel => rel.kind === 'has-contact')).toBe(true)
    expect(result.diagnostics.pagesProcessed).toBe(2)
  })

  it('richiede praticaId e updatedAt validi', () => {
    expect(() =>
      canonicalizeGenericExtraction({
        praticaId: '',
        updatedAt: 1,
        batches: [],
      })
    ).toThrow(/praticaId/)
  })
})
