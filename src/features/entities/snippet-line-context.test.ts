/**
 * Test finestra a righe e generazione snippet contestuale.
 */

import { describe, expect, it } from 'vitest'
import {
  findFocusLineIndex,
  makeLineSnippet,
  splitSnippetLines,
  windowSnippetLines,
} from './snippet-line-context'

describe('snippet-line-context', () => {
  it('estrae 5 righe sopra e sotto da testo con newline', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `riga-${index}`)
    const text = lines.join('\n')
    const start = text.indexOf('riga-10')
    const snippet = makeLineSnippet(text, start, 'riga-10'.length, 5, 5)
    expect(snippet.split('\n')[0]).toBe('riga-5')
    expect(snippet.split('\n').at(-1)).toBe('riga-15')
  })

  it('non spezza artificialmente un testo senza newline', () => {
    const words = Array.from({ length: 80 }, (_, index) => `parola${index}`)
    const text = words.join(' ')
    const target = 'parola40'
    const start = text.indexOf(target)
    const snippet = makeLineSnippet(text, start, target.length, 2, 2)
    expect(snippet).toBe(text)
    expect(snippet).not.toContain('\n')
  })

  it('finestra collassata 2+2 e canExpand se ci sono più righe', () => {
    const snippet = Array.from({ length: 11 }, (_, index) => `L${index} match`).join('\n')
      .replace('L5 match', 'L5 TELEFONO 0120100777')
    const collapsed = windowSnippetLines(snippet, {
      linesBefore: 2,
      linesAfter: 2,
      highlightTerms: ['0120100777'],
    })
    expect(collapsed.text.split('\n')).toEqual([
      'L3 match',
      'L4 match',
      'L5 TELEFONO 0120100777',
      'L6 match',
      'L7 match',
    ])
    expect(collapsed.canExpand).toBe(true)

    const expanded = windowSnippetLines(snippet, {
      linesBefore: 5,
      linesAfter: 5,
      highlightTerms: ['0120100777'],
    })
    expect(expanded.text.split('\n')).toHaveLength(11)
  })

  it('trova la riga focus dal termine evidenziato', () => {
    const lines = splitSnippetLines('uno\ndue 0120100777 tre\nquattro')
    expect(findFocusLineIndex(lines, ['0120100777'])).toBe(1)
  })

  it('mantiene fino a 5+5 righe senza il precedente tetto NER di 500 caratteri', () => {
    const lines = Array.from({ length: 30 }, (_, index) =>
      `riga-${index} ` + 'x'.repeat(40)
    )
    const text = lines.join('\n')
    const start = text.indexOf('riga-15')
    const snippet = makeLineSnippet(text, start, 'riga-15'.length, 5, 5)
    expect(snippet.split('\n')).toHaveLength(11)
    expect(snippet.length).toBeGreaterThan(500)
    expect(snippet).toContain('riga-15')
  })
})