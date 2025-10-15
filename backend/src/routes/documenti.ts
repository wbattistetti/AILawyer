import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { getOcrQueue } from '../lib/queue.js'
import { config } from '../config/index.js'
import { storageService } from '../lib/storage.js'
import { DocumentoCreateInput } from '../types/index.js'
import crypto from 'crypto'
import fs from 'node:fs'
import path from 'node:path'

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
      
      // Canonicalizza chiave in locale per evitare duplicati: <hash>.<ext>
      let canonicalKey = data.s3Key
      try {
        if (config.STORAGE_MODE === 'local') {
          const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
          const originalPath = path.join(uploadsDir, data.s3Key)
          const ext = (path.extname(data.filename) || '').toLowerCase() || '.bin'
          const targetKey = `${hash}${ext}`
          const targetPath = path.join(uploadsDir, targetKey)
          if (fs.existsSync(originalPath)) {
            if (fs.existsSync(targetPath)) {
              if (originalPath !== targetPath) { try { fs.unlinkSync(originalPath) } catch {} }
            } else {
              try { fs.renameSync(originalPath, targetPath) } catch {}
            }
            canonicalKey = targetKey
          } else if (fs.existsSync(targetPath)) {
            canonicalKey = targetKey
          }
        }
      } catch {}

      const documento = await prisma.documento.create({
        data: {
          ...data,
          s3Key: canonicalKey,
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
  // Delete documento
  fastify.delete<{ Params: { id: string } }>(
    '/documenti/:id',
    async (request, reply) => {
      try {
        const documento = await prisma.documento.findUnique({ where: { id: request.params.id } })
        if (!documento) return reply.status(404).send({ error: 'Documento non trovato' })
        try { await storageService.deleteObject(documento.s3Key) } catch {}
        await prisma.documento.delete({ where: { id: request.params.id } })
        return { ok: true }
      } catch (error) {
        fastify.log.error(error)
        return reply.status(500).send({ error: 'Errore nella cancellazione del documento' })
      }
    }
  )

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
  fastify.post<{ Params: { id: string }, Querystring: { mode?: 'quick' | 'full', limitPages?: number } }>('/documenti/:id/queue-ocr', async (request, reply) => {
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

      const mode = (request.query.mode === 'quick') ? 'quick' : 'full'
      const limit = Number((request.query as any).limitPages || 0) || 0
      fastify.log.info({ msg: 'queue-ocr config', ENABLE_QUEUE: config.ENABLE_QUEUE, OCR_ENGINE: config.OCR_ENGINE })
      if (config.ENABLE_QUEUE) {
        try {
          const ocrQueue = getOcrQueue()
          await ocrQueue.add('process-ocr', { documentId: documento.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime, mode }, { jobId: job.id })
        } catch (e: any) {
          const message = e?.message || String(e)
          fastify.log.error({ msg: 'queue add failed, falling back to inline', err: message })
          // fallback to inline if Redis not reachable
          const { ocrService } = await import('../services/ocr.ts')
          ;(async () => {
            let last = 0
            const start = Date.now()
            try {
              fastify.log.info({ msg: 'OCR inline start (fallback)', jobId: job.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime, limitPages: limit || undefined })
              const prevQuick = process.env.OCR_QUICK_MODE
              const prevLimit = process.env.OCR_LIMIT_PAGES
              if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'; else process.env.OCR_QUICK_MODE = 'false'
              if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)
              const result = await ocrService.extract(documento.s3Key, async (p, meta) => {
                const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
                if (percent - last >= 5) {
                  last = percent
                  const elapsedMs = Date.now() - start
                  await prisma.job.update({ where: { id: job.id }, data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) } })
                  fastify.log.info({ msg: 'OCR progress', jobId: job.id, progress: percent, meta })
                }
              })
              process.env.OCR_QUICK_MODE = prevQuick
              process.env.OCR_LIMIT_PAGES = prevLimit
              try {
                const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
                const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
                const wordsPerPage = layoutArr.map((l: any) => (Array.isArray(l?.words) ? l.words.length : 0))
                const texts = pagesArr.map((p: any, i: number) => {
                  let t = (typeof p?.text === 'string' ? p.text : '')
                  if (!t || !t.trim()) {
                    const lay = (layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i])
                    if (lay && Array.isArray(lay.words) && lay.words.length) {
                      try {
                        const headWords = lay.words.slice(0, 10).map((w: any) => String(w?.text || '')).join(' ')
                        fastify.log.info({ msg: 'OCR layout words', page: i + 1, words: lay.words.length, headWords })
                      } catch {}
                      t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                    }
                  }
                  return t
                })
                // Log samples
                try {
                  const samples = texts.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                  fastify.log.info({ msg: 'OCR save samples (fallback)', samples })
                } catch {}
                let ocrText = texts.join('\n\f\n')
                let lens = texts.map(t => t.length)
                fastify.log.info({ msg: 'OCR save summary (fallback)', pages: texts.length, lens: lens.slice(0, 8).join(','), lastLens: lens.slice(-3).join(','), wordsPerPage: wordsPerPage.slice(0, 8).join(',') })
                let allEmpty = lens.every(n => n === 0)
                if (allEmpty && wordsPerPage.some(n => n > 0)) {
                  // Rebuild text solely from layout if pages[].text were empty
                  const rebuilt = layoutArr.map((lay: any) => (Array.isArray(lay?.words) ? lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ') : ''))
                  try {
                    const samples2 = rebuilt.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                    fastify.log.info({ msg: 'OCR save samples (rebuilt)', samples: samples2 })
                  } catch {}
                  ocrText = rebuilt.join('\n\f\n')
                  lens = rebuilt.map(t => t.length)
                  allEmpty = lens.every(n => n === 0)
                }
                if (allEmpty) {
                  await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'failed' } })
                  await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'OCR: nessun testo riconosciuto (controlla tessdata e DPI)' } })
                  return
                }
                await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'completed', ocrText, ocrConfidence: result.avgConfidence, ocrLayout: JSON.stringify(result.layout) } })
              } catch (e) {
                const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
                const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
                const texts = pagesArr.map((p: any, i: number) => {
                  let t = (typeof p?.text === 'string' ? p.text : '')
                  if (!t || !t.trim()) {
                    const lay = (layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i])
                    if (lay && Array.isArray(lay.words) && lay.words.length) {
                      t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                    }
                  }
                  return t
                })
                const ocrText = texts.join('\n\f\n')
                const lens = texts.map(t => t.length)
                const allEmpty = lens.every(n => n === 0)
                if (allEmpty) {
                  await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'failed' } })
                  await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'OCR: nessun testo riconosciuto (controlla tessdata e DPI)' } })
                  return
                }
                await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'completed', ocrText, ocrConfidence: result.avgConfidence, ocrLayout: JSON.stringify(result.layout) } })
              }
              await prisma.job.update({ where: { id: job.id }, data: { status: 'completed', progress: 100, result: JSON.stringify({ ok: true }) } })
              fastify.log.info({ msg: 'OCR inline finished (fallback)', jobId: job.id })
            } catch (e2: any) {
              const msg2 = e2?.message || 'OCR error'
              await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: msg2 } })
              fastify.log.error({ msg: 'OCR inline failed (fallback)', jobId: job.id, err: msg2 })
            }
          })()
        }
      } else {
        // Run OCR asynchronously in dev and return immediately the job id
        const { ocrService } = await import('../services/ocr.ts')
        ;(async () => {
          let last = 0
          const start = Date.now()
          try {
            fastify.log.info({ msg: 'OCR inline start', jobId: job.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime, limitPages: limit || undefined })
            // Toggle quick mode at process level for this run
            const prevQuick = process.env.OCR_QUICK_MODE
            const prevLimit = process.env.OCR_LIMIT_PAGES
            if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'; else process.env.OCR_QUICK_MODE = 'false'
            if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)
            const result = await ocrService.extract(documento.s3Key, async (p, meta) => {
              const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
              if (percent - last >= 5) {
                last = percent
                const elapsedMs = Date.now() - start
                await prisma.job.update({ where: { id: job.id }, data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) } })
                fastify.log.info({ msg: 'OCR progress', jobId: job.id, progress: percent, meta })
              }
            })
            // restore env
            process.env.OCR_QUICK_MODE = prevQuick
            process.env.OCR_LIMIT_PAGES = prevLimit
            try {
              const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
              const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
              const wordsPerPage = layoutArr.map((l: any) => (Array.isArray(l?.words) ? l.words.length : 0))
              const texts = pagesArr.map((p: any, i: number) => {
                let t = (typeof p?.text === 'string' ? p.text : '')
                if (!t || !t.trim()) {
                  const lay = (layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i])
                  if (lay && Array.isArray(lay.words) && lay.words.length) {
                    try {
                      const headWords = lay.words.slice(0, 10).map((w: any) => String(w?.text || '')).join(' ')
                      fastify.log.info({ msg: 'OCR layout words', page: i + 1, words: lay.words.length, headWords })
                    } catch {}
                    t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                  }
                }
                return t
              })
              try {
                const samples = texts.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                fastify.log.info({ msg: 'OCR save samples', samples })
              } catch {}
              let ocrText = texts.join('\n\f\n')
              let lens = texts.map(t => t.length)
              fastify.log.info({ msg: 'OCR save summary', pages: texts.length, lens: lens.slice(0, 8).join(','), lastLens: lens.slice(-3).join(','), wordsPerPage: wordsPerPage.slice(0, 8).join(',') })
              let allEmpty = lens.every(n => n === 0)
              if (allEmpty && wordsPerPage.some(n => n > 0)) {
                const rebuilt = layoutArr.map((lay: any) => (Array.isArray(lay?.words) ? lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ') : ''))
                try {
                  const samples2 = rebuilt.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                  fastify.log.info({ msg: 'OCR save samples (rebuilt)', samples: samples2 })
                } catch {}
                ocrText = rebuilt.join('\n\f\n')
                lens = rebuilt.map(t => t.length)
                allEmpty = lens.every(n => n === 0)
              }
              if (allEmpty) {
                await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'failed' } })
                await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'OCR: nessun testo riconosciuto (controlla tessdata e DPI)' } })
                return
              }
              await prisma.documento.update({
                where: { id: documento.id },
                data: {
                  ocrStatus: 'completed',
                  ocrText,
                  ocrConfidence: result.avgConfidence,
                  ocrLayout: JSON.stringify(result.layout),
                  ...(Array.isArray((result as any).pages) && (result as any).pages.ocrPdfKey ? { ocrPdfKey: (result as any).pages.ocrPdfKey } : {}),
                },
              })
            } catch (e) {
              const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
              const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
              const texts = pagesArr.map((p: any, i: number) => {
                let t = (typeof p?.text === 'string' ? p.text : '')
                if (!t || !t.trim()) {
                  const lay = (layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i])
                  if (lay && Array.isArray(lay.words) && lay.words.length) {
                    t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                  }
                }
                return t
              })
              const ocrText = texts.join('\n\f\n')
              const lens = texts.map(t => t.length)
              const allEmpty = lens.every(n => n === 0)
              if (allEmpty) {
                await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'failed' } })
                await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'OCR: nessun testo riconosciuto (controlla tessdata e DPI)' } })
                return
              }
              await prisma.documento.update({
                where: { id: documento.id },
                data: {
                  ocrStatus: 'completed',
                  ocrText,
                  ocrConfidence: result.avgConfidence,
                  ocrLayout: JSON.stringify(result.layout),
                },
              })
            }
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