/**
 * Passaggio NER locale batch sulle sole entità canoniche uncertain.
 * Non modifica confidence e non scarta in caso di assenza/conflitto NER.
 */

import type { EntityReviewStatus } from '../organization-quality'
import type {
  GenericEntity,
  GenericExtractionResult,
  GenericOccurrence,
} from '../types'
import {
  buildCanonicalReviewCandidates,
  type CanonicalReviewCandidate,
} from './review-candidates'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const BATCH_SIZE = 50

type NerDecision = 'confirmed' | 'corrected' | 'rejected' | 'uncertain'

type NerReviewResult = {
  id: string
  decision: NerDecision
  correctedSpan: [number, number] | null
  detectedLabel: string | null
  modelId: string
}

export type NerReviewOutcome = {
  result: GenericExtractionResult
  total: number
  verified: number
  corrected: number
  uncertain: number
  unavailable: number
  failures: string[]
}

/** Rivede in batch una volta per entità, con aggiornamento progressivo opzionale. */
export async function reviewUncertainEntitiesWithNer(
  extraction: GenericExtractionResult,
  praticaId: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
    reviewBatch?: typeof callNerBatch
  },
): Promise<NerReviewOutcome> {
  if (!praticaId.trim()) {
    throw new Error('reviewUncertainEntitiesWithNer: praticaId is required')
  }

  const cloned = cloneExtraction(extraction)
  const entitiesById = new Map(cloned.entities.map(entity => [entity.id, entity]))
  const occurrencesByEntity = groupOccurrences(cloned.occurrences)
  const { candidates, missingEntityIds } = buildCanonicalReviewCandidates(
    cloned,
    entity => Boolean(entity.needsReview),
  )
  const failures = missingEntityIds.map(
    id => `${entitiesById.get(id)?.label ?? id}: label non trovata nelle evidenze`,
  )
  for (const entityId of missingEntityIds) {
    applyStatus(
      entitiesById.get(entityId),
      occurrencesByEntity.get(entityId),
      'ner_uncertain',
      true,
    )
  }

  const reviewBatch = options?.reviewBatch ?? callNerBatch
  let done = 0
  let verified = 0
  let corrected = 0
  let uncertain = missingEntityIds.length
  let unavailable = 0
  options?.onProgress?.(0, candidates.length)

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE)
    try {
      const response = await reviewBatch(praticaId, batch, options?.signal)
      const resultsById = new Map(response.map(result => [result.id, result]))
      for (const candidate of batch) {
        const ner = resultsById.get(candidate.entity.id)
        if (!ner) {
          throw new Error(`Risultato NER mancante per ${candidate.entity.id}`)
        }
        const entity = entitiesById.get(candidate.entity.id)
        const evidence = occurrencesByEntity.get(candidate.entity.id)
        if (ner.decision === 'confirmed') {
          applyStatus(entity, evidence, 'ner_verified', false)
          verified += 1
        } else if (ner.decision === 'corrected') {
          const correctedLabel = labelFromNerSpan(candidate, ner.correctedSpan)
          if (!correctedLabel) {
            applyStatus(entity, evidence, 'ner_uncertain', true)
            uncertain += 1
            failures.push(`${candidate.entity.label}: span NER corretto non valido`)
          } else {
            applyStatus(entity, evidence, 'ner_corrected', false, correctedLabel)
            corrected += 1
          }
        } else {
          // Un reject di un modello generalista non elimina prove: resta escalation manuale.
          applyStatus(entity, evidence, 'ner_uncertain', true)
          uncertain += 1
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(message)
      for (const candidate of batch) {
        applyStatus(
          entitiesById.get(candidate.entity.id),
          occurrencesByEntity.get(candidate.entity.id),
          'ner_unavailable',
          true,
        )
        unavailable += 1
      }
    }
    done += batch.length
    options?.onProgress?.(done, candidates.length)
  }

  return {
    result: cloned,
    total: candidates.length + missingEntityIds.length,
    verified,
    corrected,
    uncertain,
    unavailable,
    failures,
  }
}

async function callNerBatch(
  praticaId: string,
  candidates: CanonicalReviewCandidate[],
  signal?: AbortSignal,
): Promise<NerReviewResult[]> {
  const response = await fetch(`${API_BASE}/ner/review-snippets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      praticaId,
      items: candidates.map(candidate => ({
        id: candidate.entity.id,
        snippet: candidate.occurrence.snippet,
        expectedType: candidate.expectedType,
        candidateSpan: candidate.candidateSpan,
        candidateLabel: candidate.candidateLabel,
      })),
    }),
    ...(signal ? { signal } : {}),
  })
  const body = await readJson(response)
  if (!response.ok) {
    const record = body as Record<string, unknown>
    const message = typeof record.details === 'string'
      ? `${String(record.error ?? 'NER fallito')}: ${record.details}`
      : String(record.error ?? `NER HTTP ${response.status}`)
    throw new Error(message)
  }
  const record = body as { results?: unknown }
  if (!Array.isArray(record.results)) {
    throw new Error('Risposta NER senza results')
  }
  return record.results as NerReviewResult[]
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Risposta NER non JSON (HTTP ${response.status})`)
  }
}

function labelFromNerSpan(
  candidate: CanonicalReviewCandidate,
  span: [number, number] | null,
): string | null {
  if (!span) return null
  const [start, end] = span
  if (start < 0 || end <= start || end > candidate.occurrence.snippet.length) return null
  const label = candidate.occurrence.snippet.slice(start, end).trim()
  return label && label.length <= 300 ? label : null
}

function applyStatus(
  entity: GenericEntity | undefined,
  occurrences: GenericOccurrence[] | undefined,
  status: EntityReviewStatus,
  needsReview: boolean,
  correctedLabel?: string,
): void {
  if (!entity) return
  entity.reviewStatus = status
  entity.needsReview = needsReview
  if (correctedLabel) {
    entity.label = correctedLabel
    updateNameProperty(entity, correctedLabel)
  }
  for (const occurrence of occurrences ?? []) {
    occurrence.reviewStatus = status
    occurrence.needsReview = needsReview
  }
}

function updateNameProperty(entity: GenericEntity, label: string): void {
  if (entity.subtype === 'institution') entity.properties.institutionName = label
  else if (entity.subtype === 'company') entity.properties.legalName = label
  else if (entity.kind === 'place') entity.properties.venueName = label
  else entity.properties.organizationName = label
}

function groupOccurrences(
  occurrences: GenericOccurrence[],
): Map<string, GenericOccurrence[]> {
  const grouped = new Map<string, GenericOccurrence[]>()
  for (const occurrence of occurrences) {
    const list = grouped.get(occurrence.entityKey) ?? []
    list.push(occurrence)
    grouped.set(occurrence.entityKey, list)
  }
  return grouped
}

function cloneExtraction(extraction: GenericExtractionResult): GenericExtractionResult {
  return {
    ...extraction,
    entities: extraction.entities.map(entity => ({
      ...entity,
      properties: { ...entity.properties },
      reviewFlags: entity.reviewFlags ? [...entity.reviewFlags] : undefined,
    })),
    occurrences: extraction.occurrences.map(occurrence => ({
      ...occurrence,
      propertyKeys: occurrence.propertyKeys ? [...occurrence.propertyKeys] : undefined,
      flags: occurrence.flags ? [...occurrence.flags] : undefined,
    })),
    relations: extraction.relations.map(relation => ({
      ...relation,
      evidenceOccurrenceIds: [...relation.evidenceOccurrenceIds],
    })),
  }
}
