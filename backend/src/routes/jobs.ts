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

  // Cancel job (soft-cancel: mark and signal workers)
  fastify.post<{ Params: { id: string } }>('/jobs/:id/cancel', async (request, reply) => {
    try {
      const job = await prisma.job.findUnique({ where: { id: request.params.id } })
      if (!job) return reply.status(404).send({ error: 'Job non trovato' })

      // Mark as cancelling in DB immediately (UI feedback)
      try { await prisma.job.update({ where: { id: job.id }, data: { status: 'cancelling' } }) } catch {}
      try { fastify.log.info({ msg: '[CANCEL][req]', jobId: job.id, documentId: job.documentId }) } catch {}

      // Signal cancel without Redis: memory registry
      try { (globalThis as any).__CANCEL_FLAGS = (globalThis as any).__CANCEL_FLAGS || new Set<string>(); (globalThis as any).__CANCEL_FLAGS.add(String(job.id)); } catch {}
      try { fastify.log.info({ msg: '[CANCEL][signal][mem]', jobId: job.id }) } catch {}

      // If queue mode is enabled, best-effort removal from waiting queue
      if (String(process.env.ENABLE_QUEUE).toLowerCase() === 'true') {
        try {
          const { getOcrQueue } = await import('../lib/queue.js')
          const q = getOcrQueue()
          const bq = await q.getJob(job.id)
          if (bq && (await bq.getState()) === 'waiting') {
            await bq.remove()
            await prisma.job.update({ where: { id: job.id }, data: { status: 'cancelled', progress: 0 } })
            try { fastify.log.info({ msg: '[CANCEL][removed-waiting]', jobId: job.id }) } catch {}
          }
        } catch {}
      }

      return { ok: true }
    } catch (error) {
      try { fastify.log.error({ msg: '[CANCEL][route][fatal]', error: (error as any)?.message || String(error) }) } catch {}
      // Non bloccare la UI: rispondi comunque ok
      return { ok: false }
    }
  })
}