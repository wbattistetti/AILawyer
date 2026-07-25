/**
 * Test deterministici del motore puro di ricerca documentale.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { searchDocumentContent } from './document-search-service'
import {
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
      y1Pct: 22
    })
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
})
