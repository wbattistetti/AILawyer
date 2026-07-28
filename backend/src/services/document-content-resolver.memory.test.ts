/**
 * Test risoluzione contenuto in-memory / DB senza blocco da PDF scansionato locale.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-content-'))
const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock('../lib/database.js', () => ({
  prisma: {
    documento: {
      findFirst,
    },
  },
}))

vi.mock('../lib/storage.js', () => ({
  storageService: {
    getLocalPath: (key: string) => path.join(tempDir, key.replace(/[:<>"|?*\\]/g, '_')),
  },
}))

vi.mock('../lib/extractNativeText.js', () => ({
  extractNativeText: vi.fn(async () => 'VOLTA Alessandro nato a Messina'),
}))

vi.mock('../lib/extractDocxText.js', () => ({
  extractDocxText: vi.fn(async () => 'documento word'),
}))

import { extractNativeText } from '../lib/extractNativeText.js'
import {
  DocumentTextUnavailableError,
  resolveSearchableDocument,
} from './document-content-resolver.js'
import { localOcrProgress } from './local-ocr-store.js'

afterEach(() => {
  localOcrProgress.clear()
  findFirst.mockReset()
  findFirst.mockResolvedValue(null)
  vi.mocked(extractNativeText).mockReset()
  vi.mocked(extractNativeText).mockResolvedValue('VOLTA Alessandro nato a Messina')
  for (const entry of fs.readdirSync(tempDir)) {
    fs.unlinkSync(path.join(tempDir, entry))
  }
})

describe('resolveSearchableDocument in-memory', () => {
  it('usa OCR locale completato senza DB', async () => {
    const hash = 'c'.repeat(64)
    localOcrProgress.set(`${hash}.pdf`, {
      progress: 100,
      status: 'completed',
      result: { texts: ['VESPUCCI Amerigo'], layout: [] },
    })

    const content = await resolveSearchableDocument({ id: hash, filename: 'atto.pdf' })
    expect(content.source).toBe('local-ocr')
    expect(content.pages[0]).toContain('VESPUCCI')
  })

  it('blocca con messaggio chiaro se OCR è in corso', async () => {
    const hash = 'd'.repeat(64)
    localOcrProgress.set(`${hash}.pdf`, {
      progress: 20,
      status: 'processing',
    })

    await expect(
      resolveSearchableDocument({ id: hash, filename: 'scan.pdf' })
    ).rejects.toBeInstanceOf(DocumentTextUnavailableError)

    await expect(
      resolveSearchableDocument({ id: hash, filename: 'scan.pdf' })
    ).rejects.toThrow(/OCR in corso/i)
  })

  it('estrae testo nativo da file locale senza DB', async () => {
    const hash = 'e'.repeat(64)
    const filename = `${hash}.pdf`
    fs.writeFileSync(path.join(tempDir, filename), Buffer.from('%PDF-1.4'))

    const content = await resolveSearchableDocument({
      id: hash,
      hash,
      storageKey: filename,
      filename: 'nativo.pdf',
    })

    expect(content.source).toBe('native-pdf')
    expect(content.pages.join(' ')).toContain('VOLTA Alessandro')
  })

  it('preferisce OCR in DB anche se il PDF locale scansionato non ha testo nativo', async () => {
    const hash = 'f'.repeat(64)
    const filename = `${hash}.pdf`
    fs.writeFileSync(path.join(tempDir, filename), Buffer.from('%PDF-1.4'))
    vi.mocked(extractNativeText).mockResolvedValue('')
    findFirst.mockResolvedValue({
      id: 'db-doc-1',
      filename: '84704.pdf',
      mime: 'application/pdf',
      s3Key: filename,
      ocrText: 'GAMBADILEGNO Ernesto nato a Messina',
      ocrLayout: null,
      hasNativeText: false,
    })

    const content = await resolveSearchableDocument({
      id: hash,
      hash,
      storageKey: filename,
      filename: '84704.pdf',
    })

    expect(content.source).toBe('database-ocr')
    expect(content.pages.join(' ')).toContain('GAMBADILEGNO')
    expect(extractNativeText).not.toHaveBeenCalled()
  })
})
