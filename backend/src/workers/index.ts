import os from 'node:os'
import { Worker } from 'bullmq'
import { getRedis, OcrJobData } from '../lib/queue.js'
import { prisma } from '../lib/database.js'
import { ocrService } from '../services/ocr.js'
import { classificationService } from '../services/classification.js'
import { config } from '../config/index.js'

// OCR Worker
const ocrWorker = new Worker('ocr-processing', async (job) => {
  const { documentId, s3Key, filename } = job.data as OcrJobData

  try {
    console.log(`Starting OCR for document ${documentId}`)

    // Update job progress
    await job.updateProgress(10)

    // Update document status
    await prisma.documento.update({
      where: { id: documentId },
      data: { ocrStatus: 'processing' },
    })

    // Perform OCR
    await job.updateProgress(30)
    // Cooperative cancel: provide onProgress and check redis flag
    const redis = getRedis()
    let cancelled = false
    // Make job id visible to OCR service for per-page cancel checks
    ;(process as any).env.BULLMQ_JOB_ID = String(job.id || '')
    const ocrResult = await ocrService.extract(s3Key, async (p, meta) => {
      const flag = await redis.get(`cancel:${job.id}`)
      if (flag) { cancelled = true; console.log('[CANCEL][worker][flag-hit]', { jobId: job.id, progress: p }); throw new Error('CANCELLED') }
      await job.updateProgress(Math.max(1, Math.floor((p || 0) * 100)))
      try { await prisma.job.update({ where: { id: job.id! }, data: { progress: Math.max(1, Math.floor((p || 0) * 100)), result: JSON.stringify({ meta }) } }) } catch {}
    })

    await job.updateProgress(70)

    // Determine if OCR quality is acceptable
    const isLowConfidence = ocrResult.avgConfidence < config.OCR_CONFIDENCE_THRESHOLD
    const ocrStatus = isLowConfidence ? 'low_confidence' : 'completed'

    // Update document with OCR results
    await prisma.documento.update({
      where: { id: documentId },
      data: {
        ocrStatus,
        ocrText: ocrResult.pages.map(p => p.text).join('\n'),
        ocrConfidence: ocrResult.avgConfidence,
      },
    })

    await job.updateProgress(90)

    // If OCR quality is good, proceed with classification
    if (!isLowConfidence) {
      const text = ocrResult.pages.map(p => p.text).join('\n')
      const classResult = classificationService.classify(text, filename)

      // Only move document if classification confidence is high enough
      if (classResult.confidence >= config.CLASSIFY_CONFIDENCE_THRESHOLD) {
        // Find the target comparto
        const documento = await prisma.documento.findUnique({
          where: { id: documentId },
          include: {
            pratica: { include: { comparti: true } },
            comparto: true // ✅ Include il comparto corrente per verificare se è "da_classificare"
          },
        })

        if (documento) {
          const currentComparto = documento.comparto
          const isInDaClassificare = currentComparto?.key === 'da_classificare'

          console.log('[OCR-WORKER][CLASSIFICATION][CHECK]', {
            documentId,
            filename,
            currentCompartoKey: currentComparto?.key,
            currentCompartoId: currentComparto?.id,
            currentCompartoNome: currentComparto?.nome,
            isInDaClassificare,
            classResultCompartoKey: classResult.compartoKey,
            classConfidence: classResult.confidence,
            confidenceThreshold: config.CLASSIFY_CONFIDENCE_THRESHOLD
          })

          // ✅ SPOSTA SOLO SE è in "da_classificare" (non se l'utente l'ha già messo in un comparto specifico)
          if (isInDaClassificare) {
            console.log('[OCR-WORKER][CLASSIFICATION][MOVE] Documento in da_classificare, provo a spostarlo', {
              documentId,
              targetCompartoKey: classResult.compartoKey
            })
            const targetComparto = documento.pratica.comparti.find(c => c.key === classResult.compartoKey)

            if (targetComparto) {
              console.log('[OCR-WORKER][CLASSIFICATION][MOVE-OK] Spostando documento', {
                documentId,
                fromCompartoId: currentComparto?.id,
                fromCompartoKey: currentComparto?.key,
                toCompartoId: targetComparto.id,
                toCompartoKey: targetComparto.key,
                toCompartoNome: targetComparto.nome
              })

              await prisma.documento.update({
                where: { id: documentId },
                data: {
                  compartoId: targetComparto.id,
                  classConfidence: classResult.confidence,
                  classWhy: classResult.why,
                  tags: JSON.stringify(classResult.tags),
                },
              })

              console.log('[OCR-WORKER][CLASSIFICATION][MOVE-DONE] Documento spostato con successo', {
                documentId,
                newCompartoId: targetComparto.id
              })
            } else {
              // Target comparto non trovato, salva solo info classificazione senza spostare
              await prisma.documento.update({
                where: { id: documentId },
                data: {
                  classConfidence: classResult.confidence,
                  classWhy: classResult.why,
                  tags: JSON.stringify(classResult.tags),
                },
              })
            }
          } else {
            // ✅ Documento già in un comparto specifico (non "da_classificare")
            // Salva solo le informazioni di classificazione SENZA spostare il comparto
            console.log('[OCR-WORKER][CLASSIFICATION][KEEP] Documento già in comparto specifico, NON sposto', {
              documentId,
              filename,
              currentCompartoId: currentComparto?.id,
              currentCompartoKey: currentComparto?.key,
              currentCompartoNome: currentComparto?.nome,
              suggestedCompartoKey: classResult.compartoKey,
              classConfidence: classResult.confidence,
              nota: 'Documento rimane nel comparto assegnato dall\'utente'
            })

            await prisma.documento.update({
              where: { id: documentId },
              data: {
                classConfidence: classResult.confidence,
                classWhy: classResult.why,
                tags: JSON.stringify(classResult.tags),
              },
            })

            // ✅ Verifica che compartoId sia rimasto invariato
            const verifyDoc = await prisma.documento.findUnique({
              where: { id: documentId },
              select: { compartoId: true }
            })

            console.log('[OCR-WORKER][CLASSIFICATION][KEEP-VERIFY] Verifica compartoId invariato', {
              documentId,
              compartoIdPrima: currentComparto?.id,
              compartoIdDopo: verifyDoc?.compartoId,
              match: currentComparto?.id === verifyDoc?.compartoId
            })
          }
        }
      } else {
        // Low classification confidence - update with classification info but keep in current comparto
        await prisma.documento.update({
          where: { id: documentId },
          data: {
            classConfidence: classResult.confidence,
            classWhy: classResult.why,
            tags: JSON.stringify([...classResult.tags, 'needs_review']),
          },
        })
      }
    }

    await job.updateProgress(100)

    // Update job status
    await prisma.job.update({
      where: { id: job.id! },
      data: {
        status: 'completed',
        progress: 100,
        result: JSON.stringify({ ocrResult }),
      },
    })

    // ✅ Verifica finale compartoId dopo OCR completo
    const finalDoc = await prisma.documento.findUnique({
      where: { id: documentId },
      include: { comparto: { select: { id: true, key: true, nome: true } } }
    })

    console.log('[OCR-WORKER][COMPLETED] OCR completato', {
      documentId,
      filename,
      finalCompartoId: finalDoc?.compartoId,
      finalCompartoKey: finalDoc?.comparto?.key,
      finalCompartoNome: finalDoc?.comparto?.nome,
      ocrStatus: finalDoc?.ocrStatus
    })

    console.log(`OCR completed for document ${documentId}`)
    return { success: true }

  } catch (error) {
    console.error(`OCR failed for document ${documentId}:`, error)
    const isCancelled = String((error as any)?.message || '').includes('CANCELLED')
    if (isCancelled) {
      console.log('[CANCEL][worker][handled]', { jobId: job.id, documentId })
      try { await prisma.job.update({ where: { id: job.id! }, data: { status: 'cancelled' } }) } catch {}
      try { await prisma.documento.update({ where: { id: documentId }, data: { ocrStatus: 'cancelled' } }) } catch {}
      return { cancelled: true }
    }

    // Update document status
    await prisma.documento.update({
      where: { id: documentId },
      data: { ocrStatus: 'failed' },
    })

    // Update job status
    await prisma.job.update({
      where: { id: job.id! },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    throw error
  }
}, {
  connection: getRedis(),
  // Auto‑tuning concorrenza per documenti: 1–4 in base ai thread e alla RAM
  concurrency: (() => {
    const threads = Math.max(1, (os.cpus()?.length || 1))
    const totalMemGb = Math.round((os.totalmem() || 0) / (1024 ** 3))
    const env = Number(process.env.OCR_WORKER_CONCURRENCY || 0)
    if (env > 0) return env
    // Laptop: tieni basso (1–2) per lasciare spazio al per‑pagina
    let c = threads >= 16 ? 3 : 2
    if (totalMemGb <= 8) c = 1
    return Math.max(1, Math.min(4, c))
  })(),
})

ocrWorker.on('completed', (job) => {
  console.log(`OCR job ${job.id} completed`)
})

ocrWorker.on('failed', (job, err) => {
  console.error(`OCR job ${job?.id} failed:`, err)
})

console.log('OCR Worker started')

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down workers...')
  await ocrWorker.close()
  await getRedis().disconnect()
  process.exit(0)
})