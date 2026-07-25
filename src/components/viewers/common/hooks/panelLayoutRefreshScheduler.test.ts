/**
 * Deterministic tests for dock panel layout refresh scheduling.
 */

import { describe, expect, it, vi } from 'vitest'
import { createPanelLayoutRefreshScheduler } from './panelLayoutRefreshScheduler'

function createFrameHarness() {
  let nextId = 1
  let callbacks = new Map<number, FrameRequestCallback>()

  return {
    requestFrame: (callback: FrameRequestCallback) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancelFrame: (id: number) => {
      callbacks.delete(id)
    },
    flushFrame: () => {
      const currentCallbacks = callbacks
      callbacks = new Map()
      currentCallbacks.forEach((callback) => callback(0))
    }
  }
}

describe('createPanelLayoutRefreshScheduler', () => {
  it('aggiorna il viewer soltanto dopo due frame', () => {
    const harness = createFrameHarness()
    const onRefresh = vi.fn()
    const scheduler = createPanelLayoutRefreshScheduler(
      onRefresh,
      harness.requestFrame,
      harness.cancelFrame
    )

    scheduler.schedule()
    harness.flushFrame()
    expect(onRefresh).not.toHaveBeenCalled()

    harness.flushFrame()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('accorpa più richieste nello stesso aggiornamento', () => {
    const harness = createFrameHarness()
    const onRefresh = vi.fn()
    const scheduler = createPanelLayoutRefreshScheduler(
      onRefresh,
      harness.requestFrame,
      harness.cancelFrame
    )

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    harness.flushFrame()
    harness.flushFrame()

    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('annulla un aggiornamento pendente durante il cleanup', () => {
    const harness = createFrameHarness()
    const onRefresh = vi.fn()
    const scheduler = createPanelLayoutRefreshScheduler(
      onRefresh,
      harness.requestFrame,
      harness.cancelFrame
    )

    scheduler.schedule()
    harness.flushFrame()
    scheduler.cancel()
    harness.flushFrame()

    expect(onRefresh).not.toHaveBeenCalled()
  })
})
