/**
 * Sincronizzazione transazionale dello snapshot entità generiche di una pratica.
 */

import type { PrismaClient } from '@prisma/client'
import { createGenericOccurrenceFingerprint, serializeStringProperties } from './generic-entity-identity.js'
import {
  entityRetentionKey,
  toApiEntity,
  toApiOccurrence,
  toApiRelation,
  type SaveGenericEntitiesPayload,
} from './generic-entity-validation.js'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Carica lo snapshot completo `{ entities, occurrences, relations }` per una pratica.
 */
export async function loadPracticeEntitiesPayload(db: PrismaClient | TransactionClient, praticaId: string) {
  const entities = await db.entitaGenerica.findMany({
    where: { praticaId },
    include: {
      occorrenze: { orderBy: [{ sourceDocTitle: 'asc' }, { page: 'asc' }] },
    },
    orderBy: [{ kind: 'asc' }, { label: 'asc' }],
  })
  const relations = await db.relazioneEntitaGenerica.findMany({
    where: { praticaId },
    include: {
      fromEntity: { select: { externalKey: true } },
      toEntity: { select: { externalKey: true } },
    },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  })

  return {
    entities: entities.map(toApiEntity),
    occurrences: entities.flatMap(entity => entity.occorrenze.map(occurrence => toApiOccurrence({
      ...occurrence,
      entita: { externalKey: entity.externalKey },
    }))),
    relations: relations.map(toApiRelation),
  }
}

/**
 * Applica uno snapshot completo in una transazione già aperta: upsert, prune e remap evidenze.
 */
export async function syncPracticeEntitiesSnapshot(
  transaction: TransactionClient,
  praticaId: string,
  payload: SaveGenericEntitiesPayload,
): Promise<void> {
  const retained = new Set(
    payload.entities.map(entity => entityRetentionKey(entity.kind, entity.id)),
  )
  const existingEntities = await transaction.entitaGenerica.findMany({
    where: { praticaId },
    select: { id: true, kind: true, externalKey: true },
  })
  const entityIdsToDelete = existingEntities
    .filter(entity => !retained.has(entityRetentionKey(entity.kind, entity.externalKey)))
    .map(entity => entity.id)
  if (entityIdsToDelete.length > 0) {
    await transaction.entitaGenerica.deleteMany({
      where: { id: { in: entityIdsToDelete } },
    })
  }

  const entityDbIds = new Map<string, string>()
  for (const entity of payload.entities) {
    const record = await transaction.entitaGenerica.upsert({
      where: {
        praticaId_kind_externalKey: {
          praticaId,
          kind: entity.kind,
          externalKey: entity.id,
        },
      },
      create: {
        praticaId,
        externalKey: entity.id,
        kind: entity.kind,
        subtype: entity.subtype,
        label: entity.label,
        properties: serializeStringProperties(entity.properties),
        confidence: entity.confidence,
        occurrenceCount: entity.occurrenceCount,
        reviewStatus: entity.reviewStatus,
        reviewFlags: JSON.stringify(entity.reviewFlags),
        needsReview: entity.needsReview,
      },
      update: {
        subtype: entity.subtype,
        label: entity.label,
        properties: serializeStringProperties(entity.properties),
        confidence: entity.confidence,
        occurrenceCount: entity.occurrenceCount,
        reviewStatus: entity.reviewStatus,
        reviewFlags: JSON.stringify(entity.reviewFlags),
        needsReview: entity.needsReview,
      },
    })
    entityDbIds.set(entity.id, record.id)
  }

  const documentIds = new Set(
    (
      await transaction.documento.findMany({
        where: { praticaId },
        select: { id: true },
      })
    ).map(document => document.id),
  )

  const occurrencesByEntity = new Map<string, SaveGenericEntitiesPayload['occurrences']>()
  for (const occurrence of payload.occurrences) {
    const list = occurrencesByEntity.get(occurrence.entityKey) ?? []
    list.push(occurrence)
    occurrencesByEntity.set(occurrence.entityKey, list)
  }

  const clientOccurrenceToServerId = new Map<string, string>()

  for (const entity of payload.entities) {
    const entitaId = entityDbIds.get(entity.id)
    if (!entitaId) {
      throw new Error(`Entità non risolta dopo upsert: ${entity.id}`)
    }
    const entityOccurrences = occurrencesByEntity.get(entity.id) ?? []
    const fingerprints = new Set<string>()

    for (const occurrence of entityOccurrences) {
      const fingerprint = createGenericOccurrenceFingerprint({
        entityKey: occurrence.entityKey,
        docId: occurrence.docId,
        page: occurrence.page,
        snippet: occurrence.snippet,
        box: occurrence.box,
        ...(occurrence.propertyKeys !== undefined
          ? { propertyKeys: occurrence.propertyKeys }
          : {}),
      })
      fingerprints.add(fingerprint)

      const record = await transaction.occorrenzaEntitaGenerica.upsert({
        where: {
          entitaId_fingerprint: { entitaId, fingerprint },
        },
        create: {
          entitaId,
          documentoId: documentIds.has(occurrence.docId) ? occurrence.docId : null,
          sourceDocId: occurrence.docId,
          sourceDocTitle: occurrence.title,
          page: occurrence.page,
          snippet: occurrence.snippet,
          bbox: JSON.stringify(occurrence.box),
          confidence: occurrence.confidence,
          propertyKeys: JSON.stringify(occurrence.propertyKeys ?? []),
          reviewStatus: occurrence.reviewStatus,
          reviewFlags: JSON.stringify(occurrence.flags),
          needsReview: occurrence.needsReview,
          fingerprint,
        },
        update: {
          documentoId: documentIds.has(occurrence.docId) ? occurrence.docId : null,
          sourceDocTitle: occurrence.title,
          snippet: occurrence.snippet,
          bbox: JSON.stringify(occurrence.box),
          confidence: occurrence.confidence,
          propertyKeys: JSON.stringify(occurrence.propertyKeys ?? []),
          reviewStatus: occurrence.reviewStatus,
          reviewFlags: JSON.stringify(occurrence.flags),
          needsReview: occurrence.needsReview,
        },
      })
      clientOccurrenceToServerId.set(occurrence.id, record.id)
    }

    await transaction.occorrenzaEntitaGenerica.deleteMany({
      where: {
        entitaId,
        ...(fingerprints.size > 0 ? { fingerprint: { notIn: [...fingerprints] } } : {}),
      },
    })
  }

  const retainedRelationKeys = new Set(
    payload.relations.map(relation => {
      const fromId = entityDbIds.get(relation.fromEntityId)
      const toId = entityDbIds.get(relation.toEntityId)
      if (!fromId || !toId) {
        throw new Error(
          `Relazione riferita a entità non risolte: ${relation.fromEntityId} → ${relation.toEntityId}`,
        )
      }
      return `${fromId}::${toId}::${relation.kind}`
    }),
  )

  const existingRelations = await transaction.relazioneEntitaGenerica.findMany({
    where: { praticaId },
    select: { id: true, fromEntityId: true, toEntityId: true, kind: true },
  })
  const relationIdsToDelete = existingRelations
    .filter(relation => {
      const key = `${relation.fromEntityId}::${relation.toEntityId}::${relation.kind}`
      return !retainedRelationKeys.has(key)
    })
    .map(relation => relation.id)
  if (relationIdsToDelete.length > 0) {
    await transaction.relazioneEntitaGenerica.deleteMany({
      where: { id: { in: relationIdsToDelete } },
    })
  }

  for (const relation of payload.relations) {
    const fromEntityId = entityDbIds.get(relation.fromEntityId)
    const toEntityId = entityDbIds.get(relation.toEntityId)
    if (!fromEntityId || !toEntityId) {
      throw new Error(
        `Relazione riferita a entità sconosciute: ${relation.fromEntityId} → ${relation.toEntityId}`,
      )
    }

    const evidenceOccurrenceIds = relation.evidenceOccurrenceIds.map(clientId => {
      const serverId = clientOccurrenceToServerId.get(clientId)
      if (!serverId) {
        throw new Error(`Evidenza occorrenza non risolvibile: ${clientId}`)
      }
      return serverId
    })

    await transaction.relazioneEntitaGenerica.upsert({
      where: {
        praticaId_fromEntityId_toEntityId_kind: {
          praticaId,
          fromEntityId,
          toEntityId,
          kind: relation.kind,
        },
      },
      create: {
        praticaId,
        fromEntityId,
        toEntityId,
        kind: relation.kind,
        confidence: relation.confidence,
        evidenceOccurrenceIds: JSON.stringify(evidenceOccurrenceIds),
      },
      update: {
        confidence: relation.confidence,
        evidenceOccurrenceIds: JSON.stringify(evidenceOccurrenceIds),
      },
    })
  }
}
