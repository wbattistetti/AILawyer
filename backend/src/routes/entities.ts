/**
 * API REST per persistere entità generiche, occorrenze e relazioni a livello di pratica.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import {
  loadPracticeEntitiesPayload,
  syncPracticeEntitiesSnapshot,
} from '../services/generic-entity-sync.js'
import { saveGenericEntitiesSchema } from '../services/generic-entity-validation.js'

/** Registra le route REST delle entità generiche practice-scoped. */
export async function entitiesRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { praticaId: string } }>('/pratiche/:praticaId/entities', async request => {
    const praticaId = z.string().min(1).parse(request.params.praticaId)
    return loadPracticeEntitiesPayload(prisma, praticaId)
  })

  fastify.put<{ Params: { praticaId: string }; Body: unknown }>(
    '/pratiche/:praticaId/entities',
    async (request, reply) => {
      try {
        const praticaId = z.string().min(1).parse(request.params.praticaId)
        const payload = saveGenericEntitiesSchema.parse(request.body)

        for (let index = 0; index < payload.entities.length; index += 1) {
          const entity = payload.entities[index]!
          if (entity.praticaId !== undefined && entity.praticaId !== praticaId) {
            return reply.status(400).send({
              error: 'praticaId entità non coerente con il path',
              details: [{ path: ['entities', index, 'praticaId'], message: entity.praticaId }],
            })
          }
        }

        const practiceExists = await prisma.pratica.count({ where: { id: praticaId } })
        if (!practiceExists) {
          return reply.status(404).send({ error: 'Pratica non trovata' })
        }

        await prisma.$transaction(async transaction => {
          await syncPracticeEntitiesSnapshot(transaction, praticaId, payload)
        })

        return loadPracticeEntitiesPayload(prisma, praticaId)
      } catch (error: unknown) {
        fastify.log.error(error)
        if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
          const zodError = error as { errors?: unknown }
          return reply.status(400).send({
            error: 'Dati entità generiche non validi',
            details: zodError.errors,
          })
        }
        const message = error instanceof Error ? error.message : 'Errore sconosciuto'
        return reply.status(500).send({
          error: 'Salvataggio entità generiche fallito',
          details: message,
        })
      }
    },
  )

  fastify.delete<{ Params: { praticaId: string } }>('/pratiche/:praticaId/entities', async request => {
    const praticaId = z.string().min(1).parse(request.params.praticaId)
    const result = await prisma.entitaGenerica.deleteMany({ where: { praticaId } })
    return { ok: true, count: result.count }
  })
}
