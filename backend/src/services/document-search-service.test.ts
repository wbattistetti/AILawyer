/**
 * Test deterministici del motore puro di ricerca documentale.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { searchDocumentContent } from './document-search-service'
import {
  getLocalOcrProgressByPrefix,
  getLocalOcrResultByPrefix,
  localOcrProgress
} from './local-ocr-store'
import type { SearchableDocumentContent } from './document-content-resolver'

const createContent = (
  pages: string[],
  layout: SearchableDocumentContent['layout'] = []
): SearchableDocumentContent => ({
  requestedId: 'hash-documento',
  canonicalId: 'documento-db',
  filename: 'atto.pdf',
  source: 'local-ocr',
  pages,
  layout
})

afterEach(() => {
  localOcrProgress.clear()
})

describe('searchDocumentContent', () => {
  it('trova tutte le occorrenze senza distinguere maiuscole e accenti', () => {
    const matches = searchDocumentContent(
      createContent(['Marcello Arnone', 'ARNÓNE compare nuovamente']),
      'arnone'
    )

    expect(matches).toHaveLength(2)
    expect(matches.map((match) => match.page)).toEqual([1, 2])
    expect(matches[0]?.snippet).toContain('Arnone')
  })

  it('accetta whitespace OCR tra le parole', () => {
    const matches = searchDocumentContent(
      createContent(['Marcello\n   Arnone è presente']),
      'Marcello Arnone'
    )

    expect(matches).toHaveLength(1)
    expect(matches[0]?.page).toBe(1)
  })

  it('restituisce il bounding box OCR in percentuale', () => {
    const matches = searchDocumentContent(
      createContent(['Marcello Arnone'], [{
        page: 1,
        width: 1000,
        height: 2000,
        words: [
          { text: 'Marcello', x0: 0.1, y0: 0.2, x1: 0.2, y1: 0.22 },
          { text: 'Arnone', x0: 0.21, y0: 0.2, x1: 0.3, y1: 0.22 }
        ]
      }]),
      'Arnone'
    )

    expect(matches[0]).toMatchObject({
      x0Pct: 21,
      y0Pct: 20,
      x1Pct: 30,
      y1Pct: 22,
      rects: [{
        x0Pct: 21,
        y0Pct: 20,
        x1Pct: 30,
        y1Pct: 22
      }]
    })
  })

  it('restituisce un rettangolo per ogni parola di una frase OCR', () => {
    const matches = searchDocumentContent(
      createContent(['testo non allineato al layout'], [{
        page: 1,
        width: 1000,
        height: 2000,
        words: [
          { text: 'Mario', x0: 100, y0: 400, x1: 180, y1: 440 },
          { text: 'Rossi', x0: 190, y0: 400, x1: 280, y1: 440 }
        ]
      }]),
      'Mario Rossi'
    )

    expect(matches).toHaveLength(1)
    expect(matches[0]?.rects).toHaveLength(2)
    expect(matches[0]?.rects[0]).toMatchObject({
      x0Pct: 10,
      y0Pct: 20,
      x1Pct: 18,
      y1Pct: 22
    })
    expect(matches[0]?.rects[1]?.x0Pct).toBeCloseTo(19)
    expect(matches[0]?.rects[1]?.y0Pct).toBeCloseTo(20)
    expect(matches[0]?.rects[1]?.x1Pct).toBeCloseTo(28)
    expect(matches[0]?.rects[1]?.y1Pct).toBeCloseTo(22)
    expect(matches[0]?.snippet).toBe('Mario Rossi')
  })

  it('non inventa un rettangolo a tutta pagina senza layout OCR', () => {
    const matches = searchDocumentContent(createContent(['Mario Rossi']), 'Rossi')

    expect(matches[0]).toMatchObject({
      x0Pct: 0,
      y0Pct: 0,
      x1Pct: 0,
      y1Pct: 0,
      rects: []
    })
  })

  it('rifiuta coordinate OCR pixel senza dimensioni pagina', () => {
    const content = createContent(['Mario'], [{
      page: 1,
      words: [{ text: 'Mario', x0: 100, y0: 200, x1: 180, y1: 240 }]
    }])

    expect(() => searchDocumentContent(content, 'Mario')).toThrow(
      'Layout OCR non valido: dimensioni pagina mancanti'
    )
  })
})

describe('localOcrStore', () => {
  it('risolve un documento tramite hash anche quando la chiave contiene l’estensione', () => {
    const hash = 'a'.repeat(64)
    localOcrProgress.set(`${hash}.pdf`, {
      progress: 100,
      status: 'completed',
      result: { texts: ['Arnone'], layout: [] }
    })

    expect(getLocalOcrResultByPrefix(hash)).toMatchObject({
      texts: ['Arnone'],
      s3Key: `${hash}.pdf`
    })
  })

  it('espone lo stato OCR in corso per prefisso hash', () => {
    const hash = 'b'.repeat(64)
    localOcrProgress.set(`${hash}.pdf`, {
      progress: 35,
      status: 'processing'
    })

    expect(getLocalOcrProgressByPrefix(hash)).toMatchObject({
      progress: 35,
      status: 'processing'
    })
    expect(getLocalOcrResultByPrefix(hash)).toBeNull()
  })
})
