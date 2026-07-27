/**
 * Escalation LLM manuale: una chiamata per entità canonica irrisolta dal NER.
 * Gli errori non cancellano il candidato: lo marcano review_failed e sono restituiti alla UI.
 */

import { callLegalReview } from './legal-review-client'
import { loadLegalReviewModel } from './llm-model-config'
import type {
  GenericEntity,
  GenericExtractionResult,
  GenericOccurrence,
} from '../types'
import type { LegalReviewPayload, LegalReviewResult } from './legal-review-types'
import { buildCanonicalReviewCandidates } from './review-candidates'

export type UncertainReviewOutcome = {
  result: GenericExtractionResult
  reviewedCount: number
  rejectedCount: number
  failures: string[]
}

/** Rivede soltanto le occorrenze uncertain nel perimetro org/company/venue. */
export async function reviewUncertainEntities(
  extraction: GenericExtractionResult,
  praticaId: string,
  options?: {
    signal?: AbortSignal
    model?: string
    reviewer?: (
      payload: LegalReviewPayload,
      options?: { signal?: AbortSignal },
    ) => Promise<LegalReviewResult>
    onProgress?: (done: number, total: number) => void
  },
): Promise<UncertainReviewOutcome> {
  if (!praticaId.trim()) {
    throw new Error('reviewUncertainEntities: praticaId is required')
  }

  const cloned = cloneExtraction(extraction)
  const entitiesById = new Map(cloned.entities.map(entity => [entity.id, entity]))
  const occurrencesByEntity = groupOccurrences(cloned.occurrences)
  const { candidates, missingEntityIds } = buildCanonicalReviewCandidates(
    cloned,
    entity => Boolean(entity.needsReview),
  )
  const operationId = createOperationId()
  const model = options?.model ?? loadLegalReviewModel()
  const reviewer = options?.reviewer ?? callLegalReview
  const failures = missingEntityIds.map(
    id => `${entitiesById.get(id)?.label ?? id}: label non trovata nelle evidenze`,
  )
  const rejectedIds = new Set<string>()
  let reviewedCount = 0
  let rejectedCount = 0
  let processedCount = 0
  options?.onProgress?.(0, candidates.length)

  for (const candidate of candidates) {
    const entity = entitiesById.get(candidate.entity.id)
    if (!entity) continue

    try {
      const response = await reviewer({
        praticaId,
        operationId,
        snippet: candidate.occurrence.snippet,
        expectedType: candidate.expectedType,
        candidateSpan: candidate.candidateSpan,
        candidateLabel: candidate.candidateLabel,
        flags: candidate.occurrence.flags ?? entity.reviewFlags ?? [],
        model,
      }, options?.signal ? { signal: options.signal } : undefined)
      reviewedCount += 1

      if (!response.valid) {
        rejectedCount += 1
        rejectedIds.add(entity.id)
        processedCount += 1
        options?.onProgress?.(processedCount, candidates.length)
        continue
      }

      const corrected = labelFromSpan(
        candidate.occurrence.snippet,
        response.correctedSpan,
      ) ?? candidate.candidateLabel
      const wasCorrected = corrected !== candidate.candidateLabel
      applyEntityReview(entity, corrected, response.confidence, wasCorrected)
      for (const occurrence of occurrencesByEntity.get(entity.id) ?? []) {
        occurrence.confidence = response.confidence
        occurrence.needsReview = false
        occurrence.reviewStatus = wasCorrected ? 'llm_corrected' : 'llm_verified'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      markEntityFailed(entity)
      for (const occurrence of occurrencesByEntity.get(entity.id) ?? []) {
        occurrence.needsReview = true
        occurrence.reviewStatus = 'review_failed'
      }
      failures.push(`${entity.label}: ${message}`)
    }
    processedCount += 1
    options?.onProgress?.(processedCount, candidates.length)
  }

  const nextOccurrences = cloned.occurrences.filter(
    occurrence => !rejectedIds.has(occurrence.entityKey),
  )
  const occurrenceCounts = countOccurrences(nextOccurrences)
  reconcileEntityReviewStates(entitiesById, nextOccurrences)
  const entities = [...entitiesById.values()]
    .filter(entity => !rejectedIds.has(entity.id))
    .filter(entity => (occurrenceCounts.get(entity.id) ?? 0) > 0)
    .map(entity => ({
      ...entity,
      occurrenceCount: occurrenceCounts.get(entity.id) ?? 0,
    }))
    .sort((left, right) =>
      left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label),
    )
  const retainedIds = new Set(entities.map(entity => entity.id))
  const retainedOccurrenceIds = new Set(nextOccurrences.map(occurrence => occurrence.id))
  const relations = extraction.relations
    .filter(relation =>
      retainedIds.has(relation.fromEntityId) && retainedIds.has(relation.toEntityId),
    )
    .map(relation => ({
      ...relation,
      evidenceOccurrenceIds: relation.evidenceOccurrenceIds.filter(id =>
        retainedOccurrenceIds.has(id),
      ),
    }))
    .filter(relation => relation.evidenceOccurrenceIds.length > 0)

  return {
    result: {
      ...cloned,
      entities,
      occurrences: nextOccurrences,
      relations,
    },
    reviewedCount,
    rejectedCount,
    failures,
  }
}

function applyEntityReview(
  entity: GenericEntity,
  label: string,
  confidence: number,
  corrected: boolean,
): void {
  entity.label = label
  updateNameProperty(entity, label)
  entity.confidence = confidence
  entity.needsReview = false
  entity.reviewStatus = corrected ? 'llm_corrected' : 'llm_verified'
}

function markEntityFailed(entity: GenericEntity): void {
  entity.needsReview = true
  entity.reviewStatus = 'review_failed'
}

function countOccurrences(occurrences: GenericOccurrence[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const occurrence of occurrences) {
    counts.set(occurrence.entityKey, (counts.get(occurrence.entityKey) ?? 0) + 1)
  }
  return counts
}

function labelFromSpan(
  snippet: string,
  span: [number, number] | null,
): string | null {
  if (!span) return null
  const [start, end] = span
  if (start < 0 || end <= start || end > snippet.length) return null
  const label = snippet.slice(start, end).trim()
  return label && label.length <= 300 ? label : null
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

function reconcileEntityReviewStates(
  entitiesById: Map<string, GenericEntity>,
  occurrences: GenericOccurrence[],
): void {
  const grouped = new Map<string, GenericOccurrence[]>()
  for (const occurrence of occurrences) {
    const list = grouped.get(occurrence.entityKey) ?? []
    list.push(occurrence)
    grouped.set(occurrence.entityKey, list)
  }
  for (const [entityId, entity] of entitiesById) {
    const evidence = grouped.get(entityId) ?? []
    if (evidence.length === 0) continue
    entity.confidence = Math.max(...evidence.map(item => item.confidence))
    entity.needsReview = evidence.some(item => item.needsReview)
    const statuses = evidence.map(item => item.reviewStatus)
    if (statuses.includes('review_failed')) entity.reviewStatus = 'review_failed'
    else if (statuses.includes('needs_review')) entity.reviewStatus = 'needs_review'
    else if (statuses.includes('ner_uncertain')) entity.reviewStatus = 'ner_uncertain'
    else if (statuses.includes('ner_unavailable')) entity.reviewStatus = 'ner_unavailable'
    else if (statuses.includes('llm_corrected')) entity.reviewStatus = 'llm_corrected'
    else if (statuses.includes('llm_verified')) entity.reviewStatus = 'llm_verified'
    else if (statuses.includes('ner_corrected')) entity.reviewStatus = 'ner_corrected'
    else if (statuses.includes('ner_verified')) entity.reviewStatus = 'ner_verified'
    else entity.reviewStatus = 'ok'
  }
}

function createOperationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `legal-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
