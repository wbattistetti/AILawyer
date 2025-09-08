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
    const ocrResult = await ocrService.extract(s3Key)
    
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
          include: { pratica: { include: { comparti: true } } },
        })
        
        if (documento) {
          const targetComparto = documento.pratica.comparti.find(c => c.key === classResult.compartoKey)
          
          if (targetComparto) {
            await prisma.documento.update({
              where: { id: documentId },
              data: {
                compartoId: targetComparto.id,
                classConfidence: classResult.confidence,
                classWhy: classResult.why,
                tags: JSON.stringify(classResult.tags),
              },
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

    console.log(`OCR completed for document ${documentId}`)
    return { success: true }
    
  } catch (error) {
    console.error(`OCR failed for document ${documentId}:`, error)
    
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
  concurrency: 2, // Process 2 OCR jobs concurrently
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