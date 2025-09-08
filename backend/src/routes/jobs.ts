import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/database.js'

export async function jobsRoutes(fastify: FastifyInstance) {
  // Get job status
  fastify.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: request.params.id },
      })

      if (!job) {
        return reply.status(404).send({ error: 'Job non trovato' })
      }

      return job
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero del job' })
    }
  })
}