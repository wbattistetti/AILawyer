/**
 * Test di resilienza orchestrator: abort e fallimenti per-documento.
 */

import { describe, expect, it } from 'vitest'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from '../entities/adapters/types'
import { tokenizePlainTextAsPage } from '../entities/adapters/plain-text-tokens'
import { extractGenericEntitiesFromDocs } from './orchestrator'

class OkAdapter implements DocAdapter {
  constructor(
    private readonly identity: DocIdentity,
    private readonly pages: Array<{ page: number; text: string }>
  ) {}

  getIdentity() {
    return { ...this.identity }
  }

  async getDocMeta(): Promise<DocMeta> {
    return {
      ...this.identity,
      pages: this.pages.length,
      source: 'native-pdf',
    }
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    for (const page of this.pages) {
      yield { page: page.page, tokens: tokenizePlainTextAsPage(page.text) }
    }
  }
}

class BrokenAdapter implements DocAdapter {
  constructor(private readonly identity: DocIdentity) {}

  getIdentity() {
    return { ...this.identity }
  }

  async getDocMeta(): Promise<DocMeta> {
    throw new Error('Invalid PDF structure.')
  }

  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    yield { page: 1, tokens: [] }
  }
}

describe('extractGenericEntitiesFromDocs resilience', () => {
  it('continua dopo un documento illeggibile e restituisce diagnostics', async () => {
    const failures: Array<{ docId: string }> = []
    const result = await extractGenericEntitiesFromDocs(
      [
        new BrokenAdapter({ docId: 'bad', title: 'bad.pdf', hash: 'h1' }),
        new OkAdapter(
          { docId: 'good', title: 'good.pdf', hash: 'h2' },
          [{ page: 1, text: 'Il sig. Mario Rossi tel. 3331112233.' }]
        ),
      ],
      {
        praticaId: 'p1',
        nowMs: 42,
        onDocFailure: failure => failures.push(failure),
      }
    )

    expect(failures).toHaveLength(1)
    expect(failures[0].docId).toBe('bad')
    expect(result.diagnostics.skipped).toHaveLength(1)
    expect(result.diagnostics.skipped[0].reason).toBe('unreadable')
    expect(result.entities.some(entity => entity.kind === 'person')).toBe(true)
    expect(result.entities.every(entity => entity.updatedAt === 42)).toBe(true)
  })

  it('rispetta AbortSignal e registra skipped aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await extractGenericEntitiesFromDocs(
      [
        new OkAdapter(
          { docId: 'good', title: 'good.pdf', hash: 'h2' },
          [{ page: 1, text: 'Il sig. Mario Rossi.' }]
        ),
      ],
      {
        praticaId: 'p1',
        signal: controller.signal,
        nowMs: 99,
      }
    )

    expect(result.entities).toHaveLength(0)
    expect(result.diagnostics.skipped.some(item => item.reason === 'aborted')).toBe(true)
  })

  it('fallisce chiaramente senza praticaId', async () => {
    await expect(
      extractGenericEntitiesFromDocs([], { praticaId: '' })
    ).rejects.toThrow(/praticaId/)
  })
})
