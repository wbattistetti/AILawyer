/**
 * Schemi Zod e mapping API per il payload delle entità generiche.
 */

import { z } from 'zod'
import {
  deserializeStringProperties,
  GENERIC_ENTITY_KINDS,
  GENERIC_RELATION_KINDS,
  parseStringProperties,
} from './generic-entity-identity.js'

export const MAX_ENTITIES = 5_000
export const MAX_OCCURRENCES = 50_000
export const MAX_RELATIONS = 50_000
export const MAX_EVIDENCE_IDS = 200
export const MAX_PROPERTY_KEYS = 50

const finiteUnitInterval = z.number().finite().min(0).max(1)
const reviewStatusSchema = z.enum([
  'ok',
  'needs_review',
  'ner_verified',
  'ner_corrected',
  'ner_uncertain',
  'ner_unavailable',
  'llm_verified',
  'llm_corrected',
  'review_failed',
])
const reviewFlagsSchema = z.array(z.string().trim().min(1).max(80)).max(20)

const boxSchema = z.object({
  x0Pct: finiteUnitInterval,
  x1Pct: finiteUnitInterval,
  y0Pct: finiteUnitInterval,
  y1Pct: finiteUnitInterval,
}).refine(
  box => box.x1Pct >= box.x0Pct && box.y1Pct >= box.y0Pct,
  'Bounding box non valido',
)

const propertiesSchema = z.unknown().superRefine((value, context) => {
  try {
    parseStringProperties(value)
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'properties non valide',
    })
  }
}).transform(value => parseStringProperties(value))

const entitySchema = z.object({
  id: z.string().trim().min(1).max(200),
  praticaId: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(GENERIC_ENTITY_KINDS),
  subtype: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(500),
  properties: propertiesSchema,
  confidence: finiteUnitInterval,
  occurrenceCount: z.number().int().min(0).max(100_000),
  updatedAt: z.number().finite().optional(),
  reviewStatus: reviewStatusSchema.optional().default('ok'),
  reviewFlags: reviewFlagsSchema.optional().default([]),
  needsReview: z.boolean().optional().default(false),
})

const occurrenceSchema = z.object({
  id: z.string().trim().min(1).max(200),
  entityKey: z.string().trim().min(1).max(200),
  docId: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).max(100_000),
  title: z.string().trim().min(1).max(500),
  snippet: z.string().trim().min(1).max(4_000),
  box: boxSchema,
  confidence: finiteUnitInterval,
  propertyKeys: z.array(z.string().trim().min(1).max(120)).max(MAX_PROPERTY_KEYS).optional(),
  reviewStatus: reviewStatusSchema.optional().default('ok'),
  flags: reviewFlagsSchema.optional().default([]),
  needsReview: z.boolean().optional().default(false),
})

const relationSchema = z.object({
  id: z.string().trim().min(1).max(200),
  fromEntityId: z.string().trim().min(1).max(200),
  toEntityId: z.string().trim().min(1).max(200),
  kind: z.enum(GENERIC_RELATION_KINDS),
  confidence: finiteUnitInterval,
  evidenceOccurrenceIds: z.array(z.string().trim().min(1).max(200)).max(MAX_EVIDENCE_IDS),
})

/** Schema del body PUT di snapshot completo entità/occorrenze/relazioni. */
export const saveGenericEntitiesSchema = z.object({
  entities: z.array(entitySchema).max(MAX_ENTITIES),
  occurrences: z.array(occurrenceSchema).max(MAX_OCCURRENCES).default([]),
  relations: z.array(relationSchema).max(MAX_RELATIONS).default([]),
  diagnostics: z.unknown().optional(),
}).superRefine((payload, context) => {
  const entityKeys = new Set(payload.entities.map(entity => entity.id))
  const occurrenceIds = new Set<string>()
  const fingerprintsByEntity = new Map<string, Set<string>>()

  payload.occurrences.forEach((occurrence, index) => {
    if (!entityKeys.has(occurrence.entityKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurrences', index, 'entityKey'],
        message: `Entità non presente nel payload: ${occurrence.entityKey}`,
      })
    }
    if (occurrenceIds.has(occurrence.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurrences', index, 'id'],
        message: `ID occorrenza duplicato: ${occurrence.id}`,
      })
    }
    occurrenceIds.add(occurrence.id)

    const fingerprintKey = JSON.stringify([
      occurrence.entityKey,
      occurrence.docId,
      occurrence.page,
      occurrence.snippet.replace(/\s+/g, ' ').trim(),
      occurrence.box,
      [...(occurrence.propertyKeys ?? [])].map(key => key.trim()).filter(Boolean).sort(),
    ])
    const known = fingerprintsByEntity.get(occurrence.entityKey) ?? new Set<string>()
    if (known.has(fingerprintKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurrences', index],
        message: 'Occorrenza duplicata (stessa evidenza documentale)',
      })
    }
    known.add(fingerprintKey)
    fingerprintsByEntity.set(occurrence.entityKey, known)
  })

  const relationKeys = new Set<string>()
  payload.relations.forEach((relation, index) => {
    if (!entityKeys.has(relation.fromEntityId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'fromEntityId'],
        message: `Entità sorgente assente: ${relation.fromEntityId}`,
      })
    }
    if (!entityKeys.has(relation.toEntityId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'toEntityId'],
        message: `Entità destinazione assente: ${relation.toEntityId}`,
      })
    }
    if (relation.fromEntityId === relation.toEntityId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'toEntityId'],
        message: 'Una relazione non può collegare un’entità a se stessa',
      })
    }
    const composite = `${relation.fromEntityId}::${relation.toEntityId}::${relation.kind}`
    if (relationKeys.has(composite)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index],
        message: `Relazione duplicata: ${composite}`,
      })
    }
    relationKeys.add(composite)

    relation.evidenceOccurrenceIds.forEach((evidenceId, evidenceIndex) => {
      if (!occurrenceIds.has(evidenceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['relations', index, 'evidenceOccurrenceIds', evidenceIndex],
          message: `Occorrenza evidenza assente: ${evidenceId}`,
        })
      }
    })
  })
})

export type SaveGenericEntitiesPayload = z.infer<typeof saveGenericEntitiesSchema>

type EntityRow = {
  id: string
  externalKey: string
  praticaId: string
  kind: string
  subtype: string
  label: string
  properties: string
  confidence: number
  occurrenceCount: number
  reviewStatus: string
  reviewFlags: string
  needsReview: boolean
  updatedAt: Date
}

type OccurrenceRow = {
  id: string
  sourceDocId: string
  sourceDocTitle: string
  page: number
  snippet: string
  bbox: string
  confidence: number
  propertyKeys: string
  reviewStatus: string
  reviewFlags: string
  needsReview: boolean
  entita: { externalKey: string }
}

type RelationRow = {
  id: string
  fromEntity: { externalKey: string }
  toEntity: { externalKey: string }
  kind: string
  confidence: number
  evidenceOccurrenceIds: string
}

/**
 * Parsa un JSON array di stringhe; fallisce in modo esplicito se il formato non è valido.
 */
export function parseJsonStringArray(raw: string, label: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} non è JSON valido`)
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new Error(`${label} deve essere un array di stringhe`)
  }
  return parsed
}

/** Mappa un record DB entità verso il contratto frontend. */
export function toApiEntity(entity: EntityRow) {
  return {
    id: entity.externalKey,
    praticaId: entity.praticaId,
    kind: entity.kind,
    subtype: entity.subtype,
    label: entity.label,
    properties: deserializeStringProperties(entity.properties),
    confidence: entity.confidence,
    occurrenceCount: entity.occurrenceCount,
    updatedAt: entity.updatedAt.getTime(),
    reviewStatus: entity.reviewStatus,
    reviewFlags: parseJsonStringArray(entity.reviewFlags, 'reviewFlags'),
    needsReview: entity.needsReview,
  }
}

/** Mappa un record DB occorrenza verso il contratto frontend (`title`). */
export function toApiOccurrence(occurrence: OccurrenceRow) {
  const propertyKeys = parseJsonStringArray(occurrence.propertyKeys, 'propertyKeys')
  return {
    id: occurrence.id,
    entityKey: occurrence.entita.externalKey,
    docId: occurrence.sourceDocId,
    page: occurrence.page,
    title: occurrence.sourceDocTitle,
    snippet: occurrence.snippet,
    box: JSON.parse(occurrence.bbox) as {
      x0Pct: number
      x1Pct: number
      y0Pct: number
      y1Pct: number
    },
    confidence: occurrence.confidence,
    reviewStatus: occurrence.reviewStatus,
    flags: parseJsonStringArray(occurrence.reviewFlags, 'reviewFlags'),
    needsReview: occurrence.needsReview,
    ...(propertyKeys.length > 0 ? { propertyKeys } : {}),
  }
}

/** Mappa un record DB relazione verso il contratto frontend. */
export function toApiRelation(relation: RelationRow) {
  return {
    id: relation.id,
    fromEntityId: relation.fromEntity.externalKey,
    toEntityId: relation.toEntity.externalKey,
    kind: relation.kind,
    confidence: relation.confidence,
    evidenceOccurrenceIds: parseJsonStringArray(
      relation.evidenceOccurrenceIds,
      'evidenceOccurrenceIds',
    ),
  }
}

export function entityRetentionKey(kind: string, externalKey: string): string {
  return `${kind}::${externalKey}`
}
