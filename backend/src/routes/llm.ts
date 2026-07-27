/**
 * API Fastify per catalogo Groq, legal-review e costi LLM practice-scoped.
 */

import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import {
  clearPracticeAiCalls,
  listPracticeAiCalls,
  summarizeAiCalls,
} from '../services/llm/ai-call-log.js'
import {
  isGroqConfigured,
  listGroqModels,
} from '../services/llm/groq-client.js'
import {
  legalReviewRequestSchema,
  reviewLegalEntity,
} from '../services/llm/legal-review.js'
import {
  getExchangeRateSnapshot,
  getGroqModelPricing,
  listGroqPricing,
} from '../services/llm/pricing.js'

const praticaParamsSchema = z.object({ praticaId: z.string().min(1) })

/** Registra le route del gateway LLM senza mai esporre la API key. */
export async function llmRoutes(fastify: FastifyInstance) {
  fastify.get('/llm/status', async () => ({
    provider: 'groq',
    configured: isGroqConfigured(),
  }))

  fastify.get('/llm/models', async (_request, reply) => {
    if (!isGroqConfigured()) {
      return reply.status(503).send({
        error: 'GROQ_API_KEY non configurata nel processo backend',
      })
    }
    try {
      const models = await listGroqModels()
      return {
        provider: 'groq',
        models: models.map(model => ({
          ...model,
          pricing: getGroqModelPricing(model.id),
        })),
        verifiedPricing: listGroqPricing(),
      }
    } catch (error) {
      return sendGatewayError(reply, error)
    }
  })

  fastify.get('/llm/exchange-rate', async (_request, reply) => {
    try {
      return await getExchangeRateSnapshot()
    } catch (error) {
      return sendGatewayError(reply, error)
    }
  })

  fastify.post<{ Body: unknown }>('/llm/legal-review', async (request, reply) => {
    try {
      const body = legalReviewRequestSchema.parse(request.body)
      const exists = await prisma.pratica.count({ where: { id: body.praticaId } })
      if (!exists) {
        return reply.status(404).send({ error: 'Pratica non trovata' })
      }

      const abortController = new AbortController()
      const abort = () => abortController.abort()
      request.raw.once('aborted', abort)
      try {
        return await reviewLegalEntity(body, abortController.signal)
      } finally {
        request.raw.removeListener('aborted', abort)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Payload legal-review non valido',
          details: error.errors,
        })
      }
      return sendGatewayError(reply, error)
    }
  })

  fastify.get<{ Params: { praticaId: string } }>(
    '/pratiche/:praticaId/ai-costs',
    async (request, reply) => {
      try {
        const { praticaId } = praticaParamsSchema.parse(request.params)
        const calls = await listPracticeAiCalls(praticaId)
        return {
          calls: calls.map(call => ({
            ...call,
            totalTokens: call.inputTokens + call.outputTokens,
            createdAt: call.createdAt.toISOString(),
          })),
          summary: summarizeAiCalls(calls),
          updatedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'praticaId non valido' })
        }
        return sendGatewayError(reply, error)
      }
    },
  )

  fastify.delete<{ Params: { praticaId: string } }>(
    '/pratiche/:praticaId/ai-costs',
    async (request, reply) => {
      try {
        const { praticaId } = praticaParamsSchema.parse(request.params)
        const count = await clearPracticeAiCalls(praticaId)
        return { ok: true, count }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'praticaId non valido' })
        }
        return sendGatewayError(reply, error)
      }
    },
  )
}

function sendGatewayError(
  reply: FastifyReply,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error)
  const status =
    message.includes('GROQ_API_KEY')
      ? 503
      : message.includes('not available') || message.includes('Invalid Groq model')
        ? 400
        : 502
  return reply.status(status).send({
    error: 'Gateway LLM fallito',
    details: message,
  })
}
