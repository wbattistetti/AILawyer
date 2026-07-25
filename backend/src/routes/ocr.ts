import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import { prisma } from '../lib/database.js'
import { config } from '../config/index.js'
import { getOcrQueue } from '../lib/queue.js'
import { reconstructTextFromGeometry } from '../services/ocr-poppler.js'
import {
    getLocalOcrResultByPrefix,
    localOcrProgress
} from '../services/local-ocr-store.js'

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

    // Endpoint per ottenere il testo OCR di un file locale (usando hash prefix)
    fastify.get<{ Params: { hashPrefix: string } }>('/ocr/get-local-text/:hashPrefix', async (request, reply) => {
        const hashPrefix = decodeURIComponent(request.params.hashPrefix)
        fastify.log.debug({ msg: 'Get local OCR text requested', hashPrefix })

        const result = getLocalOcrResultByPrefix(hashPrefix)

        if (!result) {
            fastify.log.warn({ msg: 'OCR result not found', hashPrefix, availableKeys: Array.from(localOcrProgress.keys()).slice(0, 5) })
            return reply.status(404).send({ error: 'OCR non trovato', hashPrefix })
        }

        if (result.status !== 'completed' || !result.texts || result.texts.length === 0) {
            fastify.log.warn({ msg: 'OCR not completed or no text', hashPrefix, status: result.status, hasTexts: !!result.texts })
            return reply.status(404).send({ error: 'OCR non completato o testo non disponibile', hashPrefix, status: result.status })
        }

        fastify.log.debug({ msg: 'OCR text returned', hashPrefix, pages: result.texts.length })
        return reply.status(200).send({
            texts: result.texts,
            layout: result.layout,
            s3Key: result.s3Key,
            status: result.status
        })
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

    // ✅ Endpoint per OCR su immagine singola (base64 data URL)
    fastify.post<{ Body: { imageDataUrl: string } }>('/ocr/recognize-image', async (request, reply) => {
        try {
            const { imageDataUrl } = request.body as { imageDataUrl: string }

            if (!imageDataUrl || typeof imageDataUrl !== 'string') {
                return reply.status(400).send({ error: 'imageDataUrl richiesto (base64 data URL)' })
            }

            // Verifica che sia un data URL valido
            if (!imageDataUrl.startsWith('data:image/')) {
                return reply.status(400).send({ error: 'imageDataUrl deve essere un data URL valido (data:image/...)' })
            }

            fastify.log.info({ msg: 'OCR recognize-image request', imageSize: imageDataUrl.length })

            // Estrai base64 dal data URL
            const base64Data = imageDataUrl.split(',')[1]
            if (!base64Data) {
                return reply.status(400).send({ error: 'Data URL non valido' })
            }

            // Converti base64 in Buffer
            const imageBuffer = Buffer.from(base64Data, 'base64')

            // Per immagini singole, creiamo un worker temporaneo
            const { createWorker } = await import('tesseract.js')

            // Configura tessdata locale (stessa logica del servizio OCR)
            const tessdataLocalDir = path.resolve(process.cwd(), 'tessdata')
            if (!fs.existsSync(tessdataLocalDir)) fs.mkdirSync(tessdataLocalDir, { recursive: true })

            const langCode = 'ita'
            const trainedFile = path.join(tessdataLocalDir, `${langCode}.traineddata`)
            const gzFile = path.join(tessdataLocalDir, `${langCode}.traineddata.gz`)

            // Assicura che il modello sia disponibile (stessa logica del servizio OCR)
            if (!fs.existsSync(gzFile)) {
                if (!fs.existsSync(trainedFile)) {
                    const url = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${langCode}.traineddata`
                    fastify.log.info({ msg: 'Downloading traineddata', url })
                    const res = await fetch(url)
                    if (!res.ok) throw new Error(`Failed to download traineddata: ${res.status} ${res.statusText}`)
                    const arrBuf = await res.arrayBuffer()
                    await fs.promises.writeFile(trainedFile, Buffer.from(arrBuf))
                }
                const { gzipSync } = await import('zlib')
                const raw = await fs.promises.readFile(trainedFile)
                const gz = gzipSync(raw)
                await fs.promises.writeFile(gzFile, gz)
            }

            // Crea worker e fa OCR
            const worker = await createWorker({
                langPath: tessdataLocalDir,
                cacheMethod: 'none',
            })

            const langs = config.OCR_LANG || 'ita'
            await worker.loadLanguage(langs)
            await worker.initialize(langs)
            await worker.setParameters({
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
            } as any)

            const { data: { text, confidence, words } } = await worker.recognize(imageBuffer)
            await worker.terminate()

            // ✅ Estrai dimensioni immagine dal buffer per normalizzazione coordinate
            // Prova con sharp, altrimenti usa fallback
            let imageWidth = 0
            let imageHeight = 0
            try {
                const sharp = await import('sharp')
                const metadata = await sharp.default(imageBuffer).metadata()
                imageWidth = metadata.width || 0
                imageHeight = metadata.height || 0
            } catch (err) {
                // Fallback: calcola dimensioni dai bounding box delle parole
                if (words && Array.isArray(words) && words.length > 0) {
                    let maxX = 0
                    let maxY = 0
                    for (const word of words) {
                        const x1 = word.bbox?.x1 ?? (word.bbox?.x != null && word.bbox?.w != null ? word.bbox.x + word.bbox.w : 0)
                        const y1 = word.bbox?.y1 ?? (word.bbox?.y != null && word.bbox?.h != null ? word.bbox.y + word.bbox.h : 0)
                        maxX = Math.max(maxX, x1)
                        maxY = Math.max(maxY, y1)
                    }
                    imageWidth = maxX || 0
                    imageHeight = maxY || 0
                }
                fastify.log.debug({ msg: 'Image dimensions from bbox fallback', imageWidth, imageHeight })
            }

            // ✅ Processa words per includere startIndex/endIndex
            // Ordina le parole per posizione (top-to-bottom, left-to-right)
            const sortedWords = (words || []).slice().sort((a: any, b: any) => {
                const ay0 = a.bbox?.y0 ?? a.bbox?.y ?? 0
                const by0 = b.bbox?.y0 ?? b.bbox?.y ?? 0
                const ax0 = a.bbox?.x0 ?? a.bbox?.x ?? 0
                const bx0 = b.bbox?.x0 ?? b.bbox?.x ?? 0
                // Prima per Y (riga), poi per X (colonna)
                if (Math.abs(ay0 - by0) > 5) return ay0 - by0 // Tolleranza 5px per stessa riga
                return ax0 - bx0
            })

            const processedWords: Array<{
                text: string
                bbox: { x0: number; y0: number; x1: number; y1: number }
                startIndex: number
                endIndex: number
            }> = []

            let currentIndex = 0
            const fullText = text.trim()

            // ✅ Ricostruisci testo dalle parole ordinate e mappa indici
            const reconstructedText: string[] = []
            for (const word of sortedWords) {
                const wordText = String(word.text || '').trim()
                if (!wordText) continue

                const x0 = word.bbox?.x0 ?? word.bbox?.x ?? 0
                const y0 = word.bbox?.y0 ?? word.bbox?.y ?? 0
                const x1 = word.bbox?.x1 ?? (word.bbox?.x != null && word.bbox?.w != null ? word.bbox.x + word.bbox.w : x0)
                const y1 = word.bbox?.y1 ?? (word.bbox?.y != null && word.bbox?.h != null ? word.bbox.y + word.bbox.h : y0)

                // Aggiungi spazio prima se non è la prima parola
                if (reconstructedText.length > 0) {
                    reconstructedText.push(' ')
                    currentIndex++
                }

                const startIndex = currentIndex
                reconstructedText.push(wordText)
                currentIndex += wordText.length
                const endIndex = currentIndex

                processedWords.push({
                    text: wordText,
                    bbox: { x0, y0, x1, y1 },
                    startIndex,
                    endIndex,
                })
            }

            fastify.log.info({
                msg: 'OCR recognize-image completed',
                textLength: fullText.length,
                wordsCount: processedWords.length,
                confidence,
                imageWidth,
                imageHeight
            })

            return reply.status(200).send({
                text: fullText,
                words: processedWords,
                confidence: confidence || 0,
                imageWidth,
                imageHeight,
            })
        } catch (error: any) {
            fastify.log.error({
                msg: 'OCR recognize-image error',
                error: error?.message || String(error),
                stack: error?.stack,
            })
            return reply.status(500).send({
                error: 'Errore durante OCR dell\'immagine',
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

