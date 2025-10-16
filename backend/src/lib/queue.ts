import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { config } from '../config/index.js'

let redisSingleton: IORedis | null = null
let ocrQueueSingleton: Queue | null = null

export function getRedis(): IORedis {
  if (!redisSingleton) {
    // In standalone mode the caller should not use Redis.
    // Provide a lazy instance only when ENABLE_QUEUE=true.
    if (String(process.env.ENABLE_QUEUE).toLowerCase() !== 'true') {
      throw new Error('Redis disabled in standalone mode (ENABLE_QUEUE!=true)')
    }
    redisSingleton = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null as any, // silence BullMQ warning
      lazyConnect: true,
      enableReadyCheck: false,
      retryStrategy: () => null,
    })
  }
  return redisSingleton
}

export function getOcrQueue(): Queue {
  if (!ocrQueueSingleton) {
    ocrQueueSingleton = new Queue('ocr-processing', {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        // Ottimizzazioni per concorrenza massima
        priority: 1,
        delay: 0,
      },
    })
  }
  return ocrQueueSingleton
}

export interface OcrJobData {
  documentId: string
  s3Key: string
  filename: string
  mime: string
}

export interface ClassifyJobData {
  documentId: string
  text: string
  filename: string
}