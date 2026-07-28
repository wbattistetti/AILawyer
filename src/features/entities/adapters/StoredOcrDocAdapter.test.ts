/**
 * Test adapter OCR già presente nello store documento.
 */

import { describe, expect, it } from 'vitest'
import { hasStoredOcrText, StoredOcrDocAdapter } from './StoredOcrDocAdapter'

describe('StoredOcrDocAdapter', () => {
  it('espone pagine e token dal testo OCR in memoria', async () => {
    const adapter = new StoredOcrDocAdapter({
      docId: 'd1',
      title: '84704.pdf',
      hash: 'h1',
      ocrText: 'VOLTA Alessandro\n\f\nVESPUCCI Amerigo',
    })

    const meta = await adapter.getDocMeta()
    expect(meta.pages).toBe(2)
    expect(meta.source).toBe('database-ocr')

    const pages: Array<{ page: number; text: string }> = []
    for await (const page of adapter.streamPageTokens()) {
      pages.push({ page: page.page, text: page.tokens.map(token => token.text).join(' ') })
    }
    expect(pages).toEqual([
      { page: 1, text: 'VOLTA Alessandro' },
      { page: 2, text: 'VESPUCCI Amerigo' },
    ])
  })

  it('hasStoredOcrText richiede testo non vuoto', () => {
    expect(hasStoredOcrText({ ocrText: '  x  ' })).toBe(true)
    expect(hasStoredOcrText({ ocrText: '   ' })).toBe(false)
    expect(hasStoredOcrText({})).toBe(false)
  })
})
