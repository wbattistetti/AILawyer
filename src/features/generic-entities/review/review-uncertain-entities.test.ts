/**
 * Test deterministici del merge del secondo passaggio LLM.
 */

import { describe, expect, it, vi } from 'vitest'
import { reviewUncertainEntities } from './review-uncertain-entities'
import type { GenericExtractionResult } from '../types'

function extraction(): GenericExtractionResult {
  return {
    entities: [{
      id: 'org-1',
      praticaId: 'p-1',
      kind: 'organization',
      subtype: 'institution',
      label: 'Carabinieri',
      properties: { institutionName: 'Carabinieri' },
      confidence: 0.7,
      occurrenceCount: 1,
      updatedAt: 1,
      needsReview: true,
      reviewStatus: 'needs_review',
      reviewFlags: ['ocrWeirdness'],
    }],
    occurrences: [{
      id: 'occ-1',
      entityKey: 'org-1',
      docId: 'doc-1',
      page: 1,
      title: 'verbale.pdf',
      snippet: 'Stazione dei Carabinieri specie durante le ore',
      box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
      confidence: 0.7,
      needsReview: true,
      reviewStatus: 'needs_review',
      flags: ['ocrWeirdness'],
    }],
    relations: [],
    diagnostics: {
      pagesProcessed: 1,
      hitCount: 1,
      relationHintCount: 0,
      skipped: [],
    },
  }
}

describe('reviewUncertainEntities', () => {
  it('marca verified e conserva una hit valida', async () => {
    const reviewer = vi.fn(async () => ({
      valid: true,
      correctedSpan: [13, 24] as [number, number],
      normalizedLabel: 'Carabinieri',
      confidence: 0.96,
      model: 'llama-3.3-70b-versatile',
      operationId: 'op-1',
    }))

    const outcome = await reviewUncertainEntities(extraction(), 'p-1', {
      model: 'llama-3.3-70b-versatile',
      reviewer,
    })

    expect(outcome.reviewedCount).toBe(1)
    expect(outcome.result.entities[0]?.reviewStatus).toBe('llm_verified')
    expect(outcome.result.entities[0]?.confidence).toBe(0.96)
    expect(outcome.result.occurrences).toHaveLength(1)
  })

  it('scarta entità e occorrenza quando LLM rifiuta', async () => {
    const reviewer = vi.fn(async () => ({
      valid: false,
      correctedSpan: null,
      normalizedLabel: null,
      confidence: 0.95,
      model: 'llama-3.3-70b-versatile',
      operationId: 'op-1',
    }))

    const outcome = await reviewUncertainEntities(extraction(), 'p-1', {
      model: 'llama-3.3-70b-versatile',
      reviewer,
    })

    expect(outcome.rejectedCount).toBe(1)
    expect(outcome.result.entities).toHaveLength(0)
    expect(outcome.result.occurrences).toHaveLength(0)
  })

  it('non nasconde un errore e lascia il candidato da verificare', async () => {
    const reviewer = vi.fn(async () => {
      throw new Error('provider offline')
    })

    const outcome = await reviewUncertainEntities(extraction(), 'p-1', {
      model: 'llama-3.3-70b-versatile',
      reviewer,
    })

    expect(outcome.failures[0]).toContain('provider offline')
    expect(outcome.result.entities[0]?.reviewStatus).toBe('review_failed')
    expect(outcome.result.occurrences).toHaveLength(1)
  })

  it('chiama LLM una sola volta per entità con più occorrenze', async () => {
    const input = extraction()
    input.occurrences.push({
      ...input.occurrences[0]!,
      id: 'occ-2',
      page: 2,
    })
    const reviewer = vi.fn(async () => ({
      valid: true,
      correctedSpan: [13, 24] as [number, number],
      normalizedLabel: 'Carabinieri',
      confidence: 0.96,
      model: 'llama-3.3-70b-versatile',
      operationId: 'op-1',
    }))

    const outcome = await reviewUncertainEntities(input, 'p-1', { reviewer })

    expect(reviewer).toHaveBeenCalledTimes(1)
    expect(outcome.result.occurrences).toHaveLength(2)
    expect(outcome.result.occurrences.every(
      occurrence => occurrence.reviewStatus === 'llm_verified',
    )).toBe(true)
  })
})
