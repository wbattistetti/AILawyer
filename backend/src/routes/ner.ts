/**
 * Proxy Fastify practice-aware verso il microservizio NER locale.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import {
  nerReviewItemSchema,
  reviewSnippetsWithNer,
} from '../services/ner-snippet-client.js'

const requestSchema = z.object({
  praticaId: z.string().min(1).max(100),
  items: z.array(nerReviewItemSchema).min(1).max(500),
}).superRefine((value, context) => {
  const ids = new Set<string>()
  value.items.forEach((item, index) => {
    if (ids.has(item.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'id'],
        message: 'ID candidato duplicato',
      })
    }
    ids.add(item.id)
  })
})

/** Registra l'unico endpoint batch NER usato dalla pipeline entità. */
export async function nerRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: unknown }>('/ner/review-snippets', async (request, reply) => {
    try {
      const body = requestSchema.parse(request.body)
      const exists = await prisma.pratica.count({ where: { id: body.praticaId } })
      if (!exists) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      const controller = new AbortController()
      const abort = () => controller.abort()
      request.raw.once('aborted', abort)
      try {
        return await reviewSnippetsWithNer(body.items, controller.signal)
      } finally {
        request.raw.removeListener('aborted', abort)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Payload NER non valido',
          details: error.errors,
        })
      }
      const message = error instanceof Error ? error.message : String(error)
      const status = message.includes('timeout') ? 504 : 503
      return reply.status(status).send({
        error: 'Servizio NER locale non disponibile',
        details: message,
      })
    }
  })
}
