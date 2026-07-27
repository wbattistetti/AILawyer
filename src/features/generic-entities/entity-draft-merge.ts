/**
 * Merge incrementale dei risultati di estrazione entità tipizzate.
 * Conserva le evidenze dei documenti non rianalizzati; deduplica per entityKey.
 */

import type {
  GenericEntity,
  GenericOccurrence,
  GenericRelation,
} from './types'

export type EntityExtractionSlice = {
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
}

/**
 * Unisce bozza precedente e nuova estrazione.
 * - occorrenze dei doc in `processedDocIds` vengono sostituite
 * - occorrenze degli altri doc restano
 * - entità merge per id, senza duplicati; occurrenceCount ricalcolato
 */
export function mergeEntityExtractionSlices(
  previous: EntityExtractionSlice,
  incoming: EntityExtractionSlice,
  processedDocIds: readonly string[]
): EntityExtractionSlice {
  if (!Array.isArray(processedDocIds)) {
    throw new Error('mergeEntityExtractionSlices: processedDocIds must be an array')
  }
  const processed = new Set(processedDocIds.filter(Boolean))

  const keptOccurrences = previous.occurrences.filter(
    occurrence => !processed.has(occurrence.docId)
  )
  const occurrenceById = new Map<string, GenericOccurrence>()
  for (const occurrence of keptOccurrences) {
    occurrenceById.set(occurrence.id, occurrence)
  }
  for (const occurrence of incoming.occurrences) {
    occurrenceById.set(occurrence.id, occurrence)
  }
  const occurrences = [...occurrenceById.values()]

  const entityById = new Map<string, GenericEntity>()
  for (const entity of previous.entities) {
    entityById.set(entity.id, { ...entity, properties: { ...entity.properties } })
  }
  for (const entity of incoming.entities) {
    const existing = entityById.get(entity.id)
    entityById.set(entity.id, existing ? mergeEntityRecord(existing, entity) : {
      ...entity,
      properties: { ...entity.properties },
    })
  }

  const counts = new Map<string, number>()
  for (const occurrence of occurrences) {
    counts.set(occurrence.entityKey, (counts.get(occurrence.entityKey) ?? 0) + 1)
  }

  const entities = [...entityById.values()]
    .map(entity => ({
      ...entity,
      occurrenceCount: counts.get(entity.id) ?? 0,
    }))
    .filter(entity => entity.occurrenceCount > 0)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))

  const aliveEntityIds = new Set(entities.map(entity => entity.id))
  const aliveOccurrenceIds = new Set(occurrences.map(occurrence => occurrence.id))

  const relationById = new Map<string, GenericRelation>()
  for (const relation of [...previous.relations, ...incoming.relations]) {
    if (!aliveEntityIds.has(relation.fromEntityId) || !aliveEntityIds.has(relation.toEntityId)) {
      continue
    }
    const evidence = relation.evidenceOccurrenceIds.filter(id => aliveOccurrenceIds.has(id))
    const existing = relationById.get(relation.id)
    if (!existing) {
      relationById.set(relation.id, {
        ...relation,
        evidenceOccurrenceIds: evidence,
      })
      continue
    }
    const mergedEvidence = [...new Set([...existing.evidenceOccurrenceIds, ...evidence])]
    relationById.set(relation.id, {
      ...existing,
      confidence: Math.max(existing.confidence, relation.confidence),
      evidenceOccurrenceIds: mergedEvidence,
    })
  }

  return {
    entities,
    occurrences,
    relations: [...relationById.values()],
  }
}

function mergeEntityRecord(existing: GenericEntity, incoming: GenericEntity): GenericEntity {
  const properties = { ...existing.properties }
  for (const [key, value] of Object.entries(incoming.properties)) {
    if (!properties[key] || value.length > properties[key].length) {
      properties[key] = value
    }
  }
  return {
    ...existing,
    subtype: incoming.subtype && incoming.subtype !== 'mention'
      ? incoming.subtype
      : existing.subtype || incoming.subtype,
    label: incoming.label.length >= existing.label.length ? incoming.label : existing.label,
    properties,
    confidence: Math.max(existing.confidence, incoming.confidence),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    occurrenceCount: existing.occurrenceCount,
    needsReview: Boolean(existing.needsReview || incoming.needsReview),
    reviewFlags: mergeFlags(existing.reviewFlags, incoming.reviewFlags),
    reviewStatus:
      existing.needsReview || incoming.needsReview
        ? 'needs_review'
        : (incoming.reviewStatus ?? existing.reviewStatus ?? 'ok'),
  }
}

function mergeFlags(
  left?: GenericEntity['reviewFlags'],
  right?: GenericEntity['reviewFlags']
): GenericEntity['reviewFlags'] {
  if (!left?.length && !right?.length) return undefined
  return [...new Set([...(left ?? []), ...(right ?? [])])]
}
