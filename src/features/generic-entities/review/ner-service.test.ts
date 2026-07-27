/**
 * Test deterministici del passaggio NER canonico senza rete.
 */

import { describe, expect, it, vi } from 'vitest'
import type { GenericExtractionResult } from '../types'
import { reviewUncertainEntitiesWithNer } from './ner-service'

function extraction(): GenericExtractionResult {
  const occurrence = {
    id: 'occ-1',
    entityKey: 'org-1',
    docId: 'doc-1',
    page: 1,
    title: 'verbale.pdf',
    snippet: 'presso Stazione dei Carabinieri di Roma',
    box: { x0Pct: 0, x1Pct: 1, y0Pct: 0, y1Pct: 1 },
    confidence: 0.65,
    needsReview: true,
    reviewStatus: 'needs_review' as const,
  }
  return {
    entities: [{
      id: 'org-1',
      praticaId: 'p-1',
      kind: 'organization',
      subtype: 'institution',
      label: 'Carabinieri',
      properties: { institutionName: 'Carabinieri' },
      confidence: 0.65,
      occurrenceCount: 2,
      updatedAt: 1,
      needsReview: true,
      reviewStatus: 'needs_review',
    }],
    occurrences: [
      occurrence,
      { ...occurrence, id: 'occ-2', page: 2 },
    ],
    relations: [],
    diagnostics: {
      pagesProcessed: 2,
      hitCount: 2,
      relationHintCount: 0,
      skipped: [],
    },
  }
}

describe('reviewUncertainEntitiesWithNer', () => {
  it('invia un solo candidato per entità e propaga la conferma', async () => {
    const reviewBatch = vi.fn(async () => [{
      id: 'org-1',
      decision: 'confirmed' as const,
      correctedSpan: [20, 31] as [number, number],
      detectedLabel: 'ORG',
      modelId: 'it_core_news_lg',
    }])

    const outcome = await reviewUncertainEntitiesWithNer(extraction(), 'p-1', {
      reviewBatch,
    })

    expect(reviewBatch).toHaveBeenCalledTimes(1)
    expect(reviewBatch.mock.calls[0]?.[1]).toHaveLength(1)
    expect(outcome.verified).toBe(1)
    expect(outcome.result.entities[0]?.reviewStatus).toBe('ner_verified')
    expect(outcome.result.occurrences.every(item => !item.needsReview)).toBe(true)
  })

  it('applica solo una correzione che punta allo snippet originale', async () => {
    const reviewBatch = vi.fn(async () => [{
      id: 'org-1',
      decision: 'corrected' as const,
      correctedSpan: [7, 31] as [number, number],
      detectedLabel: 'ORG',
      modelId: 'it_core_news_lg',
    }])

    const outcome = await reviewUncertainEntitiesWithNer(extraction(), 'p-1', {
      reviewBatch,
    })

    expect(outcome.corrected).toBe(1)
    expect(outcome.result.entities[0]?.label).toBe('Stazione dei Carabinieri')
    expect(outcome.result.entities[0]?.properties.institutionName)
      .toBe('Stazione dei Carabinieri')
  })

  it('mantiene il candidato escalabile quando il servizio è indisponibile', async () => {
    const reviewBatch = vi.fn(async () => {
      throw new Error('servizio offline')
    })

    const outcome = await reviewUncertainEntitiesWithNer(extraction(), 'p-1', {
      reviewBatch,
    })

    expect(outcome.unavailable).toBe(1)
    expect(outcome.failures[0]).toContain('servizio offline')
    expect(outcome.result.entities[0]?.reviewStatus).toBe('ner_unavailable')
    expect(outcome.result.entities[0]?.needsReview).toBe(true)
  })
})
