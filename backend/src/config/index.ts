import { z } from 'zod'
import path from 'path'

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
})

export const config = configSchema.parse(process.env)