import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/database.js'
import { getOcrQueue } from '../lib/queue.js'
import { config } from '../config/index.js'
import { storageService } from '../lib/storage.js'
import { DocumentoCreateInput } from '../types/index.js'
import { detectNativeText } from '../lib/detectNativeText.js'
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
  thumbnailDataUrl: z.string().optional(), // Base64 JPEG data URL per miniatura
  hasNativeText: z.boolean().optional(), // Flag per testo nativo (priorità su rilevamento backend)
})

const documentoUpdateSchema = z.object({
  compartoId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ocrStatus: z.string().optional(),
  ocrText: z.string().optional(),
  ocrConfidence: z.number().optional(),
  classConfidence: z.number().optional(),
  classWhy: z.string().optional(),
  thumbnailDataUrl: z.string().optional(), // Base64 JPEG data URL per miniatura
})

export async function documentiRoutes(fastify: FastifyInstance) {
  // Create documento
  fastify.post<{ Body: DocumentoCreateInput }>('/documenti', async (request, reply) => {
    try {
      const data = documentoCreateSchema.parse(request.body)

      console.log('[CREATE][DOCUMENTO][START]', {
        filename: data.filename,
        praticaId: data.praticaId,
        compartoId: data.compartoId,
        s3Key: data.s3Key,
        mime: data.mime,
        size: data.size
      })
      // Ensure compartoId is valid for the pratica; fallback to first comparto or create a default one
      let effectiveCompartoId = data.compartoId
      try {
        const comp = await prisma.comparto.findUnique({ where: { id: effectiveCompartoId } })
        if (!comp || comp.praticaId !== data.praticaId) {
          const fallback = await prisma.comparto.findFirst({ where: { praticaId: data.praticaId }, orderBy: { ordine: 'asc' } })
          if (fallback) {
            effectiveCompartoId = fallback.id
          } else {
            const created = await prisma.comparto.create({ data: { praticaId: data.praticaId, key: 'da_classificare', nome: 'Da classificare', ordine: 0 } })
            effectiveCompartoId = created.id
          }
        }
      } catch { }

      // MODALITÀ PRIVACY: Il file potrebbe non esistere ancora in uploads/ (solo blob URL in memoria)
      // Verifica se il file esiste prima di tentare di leggerlo
      let hash = '' // Hash vuoto se file non esiste (verrà generato on-demand per OCR)
      let canonicalKey = data.s3Key
      let fileExists = false

      try {
        // Sanitizza s3Key per path Windows (rimuove caratteri non validi come ':')
        const sanitizedKey = data.s3Key.replace(/[:<>"|?*\\]/g, '_')
        const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
        const sanitizedPath = path.join(uploadsDir, sanitizedKey)

        fileExists = fs.existsSync(sanitizedPath)

        console.log('[CREATE][DOCUMENTO][FILE-CHECK]', {
          s3Key: data.s3Key,
          sanitizedKey,
          sanitizedPath,
          fileExists
        })

        if (fileExists) {
          // File esiste: genera hash e canonicalizza
          const buf = await storageService.getObject(sanitizedKey)
          hash = crypto.createHash('sha256').update(buf).digest('hex')

          // Canonicalizza chiave in locale per evitare duplicati: <hash>.<ext>
          if (config.STORAGE_MODE === 'local') {
            const ext = (path.extname(data.filename) || '').toLowerCase() || '.bin'
            const targetKey = `${hash}${ext}`
            const targetPath = path.join(uploadsDir, targetKey)
            if (sanitizedPath !== targetPath) {
              if (fs.existsSync(targetPath)) {
                // File con stesso hash già esiste, elimina duplicato
                try { fs.unlinkSync(sanitizedPath) } catch { }
              } else {
                // Rinomina per usare hash come chiave
                try { fs.renameSync(sanitizedPath, targetPath) } catch { }
              }
              canonicalKey = targetKey
            } else {
              canonicalKey = sanitizedKey
            }
          } else {
            canonicalKey = sanitizedKey
          }
        } else {
          // File NON esiste (modalità privacy): usa s3Key originale, hash vuoto
          // L'hash verrà generato quando il file verrà caricato on-demand per OCR
          console.log('[CREATE][DOCUMENTO][PRIVACY-MODE]', {
            s3Key: data.s3Key,
            note: 'File non in uploads/ - modalità privacy, hash vuoto (generato on-demand per OCR)'
          })
          canonicalKey = data.s3Key // Mantieni s3Key originale (può contenere ':' - è solo un ID, non un path)
          hash = '' // Hash vuoto - verrà popolato quando file caricato per OCR
        }
      } catch (error) {
        console.error('[CREATE][DOCUMENTO][FILE-CHECK][ERROR]', {
          s3Key: data.s3Key,
          error: (error as Error).message
        })
        // Continua anche se c'è un errore - documento può essere creato senza file fisico
      }

      // ✅ Rileva se PDF ha testo nativo (solo se file esiste fisicamente)
      let hasNativeText = false
      if (fileExists) {
        try {
          const isPdf = data.mime.startsWith('application/pdf') || data.filename.toLowerCase().endsWith('.pdf')
          console.log('[UPLOAD][native-check][START]', {
            filename: data.filename,
            mime: data.mime,
            isPdf,
            fileExists
          })

          if (isPdf) {
            const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
            const sanitizedKey = canonicalKey.replace(/[:<>"|?*\\]/g, '_')
            const pdfPath = path.join(uploadsDir, sanitizedKey)

            console.log('[UPLOAD][native-check][PATH]', {
              uploadsDir,
              canonicalKey,
              sanitizedKey,
              pdfPath,
              fileExists: fs.existsSync(pdfPath)
            })

            if (fs.existsSync(pdfPath)) {
              hasNativeText = await detectNativeText(pdfPath)
              console.log('[UPLOAD][native-check][RESULT]', {
                filename: data.filename,
                hasNativeText
              })
            }
          }
        } catch (error) {
          console.error('[UPLOAD][native-check][ERROR]', {
            filename: data.filename,
            error: (error as Error).message,
            stack: (error as Error).stack
          })
        }
      } else {
        console.log('[UPLOAD][native-check][SKIP]', {
          filename: data.filename,
          note: 'File non esiste - native text detection saltata (modalità privacy)'
        })
      }

      // Check se documento già esiste (usa hash solo se disponibile)
      const whereClause: any = { s3Key: canonicalKey }
      if (hash) {
        whereClause.OR = [{ s3Key: canonicalKey }, { hash }]
      }
      const existing = await prisma.documento.findFirst({
        where: whereClause,
      })

      if (existing) {
        console.log('[UPLOAD][duplicate-found]', {
          existingId: existing.id,
          existingHasNativeText: (existing as any).hasNativeText,
          newHasNativeText: hasNativeText
        })

        // Se hasNativeText è cambiato, aggiorna il documento esistente
        if ((existing as any).hasNativeText !== hasNativeText) {
          console.log('[UPLOAD][updating-hasNativeText]', {
            id: existing.id,
            from: (existing as any).hasNativeText,
            to: hasNativeText
          })

          await prisma.documento.update({
            where: { id: existing.id },
            data: { hasNativeText }
          })

          // Rileggi il documento aggiornato
          const updated = await prisma.documento.findUnique({
            where: { id: existing.id }
          })

          const normalizedUpdated: any = {
            ...updated,
            tags: typeof (updated as any).tags === 'string' ? (() => { try { return JSON.parse((updated as any).tags) } catch { return [] } })() : (updated as any).tags,
            ocrLayout: typeof (updated as any).ocrLayout === 'string' ? (() => { try { return JSON.parse((updated as any).ocrLayout) } catch { return undefined } })() : (updated as any).ocrLayout,
          }
          return normalizedUpdated
        }

        // Nessun aggiornamento necessario, restituisci esistente
        const normalizedExisting: any = {
          ...existing,
          tags: typeof (existing as any).tags === 'string' ? (() => { try { return JSON.parse((existing as any).tags) } catch { return [] } })() : (existing as any).tags,
          ocrLayout: typeof (existing as any).ocrLayout === 'string' ? (() => { try { return JSON.parse((existing as any).ocrLayout) } catch { return undefined } })() : (existing as any).ocrLayout,
        }
        return normalizedExisting
      }

      // Nessun duplicato, crea nuovo documento
      console.log('[UPLOAD][creating-document]', {
        filename: data.filename,
        hasNativeText,
        ocrStatus: data.ocrStatus || 'pending'
      })

      let documento
      try {
        // Priorità: usa hasNativeText dal frontend se fornito, altrimenti quello rilevato dal backend
        const finalHasNativeText = data.hasNativeText !== undefined ? data.hasNativeText : hasNativeText

        console.log('🔍 [BACKEND][CREATE][HASNATIVETEXT]', {
          filename: data.filename,
          frontendHasNativeText: data.hasNativeText, // ⚠️ VALORE DAL FRONTEND
          backendDetectedHasNativeText: hasNativeText, // ⚠️ VALORE RILEVATO DAL BACKEND
          finalHasNativeText, // ⚠️ VALORE FINALE CHE VERRA' SALVATO
          hasThumbnail: !!data.thumbnailDataUrl
        })

        documento = await prisma.documento.create({
          data: {
            ...data,
            compartoId: effectiveCompartoId,
            s3Key: canonicalKey,
            hash,
            ocrStatus: data.ocrStatus || 'pending',
            hasNativeText: finalHasNativeText,
            thumbnailDataUrl: data.thumbnailDataUrl || null, // Salva thumbnail se presente
            tags: JSON.stringify(data.tags || []),
          } as any, // TODO: rimuovere quando Prisma Client sarà rigenerato
        })

        console.log('✅ [BACKEND][CREATE][SUCCESS]', {
          filename: documento.filename,
          docId: documento.id.substring(0, 20) + '...',
          hasNativeText: (documento as any).hasNativeText, // ⚠️ VALORE EFFETTIVAMENTE SALVATO NEL DB
          hasThumbnail: !!(documento as any).thumbnailDataUrl
        })
      } catch (e: any) {
        // Handle race: another request created the same s3Key just now
        const code = e?.code || ''
        if (code === 'P2002') {
          const fallback = await prisma.documento.findFirst({ where: { OR: [{ s3Key: canonicalKey }, { hash }] } })
          if (fallback) {
            const normalizedExisting: any = {
              ...fallback,
              tags: typeof (fallback as any).tags === 'string' ? (() => { try { return JSON.parse((fallback as any).tags) } catch { return [] } })() : (fallback as any).tags,
              ocrLayout: typeof (fallback as any).ocrLayout === 'string' ? (() => { try { return JSON.parse((fallback as any).ocrLayout) } catch { return undefined } })() : (fallback as any).ocrLayout,
            }
            return normalizedExisting
          }
        }
        throw e
      }

      // Fire-and-forget: build PDF thumbnail if applicable (use canonical s3Key)
      try {
        if (data.mime.startsWith('application/pdf') || data.filename.toLowerCase().endsWith('.pdf')) {
          const base = process.env.VITE_API_URL ? process.env.VITE_API_URL.replace(/\/$/, '') : `http://localhost:${config.PORT}`
          fetch(`${base}/thumb/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash, s3Key: canonicalKey, mime: data.mime }),
          }).catch(() => { })
        }
      } catch { }

      const normalizedNew: any = {
        ...documento,
        tags: typeof (documento as any).tags === 'string' ? (() => { try { return JSON.parse((documento as any).tags) } catch { return [] } })() : (documento as any).tags,
      }
      return normalizedNew
    } catch (error: any) {
      fastify.log.error(error)
      const message = error?.message || 'Errore nella creazione del documento'
      return reply.status(500).send({ error: 'Errore nella creazione del documento', details: message })
    }
  })

  // Get documento (ottimizzato: non include thumbnail per default)
  fastify.get<{ Params: { id: string }; Querystring: { includeThumbnail?: string } }>('/documenti/:id', async (request, reply) => {
    try {
      const includeThumbnail = request.query.includeThumbnail === 'true'

      const documento = await prisma.documento.findUnique({
        where: { id: request.params.id },
        select: includeThumbnail ? undefined : {
          // Escludi thumbnailDataUrl per performance (è grande ~30KB)
          id: true,
          praticaId: true,
          compartoId: true,
          filename: true,
          mime: true,
          size: true,
          s3Key: true,
          hash: true,
          ocrStatus: true,
          ocrText: true,
          ocrConfidence: true,
          ocrLayout: true,
          ocrPdfKey: true,
          hasNativeText: true,
          classConfidence: true,
          classWhy: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          // thumbnailDataUrl escluso esplicitamente
        } as any // TODO: rimuovere quando Prisma Client sarà rigenerato
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

  // Get thumbnail (lazy loading endpoint - solo thumbnail)
  fastify.get<{ Params: { id: string } }>('/documenti/:id/thumbnail', async (request, reply) => {
    try {
      const documento = await prisma.documento.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          thumbnailDataUrl: true,
          filename: true
        } as any // TODO: rimuovere quando Prisma Client sarà rigenerato
      })

      if (!documento) {
        return reply.status(404).send({ error: 'Documento non trovato' })
      }

      const docWithThumbnail = documento as any
      if (!docWithThumbnail.thumbnailDataUrl) {
        return reply.status(404).send({ error: 'Thumbnail non disponibile' })
      }

      return {
        id: documento.id,
        thumbnailDataUrl: docWithThumbnail.thumbnailDataUrl,
        filename: documento.filename
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel recupero della thumbnail' })
    }
  })

  // DIAGNOSTICA: verifica bbox parola per parola in ocrLayout
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    '/documenti/:id/layout-diagnostic',
    async (request, reply) => {
      try {
        const documento = await prisma.documento.findUnique({
          where: { id: request.params.id },
          select: { id: true, filename: true, ocrLayout: true, ocrStatus: true }
        })
        if (!documento) {
          return reply.status(404).send({ error: 'Documento non trovato' })
        }
        const layout = typeof (documento as any).ocrLayout === 'string'
          ? (() => { try { return JSON.parse((documento as any).ocrLayout) } catch { return [] } })()
          : ((documento as any).ocrLayout || [])
        const pageParam = request.query.page ? parseInt(request.query.page, 10) : undefined
        const pageIdx = pageParam != null && pageParam >= 1 ? pageParam - 1 : 0
        const pageMeta = layout[pageIdx] || {}
        const words = pageMeta.words || []
        const sample = words.slice(0, 10).map((w: any) => ({
          text: w.text,
          x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1,
          w: w.x1 - w.x0, h: w.y1 - w.y0
        }))
        return {
          docId: documento.id,
          filename: documento.filename,
          ocrStatus: documento.ocrStatus,
          totalPages: layout.length,
          requestedPage: pageIdx + 1,
          pageWidth: pageMeta.width || pageMeta.imgW || 0,
          pageHeight: pageMeta.height || pageMeta.imgH || 0,
          totalWords: words.length,
          sampleWords: sample,
          message: words.length > 0
            ? `✅ OK: trovate ${words.length} parole con bbox per pagina ${pageIdx + 1}`
            : `❌ PROBLEMA: nessuna parola con bbox per pagina ${pageIdx + 1}`
        }
      } catch (error: any) {
        fastify.log.error(error)
        return reply.status(500).send({ error: 'Errore diagnostica layout', details: error?.message })
      }
    }
  )
  // Delete documento
  fastify.delete<{ Params: { id: string } }>(
    '/documenti/:id',
    async (request, reply) => {
      try {
        const documento = await prisma.documento.findUnique({ where: { id: request.params.id } })
        if (!documento) return reply.status(404).send({ error: 'Documento non trovato' })
        try { await storageService.deleteObject(documento.s3Key) } catch { }
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
    const docId = request.params.id

    try {
      const parsed = documentoUpdateSchema.parse(request.body)
      const data: any = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      )

      // Gestisci thumbnailDataUrl separatamente
      if (parsed.thumbnailDataUrl !== undefined) {
        data.thumbnailDataUrl = parsed.thumbnailDataUrl
      }

      console.log('[UPDATE][DOCUMENTO][START]', {
        docId,
        updateData: data,
        compartoId: data.compartoId,
        hasThumbnail: !!data.thumbnailDataUrl
      })

      // Get documento corrente per vedere cosa cambia
      const oldDoc = await prisma.documento.findUnique({
        where: { id: docId }
      })

      if (oldDoc) {
        console.log('[UPDATE][DOCUMENTO][BEFORE]', {
          docId,
          oldCompartoId: oldDoc.compartoId,
          filename: oldDoc.filename,
          praticaId: oldDoc.praticaId
        })
      }

      const documento = await prisma.documento.update({
        where: { id: docId },
        data: data as any,
      })

      console.log('[UPDATE][DOCUMENTO][SUCCESS]', {
        docId,
        filename: documento.filename,
        newCompartoId: documento.compartoId,
        praticaId: documento.praticaId,
        oldCompartoId: oldDoc?.compartoId,
        compartoChanged: oldDoc && oldDoc.compartoId !== documento.compartoId
      })

      return documento
    } catch (error) {
      console.error('[UPDATE][DOCUMENTO][ERROR]', {
        docId,
        error: (error as Error).message,
        stack: (error as Error).stack
      })
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
          const { ocrService } = await import('../services/ocr.js')
            ; (async () => {
              let last = 0
              const start = Date.now()
              try {
                fastify.log.info({ msg: 'OCR inline start (fallback)', jobId: job.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime, limitPages: limit || undefined })
                  ; (process as any).env.BULLMQ_JOB_ID = job.id
                const prevQuick = process.env.OCR_QUICK_MODE
                const prevLimit = process.env.OCR_LIMIT_PAGES
                if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'; else process.env.OCR_QUICK_MODE = 'false'
                if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)
                const result = await ocrService.extract(documento.s3Key, async (p, meta) => {
                  const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
                  if (percent - last >= 5) {
                    last = percent
                    const elapsedMs = Date.now() - start
                    try {
                      await prisma.job.update({ where: { id: job.id }, data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) } })
                    } catch (e: any) {
                      fastify.log.warn({ msg: 'OCR progress update failed (soft)', jobId: job.id, progress: percent, err: e?.message || String(e) })
                    }
                    fastify.log.info({ msg: 'OCR progress', jobId: job.id, progress: percent, meta })
                  }
                  // Inline cancel check (memory registry)
                  try { const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined; if (mem && mem.has(String(job.id))) { throw new Error('CANCELLED') } } catch { }
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
                        } catch { }
                        t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                      }
                    }
                    return t
                  })
                  // Log samples
                  try {
                    const samples = texts.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                    fastify.log.info({ msg: 'OCR save samples (fallback)', samples })
                  } catch { }
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
                    } catch { }
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
                if (msg2.includes('CANCELLED')) {
                  try { await prisma.job.update({ where: { id: job.id }, data: { status: 'cancelled' } }) } catch { }
                  try { await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'cancelled' } }) } catch { }
                  fastify.log.info({ msg: 'OCR inline cancelled (fallback)', jobId: job.id })
                  return
                }
                await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: msg2 } })
                fastify.log.error({ msg: 'OCR inline failed (fallback)', jobId: job.id, err: msg2 })
              }
            })()
        }
      } else {
        // Run OCR asynchronously in dev and return immediately the job id
        const { ocrService } = await import('../services/ocr.js')
          ; (async () => {
            let last = 0
            const start = Date.now()
            try {
              fastify.log.info({ msg: 'OCR inline start', jobId: job.id, s3Key: documento.s3Key, filename: documento.filename, mime: documento.mime, limitPages: limit || undefined })
              // Toggle quick mode at process level for this run
              const prevQuick = process.env.OCR_QUICK_MODE
              const prevLimit = process.env.OCR_LIMIT_PAGES
              if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'; else process.env.OCR_QUICK_MODE = 'false'
              if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)
                ; (process as any).env.BULLMQ_JOB_ID = job.id
              const result = await ocrService.extract(documento.s3Key, async (p, meta) => {
                const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
                if (percent - last >= 5) {
                  last = percent
                  const elapsedMs = Date.now() - start
                  try {
                    await prisma.job.update({ where: { id: job.id }, data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) } })
                  } catch (e: any) {
                    fastify.log.warn({ msg: 'OCR progress update failed (soft)', jobId: job.id, progress: percent, err: e?.message || String(e) })
                  }
                  fastify.log.info({ msg: 'OCR progress', jobId: job.id, progress: percent, meta })
                }
                // Inline cancel check (memory registry)
                try { const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined; if (mem && mem.has(String(job.id))) { throw new Error('CANCELLED') } } catch { }
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
                      } catch { }
                      t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                    }
                  }
                  return t
                })
                try {
                  const samples = texts.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                  fastify.log.info({ msg: 'OCR save samples', samples })
                } catch { }
                let ocrText = texts.join('\n\f\n')
                let lens = texts.map(t => t.length)
                fastify.log.info({ msg: 'OCR save summary', pages: texts.length, lens: lens.slice(0, 8).join(','), lastLens: lens.slice(-3).join(','), wordsPerPage: wordsPerPage.slice(0, 8).join(',') })
                let allEmpty = lens.every(n => n === 0)
                if (allEmpty && wordsPerPage.some(n => n > 0)) {
                  const rebuilt = layoutArr.map((lay: any) => (Array.isArray(lay?.words) ? lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ') : ''))
                  try {
                    const samples2 = rebuilt.slice(0, 3).map((t, i) => ({ page: i + 1, len: (t || '').length, head: String(t || '').slice(0, 200).replace(/\s+/g, ' ') }))
                    fastify.log.info({ msg: 'OCR save samples (rebuilt)', samples: samples2 })
                  } catch { }
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
              if (message.includes('CANCELLED')) {
                try { await prisma.job.update({ where: { id: job.id }, data: { status: 'cancelled' } }) } catch { }
                try { await prisma.documento.update({ where: { id: documento.id }, data: { ocrStatus: 'cancelled' } }) } catch { }
                fastify.log.info({ msg: 'OCR inline cancelled', jobId: job.id })
                return
              }
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