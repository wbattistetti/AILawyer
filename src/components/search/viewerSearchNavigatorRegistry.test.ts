/**
 * Test del registry navigatori ricerca ↔ viewer.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewerSearchNavigatorRegistry } from './viewerSearchNavigatorRegistry'
import type { DocumentMatch, ViewerSearchNavigator } from './types'

const match = (docId: string): DocumentMatch => ({
  id: 'm1',
  docId,
  docTitle: 'Atto.pdf',
  kind: 'pdf',
  page: 1,
  q: 'roma',
  x0Pct: 10,
  x1Pct: 20,
  y0Pct: 10,
  y1Pct: 12,
  rects: [{ x0Pct: 10, x1Pct: 20, y0Pct: 10, y1Pct: 12 }],
  snippet: 'roma',
  score: 1
})

describe('ViewerSearchNavigatorRegistry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('risolve subito se il navigatore è già registrato', async () => {
    const registry = new ViewerSearchNavigatorRegistry()
    const goToMatch = vi.fn(async () => undefined)
    const navigator: ViewerSearchNavigator = {
      documentId: 'doc-1',
      kind: 'pdf',
      goToMatch
    }
    registry.register(navigator)

    const ready = await registry.waitFor('doc-1')
    await ready.goToMatch(match('doc-1'))
    expect(goToMatch).toHaveBeenCalledTimes(1)
  })

  it('attende la registrazione successiva senza eventi globali', async () => {
    const registry = new ViewerSearchNavigatorRegistry()
    const pending = registry.waitFor('doc-2', 1000)

    queueMicrotask(() => {
      registry.register({
        documentId: 'doc-2',
        kind: 'pdf',
        goToMatch: async () => undefined
      })
    })

    const navigator = await pending
    expect(navigator.documentId).toBe('doc-2')
  })

  it('fallisce in modo esplicito allo scadere del timeout', async () => {
    vi.useFakeTimers()
    const registry = new ViewerSearchNavigatorRegistry()
    const pending = registry.waitFor('missing', 50)
    const assertion = expect(pending).rejects.toThrow('Viewer non pronto')
    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })
})
