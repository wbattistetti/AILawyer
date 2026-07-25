/**
 * Test deterministici della ricerca testuale Word.
 */

import { describe, expect, it } from 'vitest'
import { findWordMatchesInPages } from './wordSearchAdapter'

describe('findWordMatchesInPages', () => {
  it('trova tutte le occorrenze senza distinguere maiuscole e minuscole', () => {
    const matches = findWordMatchesInPages(
      [{ page: 1, text: 'Procura della Repubblica. PROCURA competente.' }],
      'procura',
      'doc-1',
      'Atto.docx'
    )

    expect(matches).toHaveLength(2)
    expect(matches.map((match) => match.charIdx)).toEqual([0, 26])
    expect(matches.every((match) => match.kind === 'word')).toBe(true)
  })

  it('mantiene separati i risultati di pagine differenti', () => {
    const matches = findWordMatchesInPages(
      [
        { page: 1, text: 'prima udienza' },
        { page: 2, text: 'seconda udienza' }
      ],
      'udienza',
      'doc-2',
      'Verbale.docx'
    )

    expect(matches.map((match) => match.page)).toEqual([1, 2])
    expect(matches[0].id).not.toBe(matches[1].id)
  })

  it('rifiuta query vuote e pagine non valide', () => {
    expect(() => findWordMatchesInPages([], '   ', 'doc-3', 'Atto.docx'))
      .toThrow('La query di ricerca non può essere vuota')
    expect(() => findWordMatchesInPages(
      [{ page: 0, text: 'testo' }],
      'testo',
      'doc-3',
      'Atto.docx'
    )).toThrow('Numero pagina Word non valido')
  })
})
