import { FastifyInstance } from 'fastify'
import fs from 'fs'
import { buildPdfThumbFromBuffer, getThumbPath } from '../lib/thumbs.js'
import { storageService } from '../lib/storage.js'

export async function thumbsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { hash: string } }>('/thumb/:hash.png', async (request, reply) => {
    try {
      const out = getThumbPath(request.params.hash, 'png')
      if (!fs.existsSync(out)) return reply.status(404).send({ error: 'Thumb not found' })
      return reply.type('image/png').send(fs.createReadStream(out))
    } catch (e: any) {
      fastify.log.error(e)
      return reply.status(400).send({ error: e?.message || 'Invalid hash' })
    }
  })

  fastify.post<{ Body: { hash: string; s3Key: string; mime: string } }>('/thumb/build', async (request, reply) => {
    const { hash, s3Key, mime } = request.body as any
    try {
      const out = getThumbPath(hash, 'png')
      if (fs.existsSync(out)) return reply.status(200).send({ ok: true, cached: true })

      const buf = await storageService.getObject(s3Key)
      if (mime.startsWith('application/pdf') || s3Key.toLowerCase().endsWith('.pdf')) {
        await buildPdfThumbFromBuffer(buf, out)
        return reply.status(201).send({ ok: true, built: true })
      }
      return reply.status(415).send({ error: 'Unsupported mime for thumb', mime })
    } catch (e: any) {
      fastify.log.error(e)
      return reply.status(500).send({ error: 'Thumb build failed', details: e?.message })
    }
  })
}


