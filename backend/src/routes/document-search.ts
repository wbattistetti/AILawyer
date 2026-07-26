/**
 * Endpoint del sottosistema unificato di contenuto e ricerca documentale.
 */

import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  DocumentContentNotFoundError,
  DocumentTextUnavailableError,
  resolveSearchableDocument,
  type DocumentLocator
} from '../services/document-content-resolver.js'
import { searchDocumentContent } from '../services/document-search-service.js'
import { searchPracticeArchive } from '../services/practice-archive-search.js'

const locatorSchema = z.object({
  docId: z.string().trim().min(1),
  hash: z.string().trim().min(1).optional(),
  storageKey: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional()
})

const searchQuerySchema = locatorSchema.extend({
  q: z.string().trim().min(1)
})

const pageQuerySchema = locatorSchema.extend({
  page: z.coerce.number().int().positive()
})

const archiveLocatorSchema = z.object({
  id: z.string().trim().min(1),
  hash: z.string().trim().min(1).optional(),
  storageKey: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional()
})

const archiveBodySchema = z.object({
  q: z.string().trim().min(1),
  praticaId: z.string().trim().min(1),
  docs: z.array(archiveLocatorSchema).optional()
})

const toLocator = (input: z.infer<typeof locatorSchema>): DocumentLocator => ({
  id: input.docId,
  ...(input.hash ? { hash: input.hash } : {}),
  ...(input.storageKey ? { storageKey: input.storageKey } : {}),
  ...(input.filename ? { filename: input.filename } : {})
})

const sendResolutionError = (
  reply: FastifyReply,
  error: unknown
) => {
  if (error instanceof DocumentContentNotFoundError) {
    return reply.status(404).send({ error: error.message })
  }
  if (error instanceof DocumentTextUnavailableError) {
    return reply.status(409).send({ error: error.message })
  }
  throw error
}

export async function documentSearchRoutes(fastify: FastifyInstance) {
  fastify.get('/search/document', async (request, reply) => {
    try {
      const input = searchQuerySchema.parse(request.query)
      const content = await resolveSearchableDocument(toLocator(input))
      const matches = searchDocumentContent(content, input.q)
      return reply.send({
        matches,
        document: {
          id: content.requestedId,
          canonicalId: content.canonicalId,
          source: content.source,
          pages: content.pages.length
        }
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Parametri di ricerca non validi', details: error.errors })
      }
      return sendResolutionError(reply, error)
    }
  })

  /**
   * Ricerca globale pratica: stesso motore di /search/document (OCR locale + DB + nativo).
   */
  fastify.post('/search/archive', async (request, reply) => {
    try {
      const input = archiveBodySchema.parse(request.body ?? {})
      const matches = await searchPracticeArchive({
        praticaId: input.praticaId,
        query: input.q,
        locators: input.docs
      })
      return reply.send({
        query: input.q,
        praticaId: input.praticaId,
        total: matches.length,
        matches
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Parametri ricerca globale non validi', details: error.errors })
      }
      throw error
    }
  })

  fastify.get('/document-content/page', async (request, reply) => {
    try {
      const input = pageQuerySchema.parse(request.query)
      const content = await resolveSearchableDocument(toLocator(input))
      const text = content.pages[input.page - 1]
      if (text === undefined) {
        return reply.status(404).send({ error: `Pagina ${input.page} non disponibile` })
      }
      return reply.send({ page: input.page, text })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Parametri pagina non validi', details: error.errors })
      }
      return sendResolutionError(reply, error)
    }
  })
}
