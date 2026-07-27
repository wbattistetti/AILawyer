/**
 * Test adapter del contenuto canonico backend.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDocumentContent } = vi.hoisted(() => ({
  getDocumentContent: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  api: { getDocumentContent },
}))

import {
  layoutPageToTokens,
  ResolvedContentDocAdapter,
} from './ResolvedContentDocAdapter'

describe('ResolvedContentDocAdapter', () => {
  beforeEach(() => getDocumentContent.mockReset())

  it('espone sorgente, dimensione testo e token OCR normalizzati', async () => {
    getDocumentContent.mockResolvedValue({
      requestedId: 'doc-1',
      canonicalId: 'db-1',
      filename: 'atto.pdf',
      source: 'database-ocr',
      pages: ['Mario Rossi, nato a Roma'],
      layout: [{
        page: 1,
        width: 100,
        height: 200,
        words: [
          { text: 'Mario', x0: 10, y0: 20, x1: 20, y1: 30 },
          { text: 'Rossi,', x0: 22, y0: 20, x1: 34, y1: 30 },
          { text: 'nato', x0: 36, y0: 20, x1: 44, y1: 30 },
        ],
      }],
    })
    const adapter = new ResolvedContentDocAdapter({
      praticaId: 'p1',
      docId: 'doc-1',
      title: 'atto.pdf',
      hash: 'hash',
      storageKey: 'files/atto.pdf',
    })

    await expect(adapter.getDocMeta()).resolves.toMatchObject({
      pages: 1,
      source: 'database-ocr',
      textLength: 24,
    })
    const pages = []
    for await (const page of adapter.streamPageTokens()) pages.push(page)
    expect(pages[0].tokens.map(token => token.text)).toEqual([
      'Mario', 'Rossi', ',', 'nato',
    ])
    expect(pages[0].tokens.every(token =>
      token.x0Pct >= 0 && token.x1Pct <= 1 &&
      token.y0Pct >= 0 && token.y1Pct <= 1
    )).toBe(true)
    expect(getDocumentContent).toHaveBeenCalledTimes(1)
  })

  it('usa testo piano quando il layout non contiene parole', async () => {
    getDocumentContent.mockResolvedValue({
      requestedId: 'doc-2',
      canonicalId: 'doc-2',
      filename: 'nativo.pdf',
      source: 'native-pdf',
      pages: ['Anna Bianchi, nata a Milano'],
      layout: [],
    })
    const adapter = new ResolvedContentDocAdapter({
      docId: 'doc-2',
      title: 'nativo.pdf',
      hash: 'hash-2',
    })

    const pages = []
    for await (const page of adapter.streamPageTokens()) pages.push(page)
    expect(pages[0].tokens.map(token => token.text)).toContain('Anna')
    expect(pages[0].tokens.map(token => token.text)).toContain(',')
  })
})

describe('layoutPageToTokens', () => {
  it('restituisce vuoto senza layout utilizzabile', () => {
    expect(layoutPageToTokens(undefined)).toEqual([])
    expect(layoutPageToTokens({ words: [] })).toEqual([])
  })
})
