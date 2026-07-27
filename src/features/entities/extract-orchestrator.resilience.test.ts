/**
 * Test isolamento fallimenti per-documento nell’orchestrator.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocAdapter, DocIdentity, DocMeta, PageToken } from './adapters/types'

vi.mock('./entity-index', () => ({
  upsertOccurrences: vi.fn(),
  upsertPersons: vi.fn(),
  setDocSnapshot: vi.fn(),
}))

vi.mock('../../services/address/client', () => ({
  normalizeAddress: vi.fn(async () => null),
}))

vi.mock('../../services/nlp/client', () => ({
  extractEvents: vi.fn(async () => ({ ok: false, events: [] })),
}))

vi.mock('../events/event-index', () => ({
  addBatch: vi.fn(),
}))

vi.mock('../parsers', () => ({
  PARSERS: [],
}))

vi.mock('../parsers/registry', () => ({
  PARSERS_UNIFIED: [],
}))

class FakeWorker {
  listeners = new Set<(event: MessageEvent) => void>()

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener)
  }

  postMessage(data: any) {
    if (data?.type === 'endDoc') {
      queueMicrotask(() => {
        const event = { data: { type: 'done', docId: data.docId } } as MessageEvent
        this.listeners.forEach(listener => listener(event))
      })
    }
  }
}

vi.stubGlobal('Worker', class {
  constructor() {
    return new FakeWorker()
  }
})

class BrokenAdapter implements DocAdapter {
  constructor(private readonly identity: DocIdentity) {}
  getIdentity() { return { ...this.identity } }
  async getDocMeta(): Promise<DocMeta> {
    throw new Error('Invalid PDF structure.')
  }
  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    yield { page: 1, tokens: [] }
  }
}

class OkAdapter implements DocAdapter {
  constructor(private readonly identity: DocIdentity) {}
  getIdentity() { return { ...this.identity } }
  async getDocMeta(): Promise<DocMeta> {
    return { ...this.identity, pages: 1, source: 'native-pdf' }
  }
  async *streamPageTokens(): AsyncGenerator<{ page: number; tokens: PageToken[] }, void> {
    yield { page: 1, tokens: [{ text: 'Mario', x0Pct: 0, x1Pct: 0.2, y0Pct: 0.1, y1Pct: 0.2 }] }
  }
}

describe('extractPersonsFromDocs resilience', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('continua dopo un adapter illeggibile e restituisce failures', async () => {
    const { extractPersonsFromDocs } = await import('./extract-orchestrator')
    const failures: any[] = []
    const result = await extractPersonsFromDocs(
      [
        new BrokenAdapter({ docId: 'bad', title: 'bad.pdf', hash: 'h1' }),
        new OkAdapter({ docId: 'good', title: 'good.pdf', hash: 'h2' }),
      ],
      undefined,
      {
        onDocFailure: failure => failures.push(failure),
      }
    )

    expect(failures).toHaveLength(1)
    expect(failures[0].docId).toBe('bad')
    expect(failures[0].detail).toMatch(/Invalid PDF structure/)
    expect(result.failures).toHaveLength(1)
    expect(result.snapshots.some(snapshot => snapshot.docId === 'good')).toBe(true)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ docId: 'bad', status: 'failed' }),
      expect.objectContaining({ docId: 'good', status: 'no-candidates', tokenCount: 1 }),
    ]))
  })
})
