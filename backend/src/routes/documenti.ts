import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { getOcrQueue } from '../lib/queue.js'
import { config } from '../config/index.js'
import { storageService } from '../lib/storage.js'
import { DocumentoCreateInput } from '../types/index.js'
import crypto from 'crypto'

const documentoCreateSchema = z.object({
  praticaId: z.string(),
  compartoId: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number(),
  s3Key: z.string(),
  hash: z.string().optional(),
  ocrStatus: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const documentoUpdateSchema = z.object({
  compartoId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ocrStatus: z.string().optional(),
  ocrText: z.string().optional(),
  ocrConfidence: z.number().optional(),
  classConfidence: z.number().optional(),
  classWhy: z.string().optional(),
})

export async function documentiRoutes(fastify: FastifyInstance) {
  // Create documento
  fastify.post<{ Body: DocumentoCreateInput }>('/documenti', async (request, reply) => {
    try {
      const data = documentoCreateSchema.parse(request.body)
      
      // Generate hash from file content
      const buf = await storageService.getObject(data.s3Key)
      const hash = crypto.createHash('sha256').update(buf).digest('hex')
      
      const documento = await prisma.documento.create({
        data: {
          ...data,
          hash,
          ocrStatus: data.ocrStatus || 'pending',
          tags: JSON.stringify(data.tags || []),
        },
      })

      // Fire-and-forget: build PDF thumbnail if applicable
      try {
        if (data.mime.startsWith('application/pdf') || data.filename.toLowerCase().endsWith('.pdf')) {
          const base = process.env.VITE_API_URL ? process.env.VITE_API_URL.replace(/\/$/, '') : `http://localhost:${config.PORT}`
          fetch(`${base}/thumb/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash, s3Key: data.s3Key, mime: data.mime }),
          }).catch(() => {})
        }
      } catch {}

      return documento
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nella creazione del documento' })
    }
  })

  // Get documento
  fastify.get<{ Params: { id: string } }>('/documenti/:id', async (request, reply) => {
    try {
      const documento = await prisma.documento.findUnique({
        where: { id: request.params.id },
      })

      if (!documento) {
        return reply.status(404).send({ error: 'Documento non trovato' })
      }

      const normalized: any = {
        ...documento,
        tags: typeof (documento as any).tags === 'string' ? (() => { try { return JSON.parse((documento as any).tags) } catch { return [] } })() : (documento as any).tags,
        ocrLayout: typeof (documento as any).ocrLayout === 'string' ? (() => { try { return JSON.parse((documento as any).ocrLayout) } catch { return undefined } })() : (documento as any).ocrLayout,
      }

      return normalized
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero del documento' })
    }
  })

  // Update documento
  fastify.patch<{ 
    Params: { id: string }
    Body: Partial<DocumentoCreateInput>
  }>('/documenti/:id', async (request, reply) => {
    try {
      const parsed = documentoUpdateSchema.parse(request.body)
      const data = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      )
      const documento = await prisma.documento.update({
        where: { id: request.params.id },
        data: data as any,
      })
      return documento
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nell\'aggiornamento del documento' })
    }
  })

  // Queue OCR for documento
  fastify.post<{ Params: { id: string } }>('/documenti/:id/queue-ocr', async (request, reply) => {
    try {
      const documento = await prisma.documento.findUnique({
        where: { id: request.params.id },
      })

      if (!documento) {
        return reply.status(404).send({ error: 'Documento non trovato' })
      }

      // Create job record
      const job = await prisma.job.create({
        data: {
          type: 'OCR',
          documentId: documento.id,
          status: 'pending',
          progress: 0,
        },
      })

      if (config.ENABLE_QUEUE) {
        const ocrQueue = getOcrQueue()
        await ocrQueue.add('process-ocr', { documentId: documento.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime }, { jobId: job.id })
      } else {
        // Run OCR asynchronously in dev and return immediately the job id
        const { ocrService } = await import('../services/ocr.js')
        ;(async () => {
          let last = 0
          const start = Date.now()
          try {
            fastify.log.info({ msg: 'OCR inline start', jobId: job.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime })
            const result = await ocrService.extract(documento.s3Key, async (p, meta) => {
              const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
              if (percent - last >= 5) {
                last = percent
                const elapsedMs = Date.now() - start
                await prisma.job.update({ where: { id: job.id }, data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) } })
                fastify.log.info({ msg: 'OCR progress', jobId: job.id, progress: percent, meta })
              }
            })
      await prisma.documento.update({
        where: { id: documento.id },
              data: {
                ocrStatus: 'completed',
                // join per pagina con page break form-feed per UI paginata
                ocrText: result.pages.map(p => p.text).join('\n\f\n'),
                ocrConfidence: result.avgConfidence,
                ocrLayout: JSON.stringify(result.layout),
                ...(Array.isArray((result as any).pages) && (result as any).pages.ocrPdfKey ? { ocrPdfKey: (result as any).pages.ocrPdfKey } : {}),
              },
            })
            await prisma.job.update({ where: { id: job.id }, data: { status: 'completed', progress: 100, result: JSON.stringify({ ok: true }) } })
            fastify.log.info({ msg: 'OCR inline finished', jobId: job.id })
          } catch (e: any) {
            const message = e?.message || 'OCR error'
            await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: message } })
            fastify.log.error({ msg: 'OCR inline failed', jobId: job.id, err: message })
          }
        })()
      }

      // Update document status immediately
      await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'processing' } })

      return job
    } catch (error) {
      const message = (error as any)?.message || 'Errore sconosciuto'
      fastify.log.error({ msg: 'queue-ocr failed', err: message })
      return reply.status(500).send({ error: 'Errore nell\'avvio del processo OCR', details: message })
    }
  })
}