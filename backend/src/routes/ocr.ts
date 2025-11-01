import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import { prisma } from '../lib/database.js'
import { config } from '../config/index.js'
import { getOcrQueue } from '../lib/queue.js'
import { reconstructTextFromGeometry } from '../services/ocr-poppler.js'

// Stato OCR in memoria per file locali (non persistito nel database)
// Map: s3Key -> { progress, status, result?, error? }
const localOcrProgress = new Map<string, { progress: number; status: string; result?: any; error?: string }>()

// Funzione per ottenere il risultato OCR di un file locale (per ricerca e altre operazioni)
export function getLocalOcrResult(s3Key: string): { texts?: string[], layout?: any[], status: string, progress: number } | null {
    const progress = localOcrProgress.get(s3Key)
    if (!progress || progress.status !== 'completed' || !progress.result) {
        return null
    }

    const result = progress.result
    return {
        texts: result.texts || [],
        layout: result.layout || [],
        status: progress.status,
        progress: progress.progress
    }
}

const ocrProcessLocalSchema = z.object({
    s3Key: z.string(),
    filename: z.string(),
    mime: z.string().optional(),
    mode: z.enum(['quick', 'full']).optional().default('full'),
    limitPages: z.number().optional(),
    praticaId: z.string().optional(),
    compartoId: z.string().optional(),
})

// Sanitizza il nome del file per Windows (rimuove caratteri non validi: < > : " | ? * \)
function sanitizeFileName(key: string): string {
    return key.replace(/[:<>"|?*\\]/g, '_')
}

// Processa OCR direttamente senza creare Job nel database (per file locali)
async function processOcrDirect(
    fastify: FastifyInstance,
    s3Key: string,
    filename: string,
    mime: string,
    mode: 'quick' | 'full',
    limit: number
) {
    let last = 0
    const start = Date.now()
    try {
        const sanitizedKey = sanitizeFileName(s3Key)
        fastify.log.info({
            msg: 'OCR direct start (local file, no DB job)',
            s3Key,
            sanitizedKey,
            filename,
            mime,
            limitPages: limit || undefined
        })

        const prevQuick = process.env.OCR_QUICK_MODE
        const prevLimit = process.env.OCR_LIMIT_PAGES
        if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'
        else process.env.OCR_QUICK_MODE = 'false'
        if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)

        // Import OCR service
        const { ocrService } = await import('../services/ocr.js')

        // Process OCR usando la chiave sanitizzata per file locali
        const keyToUse = s3Key.startsWith('local:') ? sanitizedKey : s3Key
        const result = await ocrService.extract(keyToUse, async (p, meta) => {
            const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
            if (percent - last >= 5) {
                last = percent
                const elapsedMs = Date.now() - start
                // Aggiorna stato in memoria (non nel database)
                localOcrProgress.set(s3Key, {
                    progress: percent,
                    status: 'processing',
                    result: { meta, elapsedMs }
                })
                fastify.log.info({ msg: 'OCR progress (in-memory)', s3Key, progress: percent, meta })
            }
            // Check cancel
            try {
                const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined
                if (mem && mem.has(s3Key)) {
                    throw new Error('CANCELLED')
                }
            } catch { }
        })

        // Restore env
        process.env.OCR_QUICK_MODE = prevQuick
        process.env.OCR_LIMIT_PAGES = prevLimit

        // Process results
        const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
        const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
        const wordsPerPage = layoutArr.map((l: any) => (Array.isArray(l?.words) ? l.words.length : 0))
        const texts = pagesArr.map((p: any, i: number) => {
            let t = typeof p?.text === 'string' ? p.text : ''
            if (!t || !t.trim()) {
                const lay = layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i]
                if (lay && Array.isArray(lay.words) && lay.words.length) {
                    // ✅ Usa ricostruzione geometrica se le coordinate sono disponibili
                    const hasCoordinates = lay.words.some((w: any) =>
                        typeof w.x0 === 'number' && typeof w.y0 === 'number' &&
                        typeof w.x1 === 'number' && typeof w.y1 === 'number' &&
                        lay.width && lay.height
                    )

                    if (hasCoordinates) {
                        try {
                            t = reconstructTextFromGeometry(
                                lay.words.map((w: any) => ({
                                    text: String(w?.text || '').trim(),
                                    x0: w.x0 || 0,
                                    y0: w.y0 || 0,
                                    x1: w.x1 || 0,
                                    y1: w.y1 || 0
                                })).filter((w: { text: string }) => w.text),
                                lay.width || 1,
                                lay.height || 1
                            )
                        } catch (geoError: any) {
                            // Fallback a join semplice se ricostruzione geometrica fallisce
                            t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                        }
                    } else {
                        // Fallback a join semplice se coordinate non disponibili
                        t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                    }
                }
            }
            return t
        })

        const elapsedMs = Date.now() - start
        const avgConfidence = pagesArr.length > 0
            ? pagesArr.reduce((sum, p) => sum + (Number(p.confidence) || 0), 0) / pagesArr.length
            : 0

        // Salva risultato completo in memoria
        const ocrResult = {
            s3Key,
            filename,
            mode,
            pages: texts.length,
            texts,
            layout: layoutArr,
            avgConfidence,
            elapsedMs,
            ocrPdfKey: (result as any).pages?.[0]?.ocrPdfKey,
        }

        localOcrProgress.set(s3Key, {
            progress: 100,
            status: 'completed',
            result: ocrResult
        })

        fastify.log.info({
            msg: 'OCR completed (in-memory)',
            s3Key,
            sanitizedKey,
            pages: texts.length,
            avgConfidence: avgConfidence.toFixed(2),
            elapsedMs,
        })

        // ✅ SEMPRE salva nel database se il documento esiste (unica logica, no doppio percorso)
        // Il testo pesa poco e deve essere persistito per la ricerca
        try {
            const documento = await prisma.documento.findFirst({
                where: { s3Key: s3Key },
                select: { id: true }
            })

            if (documento) {
                // Documento esiste nel DB: salva SEMPRE ocrText (unica logica, no distinzione memoria/DB)
                const ocrText = texts.join('\n\f\n')

                await prisma.documento.update({
                    where: { id: documento.id },
                    data: {
                        ocrStatus: 'completed',
                        ocrText,
                        ocrConfidence: avgConfidence,
                        ocrLayout: JSON.stringify(layoutArr),
                    }
                })

                fastify.log.info({
                    msg: 'OCR text saved to database (unified logic)',
                    docId: documento.id,
                    s3Key,
                    textLength: ocrText.length,
                    pages: texts.length
                })
            } else {
                fastify.log.debug({
                    msg: 'OCR completed but document not in DB (local-only, not saved in pratica)',
                    s3Key
                })
            }
        } catch (dbError: any) {
            // Non bloccare se il salvataggio DB fallisce, ma logga
            fastify.log.warn({
                msg: 'OCR completed but failed to save to DB',
                s3Key,
                error: dbError?.message
            })
        }
    } catch (error: any) {
        const isCancelled = String(error?.message || '').includes('CANCELLED')
        if (isCancelled) {
            fastify.log.info({ msg: 'OCR cancelled (in-memory)', s3Key })
            localOcrProgress.set(s3Key, { progress: 0, status: 'cancelled' })
            return
        }

        fastify.log.error({ msg: 'OCR failed (in-memory)', s3Key, error: error?.message || error })
        localOcrProgress.set(s3Key, {
            progress: 0,
            status: 'failed',
            error: error?.message || 'Errore sconosciuto'
        })
    }
}

export async function ocrRoutes(fastify: FastifyInstance) {
    // Endpoint per ottenere il progresso OCR in memoria (per file locali)
    fastify.get<{ Params: { s3Key: string } }>('/ocr/progress-local/:s3Key', async (request, reply) => {
        const s3Key = decodeURIComponent(request.params.s3Key)
        const progress = localOcrProgress.get(s3Key)

        if (!progress) {
            fastify.log.warn({ msg: 'OCR progress not found', s3Key, availableKeys: Array.from(localOcrProgress.keys()).slice(0, 5) })
            return reply.status(404).send({ error: 'OCR non trovato', s3Key })
        }

        fastify.log.debug({ msg: 'OCR progress requested', s3Key, progress: progress.progress, status: progress.status })
        return reply.status(200).send(progress)
    })

    // Endpoint per cancellare OCR in memoria
    fastify.delete<{ Params: { s3Key: string } }>('/ocr/cancel-local/:s3Key', async (request, reply) => {
        const s3Key = decodeURIComponent(request.params.s3Key)

        // Segnala cancellazione
        if (!(globalThis as any).__CANCEL_FLAGS) {
            (globalThis as any).__CANCEL_FLAGS = new Set<string>()
        }
        (globalThis as any).__CANCEL_FLAGS.add(s3Key)

        localOcrProgress.delete(s3Key)
        fastify.log.info({ msg: 'OCR cancelled (in-memory)', s3Key })

        return reply.status(200).send({ status: 'cancelled', s3Key })
    })
    // Process OCR for local file (without database record - tutto in memoria)
    fastify.post('/ocr/process-local', async (request, reply) => {
        try {
            const body = ocrProcessLocalSchema.parse(request.body)

            // Verify file exists in uploads directory
            const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
            const sanitizedKey = sanitizeFileName(body.s3Key)
            const filePath = path.join(uploadsDir, sanitizedKey)

            fastify.log.info({ msg: 'OCR process-local: checking file', s3Key: body.s3Key, uploadsDir, filePath, exists: fs.existsSync(filePath) })

            if (!fs.existsSync(filePath)) {
                const filesInUploads = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).slice(0, 10) : []
                fastify.log.warn({
                    msg: 'File not found for OCR',
                    s3Key: body.s3Key,
                    sanitizedKey,
                    filePath,
                    uploadsDir,
                    filesInUploads,
                })
                return reply.status(404).send({
                    error: 'File non trovato in uploads',
                    details: {
                        s3Key: body.s3Key,
                        sanitizedKey,
                        filePath,
                        uploadsDir,
                        note: 'In modalità privacy, il file deve essere caricato tramite upload on-demand dal frontend prima dell\'OCR.'
                    }
                })
            }

            fastify.log.info({ msg: 'OCR process-local request (in-memory)', s3Key: body.s3Key, filename: body.filename, mode: body.mode })

            const mode = body.mode || 'full'
            const limit = body.limitPages || 0

            // Inizializza stato in memoria
            localOcrProgress.set(body.s3Key, { progress: 0, status: 'processing' })

            // Processa OCR in background senza creare Job nel database
            processOcrDirect(fastify, body.s3Key, body.filename, body.mime || 'application/pdf', mode, limit).catch((error) => {
                fastify.log.error({ msg: 'OCR direct failed', s3Key: body.s3Key, error: error?.message || error })
                localOcrProgress.set(body.s3Key, {
                    progress: 0,
                    status: 'failed',
                    error: error?.message || String(error)
                })
            })

            // Restituisci immediatamente - il progresso sarà disponibile via polling
            return reply.status(202).send({
                s3Key: body.s3Key,
                status: 'processing',
                message: 'OCR avviato in memoria'
            })
        } catch (error: any) {
            fastify.log.error({
                msg: 'OCR process-local error',
                error: error?.message || String(error),
                stack: error?.stack,
                s3Key: (request.body as any)?.s3Key
            })
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Parametri non validi', details: error.errors })
            }
            return reply.status(500).send({
                error: 'Errore nell\'avvio dell\'OCR',
                details: error?.message || String(error)
            })
        }
    })
}

async function processOcrInline(
    fastify: FastifyInstance,
    jobId: string,
    s3Key: string,
    filename: string,
    mime: string,
    mode: 'quick' | 'full',
    limit: number
) {
    let last = 0
    const start = Date.now()
    try {
        // Per file locali, usa la chiave sanitizzata (come viene salvato il file)
        const sanitizedKey = sanitizeFileName(s3Key)
        fastify.log.info({
            msg: 'OCR inline start (local file)',
            jobId,
            s3Key,
            sanitizedKey,
            filename,
            mime,
            limitPages: limit || undefined
        })
            ; (process as any).env.BULLMQ_JOB_ID = jobId

        const prevQuick = process.env.OCR_QUICK_MODE
        const prevLimit = process.env.OCR_LIMIT_PAGES
        if (mode === 'quick') process.env.OCR_QUICK_MODE = 'true'
        else process.env.OCR_QUICK_MODE = 'false'
        if (limit > 0) process.env.OCR_LIMIT_PAGES = String(limit)

        // Import OCR service
        const { ocrService } = await import('../services/ocr.js')

        // Process OCR usando la chiave sanitizzata per file locali
        const keyToUse = s3Key.startsWith('local:') ? sanitizedKey : s3Key
        const result = await ocrService.extract(keyToUse, async (p, meta) => {
            const percent = Math.max(0, Math.min(100, Math.round(p * 100)))
            if (percent - last >= 5) {
                last = percent
                const elapsedMs = Date.now() - start
                try {
                    await prisma.job.update({
                        where: { id: jobId },
                        data: { progress: percent, result: JSON.stringify({ meta, elapsedMs }) },
                    })
                } catch (e: any) {
                    fastify.log.warn({ msg: 'OCR progress update failed (soft)', jobId, progress: percent, err: e?.message || String(e) })
                }
                fastify.log.info({ msg: 'OCR progress', jobId, progress: percent, meta })
            }
            // Inline cancel check
            try {
                const mem = (globalThis as any).__CANCEL_FLAGS as Set<string> | undefined
                if (mem && mem.has(String(jobId))) {
                    throw new Error('CANCELLED')
                }
            } catch { }
        })

        // Restore env
        process.env.OCR_QUICK_MODE = prevQuick
        process.env.OCR_LIMIT_PAGES = prevLimit

        // Process results
        const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
        const layoutArr: any[] = Array.isArray((result as any).layout) ? (result as any).layout : []
        const wordsPerPage = layoutArr.map((l: any) => (Array.isArray(l?.words) ? l.words.length : 0))
        const texts = pagesArr.map((p: any, i: number) => {
            let t = typeof p?.text === 'string' ? p.text : ''
            if (!t || !t.trim()) {
                const lay = layoutArr.find((l: any) => l?.page === (i + 1)) || layoutArr[i]
                if (lay && Array.isArray(lay.words) && lay.words.length) {
                    // ✅ Usa ricostruzione geometrica se le coordinate sono disponibili
                    const hasCoordinates = lay.words.some((w: any) =>
                        typeof w.x0 === 'number' && typeof w.y0 === 'number' &&
                        typeof w.x1 === 'number' && typeof w.y1 === 'number' &&
                        lay.width && lay.height
                    )

                    if (hasCoordinates) {
                        try {
                            t = reconstructTextFromGeometry(
                                lay.words.map((w: any) => ({
                                    text: String(w?.text || '').trim(),
                                    x0: w.x0 || 0,
                                    y0: w.y0 || 0,
                                    x1: w.x1 || 0,
                                    y1: w.y1 || 0
                                })).filter((w: { text: string }) => w.text),
                                lay.width || 1,
                                lay.height || 1
                            )
                        } catch (geoError: any) {
                            // Fallback a join semplice se ricostruzione geometrica fallisce
                            t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                        }
                    } else {
                        // Fallback a join semplice se coordinate non disponibili
                        t = lay.words.map((w: any) => String(w?.text || '').trim()).filter(Boolean).join(' ')
                    }
                }
            }
            return t
        })

        const elapsedMs = Date.now() - start
        const avgConfidence = pagesArr.length > 0
            ? pagesArr.reduce((sum, p) => sum + (Number(p.confidence) || 0), 0) / pagesArr.length
            : 0

        // Update job with results
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: 'completed',
                progress: 100,
                result: JSON.stringify({
                    s3Key,
                    filename,
                    mode,
                    pages: texts.length,
                    texts,
                    layout: layoutArr,
                    avgConfidence,
                    elapsedMs,
                    ocrPdfKey: (result as any).pages?.[0]?.ocrPdfKey,
                }),
            },
        })

        fastify.log.info({
            msg: 'OCR completed (local file)',
            jobId,
            s3Key,
            sanitizedKey,
            pages: texts.length,
            avgConfidence: avgConfidence.toFixed(2),
            elapsedMs,
        })
    } catch (error: any) {
        const isCancelled = String(error?.message || '').includes('CANCELLED')
        if (isCancelled) {
            fastify.log.info({ msg: 'OCR cancelled (local file)', jobId, s3Key })
            try {
                await prisma.job.update({ where: { id: jobId }, data: { status: 'cancelled' } })
            } catch { }
            return
        }

        fastify.log.error({ msg: 'OCR failed (local file)', jobId, s3Key, error: error?.message || error })
        try {
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    error: error?.message || 'Errore sconosciuto',
                },
            })
        } catch { }
        throw error
    }
}

