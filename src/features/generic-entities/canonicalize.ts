/**
 * Canonicalizzazione e deduplicazione practice-wide di hit e relazioni.
 */

import { makeOccurrenceId, makeRelationId } from './ids'
import type { OrganizationUncertaintyFlag } from './organization-quality'
import type {
  GenericEntity,
  GenericExtractionResult,
  GenericOccurrence,
  GenericRelation,
  PageEntityHit,
  PageRelationHint,
  SkippedDocumentFailure,
} from './types'

export type CanonicalPageBatch = {
  docId: string
  title: string
  page: number
  hits: PageEntityHit[]
  relationHints: PageRelationHint[]
}

/**
 * Aggrega hit multipagina/documento in entità canoniche, occorrenze e relazioni.
 */
export function canonicalizeGenericExtraction(args: {
  praticaId: string
  batches: CanonicalPageBatch[]
  skipped?: SkippedDocumentFailure[]
  updatedAt: number
}): GenericExtractionResult {
  if (!args?.praticaId) throw new Error('canonicalizeGenericExtraction: praticaId is required')
  if (!Array.isArray(args.batches)) {
    throw new Error('canonicalizeGenericExtraction: batches must be an array')
  }
  if (!Number.isFinite(args.updatedAt)) {
    throw new Error('canonicalizeGenericExtraction: updatedAt must be a finite number')
  }

  const entityMap = new Map<string, GenericEntity>()
  const occurrences: GenericOccurrence[] = []
  const localToEntityKey = new Map<string, string>()
  const localToOccurrenceId = new Map<string, string>()
  let hitCount = 0
  let relationHintCount = 0

  for (const batch of args.batches) {
    hitCount += batch.hits.length
    relationHintCount += batch.relationHints.length
    for (const hit of batch.hits) {
      localToEntityKey.set(hit.localId, hit.entityKey)
      mergeEntity(entityMap, hit, args.praticaId, args.updatedAt)
      const occurrenceId = makeOccurrenceId(hit.entityKey, batch.docId, batch.page, hit.start)
      localToOccurrenceId.set(hit.localId, occurrenceId)
      occurrences.push({
        id: occurrenceId,
        entityKey: hit.entityKey,
        docId: batch.docId,
        page: batch.page,
        title: batch.title,
        snippet: hit.snippet,
        box: hit.box,
        confidence: hit.confidence,
        propertyKeys: hit.propertyKeys,
        flags: hit.flags,
        needsReview: hit.needsReview,
        reviewStatus: hit.reviewStatus,
      })
    }
  }

  const relations = resolveRelations(
    args.batches,
    localToEntityKey,
    localToOccurrenceId,
    entityMap
  )
  enrichHostPropertiesFromRelations(entityMap, relations)

  const entities = [...entityMap.values()].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)
  )

  return {
    entities,
    occurrences,
    relations,
    diagnostics: {
      pagesProcessed: args.batches.length,
      hitCount,
      relationHintCount,
      skipped: args.skipped ?? [],
    },
  }
}

function mergeEntity(
  map: Map<string, GenericEntity>,
  hit: PageEntityHit,
  praticaId: string,
  updatedAt: number
): void {
  const existing = map.get(hit.entityKey)
  if (!existing) {
    map.set(hit.entityKey, {
      id: hit.entityKey,
      praticaId,
      kind: hit.kind,
      subtype: hit.subtype,
      label: hit.label,
      properties: { ...hit.properties },
      confidence: hit.confidence,
      occurrenceCount: 1,
      updatedAt,
      reviewStatus: hit.reviewStatus ?? (hit.needsReview ? 'needs_review' : 'ok'),
      reviewFlags: hit.flags?.length ? [...hit.flags] : undefined,
      needsReview: hit.needsReview ?? false,
    })
    return
  }
  existing.occurrenceCount += 1
  existing.confidence = Math.max(existing.confidence, hit.confidence)
  existing.updatedAt = updatedAt
  if (hit.label.length > existing.label.length) existing.label = hit.label
  for (const [key, value] of Object.entries(hit.properties)) {
    if (!existing.properties[key] || value.length > existing.properties[key].length) {
      existing.properties[key] = value
    }
  }
  if (!existing.subtype && hit.subtype) existing.subtype = hit.subtype
  existing.needsReview = Boolean(existing.needsReview || hit.needsReview)
  existing.reviewFlags = mergeReviewFlags(existing.reviewFlags, hit.flags)
  existing.reviewStatus = existing.needsReview
    ? 'needs_review'
    : (hit.reviewStatus ?? existing.reviewStatus ?? 'ok')
}

function resolveRelations(
  batches: CanonicalPageBatch[],
  localToEntityKey: Map<string, string>,
  localToOccurrenceId: Map<string, string>,
  entityMap: Map<string, GenericEntity>
): GenericRelation[] {
  const relationMap = new Map<string, GenericRelation>()
  for (const batch of batches) {
    for (const hint of batch.relationHints) {
      const fromKey = localToEntityKey.get(hint.fromLocalId)
      const toKey = localToEntityKey.get(hint.toLocalId)
      if (!fromKey || !toKey || fromKey === toKey) continue
      if (!entityMap.has(fromKey) || !entityMap.has(toKey)) continue
      const fromId = fromKey
      const toId = toKey
      const id = makeRelationId(hint.kind, fromId, toId)
      const evidence = [
        localToOccurrenceId.get(hint.fromLocalId),
        localToOccurrenceId.get(hint.toLocalId),
      ].filter((value): value is string => Boolean(value))
      const existing = relationMap.get(id)
      if (!existing) {
        relationMap.set(id, {
          id,
          fromEntityId: fromId,
          toEntityId: toId,
          kind: hint.kind,
          confidence: hint.confidence,
          evidenceOccurrenceIds: evidence,
        })
      } else {
        existing.confidence = Math.max(existing.confidence, hint.confidence)
        for (const occ of evidence) {
          if (!existing.evidenceOccurrenceIds.includes(occ)) {
            existing.evidenceOccurrenceIds.push(occ)
          }
        }
      }
    }
  }
  return [...relationMap.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Propaga telefono/PEC/indirizzo dalle relazioni alle schede host per la UI. */
function enrichHostPropertiesFromRelations(
  entityMap: Map<string, GenericEntity>,
  relations: GenericRelation[]
): void {
  for (const relation of relations) {
    const host = entityMap.get(relation.fromEntityId)
    const related = entityMap.get(relation.toEntityId)
    if (!host || !related) continue

    if (relation.kind === 'has-contact') {
      if (related.properties.phone && !host.properties.phone) {
        host.properties.phone = related.properties.phone
      }
      if (related.properties.email && !host.properties.email) {
        host.properties.email = related.properties.email
      }
      if (related.properties.pec && !host.properties.pec) {
        host.properties.pec = related.properties.pec
      }
    }

    if (relation.kind === 'located-at') {
      if (related.properties.address && !host.properties.address && !host.properties.office) {
        host.properties.office = related.label
      } else if (related.label && !host.properties.office && related.kind === 'place') {
        host.properties.office = related.label
      }
      if (related.properties.city && !host.properties.city) {
        host.properties.city = related.properties.city
      }
    }
  }
}

function mergeReviewFlags(
  left?: OrganizationUncertaintyFlag[],
  right?: OrganizationUncertaintyFlag[]
): OrganizationUncertaintyFlag[] | undefined {
  if (!left?.length && !right?.length) return undefined
  return [...new Set([...(left ?? []), ...(right ?? [])])]
}
