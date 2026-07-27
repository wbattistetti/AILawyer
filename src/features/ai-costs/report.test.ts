/**
 * Test aggregazione costi per operazione/pratica.
 */

import { describe, expect, it } from 'vitest'
import type { PracticeAiCall } from '../../lib/api'
import { aggregateAiCallsByOperation } from './report'

function call(overrides: Partial<PracticeAiCall> = {}): PracticeAiCall {
  return {
    id: 'call-1',
    praticaId: 'p-1',
    operationId: 'op-1',
    purpose: 'legal-entity-review',
    providerId: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    costUsd: 0.001,
    costEur: 0.0009,
    pricingFound: true,
    durationMs: 100,
    error: null,
    createdAt: '2026-07-26T10:00:00.000Z',
    ...overrides,
  }
}

describe('aggregateAiCallsByOperation', () => {
  it('somma chiamate della stessa estrazione', () => {
    const rows = aggregateAiCallsByOperation([
      call(),
      call({
        id: 'call-2',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        costEur: 0.0004,
        durationMs: 80,
      }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.calls).toBe(2)
    expect(rows[0]?.inputTokens).toBe(150)
    expect(rows[0]?.costEur).toBeCloseTo(0.0013)
  })

  it('segnala separatamente chiamate senza prezzo', () => {
    const rows = aggregateAiCallsByOperation([
      call({ pricingFound: false, costUsd: null, costEur: null }),
    ])
    expect(rows[0]?.unpricedCalls).toBe(1)
  })
})
