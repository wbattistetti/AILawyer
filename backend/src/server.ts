import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import cors from '@fastify/cors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Carica sempre backend/.env prima di tutto e fai valere .env su variabili preesistenti
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

// Per modalità standalone: disabilita coda salvo override da .env, Poppler attivo
if (typeof process.env.ENABLE_QUEUE === 'undefined') process.env.ENABLE_QUEUE = 'false'
process.env.OCR_ENGINE = 'poppler'
process.env.STORAGE_MODE = process.env.STORAGE_MODE || 'local'
process.env.OCR_LANG = 'ita'
// Rimuovi limite upload di default (puoi sovrascrivere via .env)
process.env.MAX_UPLOAD_MB = process.env.MAX_UPLOAD_MB || '0'

// Importa config e routes SOLO dopo aver fissato le env
const { config } = await import('./config/index.js')
const { praticheRoutes } = await import('./routes/pratiche.js')
const { documentiRoutes } = await import('./routes/documenti.js')
const { uploadRoutes } = await import('./routes/upload.js')
const { jobsRoutes } = await import('./routes/jobs.js')
const { searchRoutes } = await import('./routes/search.js')
const { thumbsRoutes } = await import('./routes/thumbs.js')
const { filesystemRoutes } = await import('./routes/filesystem.js')
const { clientiRoutes } = await import('./routes/clienti.js')
const { tipoDinamiciRoutes } = await import('./routes/tipo-dinamici.js')
const { estrattiRoutes } = await import('./routes/estratti.js')
const { memoriaDifensivaRoutes } = await import('./routes/memoria-difensiva.js')
const { ocrRoutes } = await import('./routes/ocr.js')

// Body limit: if MAX_UPLOAD_MB <= 0 → effectively unlimited
const limitMb = Number(config.MAX_UPLOAD_MB || 0)
const computedBodyLimit = limitMb > 0 ? (limitMb * 1024 * 1024) : Number.MAX_SAFE_INTEGER

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'info' : 'warn',
  },
  bodyLimit: computedBodyLimit,
})

// Register CORS
await fastify.register(cors, {
  origin: config.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:6500'] : true,
  credentials: true,
})

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// Accept binary uploads (pdf/images) as Buffer for local storage endpoint
// Register parsers for binary content types BEFORE the catch-all
fastify.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (req, body, done) => {
  done(null, body)
})
fastify.addContentTypeParser('image/*', { parseAs: 'buffer' }, (req, body, done) => {
  done(null, body)
})
fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => {
  done(null, body)
})
// Catch-all for other binary types
fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
  // Keep JSON/urlencoded handled by built-ins; this only catches others
  done(null, body)
})

// Register routes
console.log('🔧 Registering routes...')
await fastify.register(praticheRoutes, { prefix: '/api' })
console.log('✅ praticheRoutes registered')
await fastify.register(documentiRoutes, { prefix: '/api' })
console.log('✅ documentiRoutes registered')
await fastify.register(uploadRoutes, { prefix: '/api' })
console.log('✅ uploadRoutes registered')
// Register files route without prefix for direct file access
await fastify.register(uploadRoutes)
console.log('✅ uploadRoutes (no prefix) registered')
await fastify.register(jobsRoutes, { prefix: '/api' })
console.log('✅ jobsRoutes registered')
await fastify.register(searchRoutes, { prefix: '/api' })
console.log('✅ searchRoutes registered')
await fastify.register(thumbsRoutes, { prefix: '/api' })
console.log('✅ thumbsRoutes registered')
await fastify.register(filesystemRoutes, { prefix: '/api' })
console.log('✅ filesystemRoutes registered')
await fastify.register(clientiRoutes, { prefix: '/api' })
console.log('✅ clientiRoutes registered')
await fastify.register(tipoDinamiciRoutes, { prefix: '/api' })
console.log('✅ tipoDinamiciRoutes registered')
await fastify.register(estrattiRoutes, { prefix: '/api' })
console.log('✅ estrattiRoutes registered')
await fastify.register(memoriaDifensivaRoutes, { prefix: '/api' })
console.log('✅ memoriaDifensivaRoutes registered')
await fastify.register(ocrRoutes, { prefix: '/api' })
console.log('✅ ocrRoutes registered')
console.log('🎉 All routes registered successfully!')

// Start server
try {
  await fastify.listen({
    port: config.PORT,
    host: '0.0.0.0'
  })
  console.log(`🚀 Server running on http://localhost:${config.PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}