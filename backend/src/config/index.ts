import { z } from 'zod'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

// Carica SEMPRE backend/.env; NON sovrascrivere variabili già impostate dal processo
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Questo file si trova in backend/src/config → la .env sta in backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false })

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('legalflow-documents'),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
  OCR_CONFIDENCE_THRESHOLD: z.coerce.number().default(65),
  CLASSIFY_CONFIDENCE_THRESHOLD: z.coerce.number().default(60),
  STORAGE_MODE: z.enum(['local', 's3']).default('local'),
  ENABLE_QUEUE: z.coerce.boolean().default(false),
  OCR_USE_STUB: z.coerce.boolean().default(false),
  POPPLER_PATH: z.string().optional(),
  THUMBS_DIR: z.string().default(path.resolve(process.cwd(), '..', 'uploads', '_thumbs')),

  // OCR engine selection and settings
  OCR_ENGINE: z.enum(['tesseractjs', 'ocrmypdf', 'poppler']).default('poppler'),
  OCR_LANG: z.string().default('ita+eng'),
  OCRMYPDF_PATH: z.string().optional(),
  OCR_TIMEOUT_SEC: z.coerce.number().default(900),
  // Quick OCR tuning
  OCR_QUICK_MODE: z.coerce.boolean().default(false),
  OCR_QUICK_DPI: z.coerce.number().default(180),
  OCR_QUICK_LANG: z.string().default('ita'),
  OCR_JOBS: z.coerce.number().default(0),
  // Ottimizzazioni concorrenza
  OCR_CONCURRENCY: z.coerce.number().default(0), // 0 = auto-ottimizzato
  OCR_MAX_CONCURRENCY: z.coerce.number().default(16),
  // Thumbnail settings
  THUMB_AUTO_GENERATE: z.coerce.boolean().default(true),
  THUMB_QUALITY: z.coerce.number().default(0.8),
  // Worker settings
  OCR_WORKER_CONCURRENCY: z.coerce.number().default(8),
})

export const config = configSchema.parse(process.env)