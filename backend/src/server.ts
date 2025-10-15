import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import cors from '@fastify/cors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Carica sempre backend/.env prima di tutto e fai valere .env su variabili preesistenti
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

// Forza default sicuri per avvio locale senza coda, Poppler attivo
process.env.ENABLE_QUEUE = 'false'
process.env.OCR_ENGINE = 'poppler'
process.env.STORAGE_MODE = process.env.STORAGE_MODE || 'local'
process.env.OCR_LANG = 'ita'

// Importa config e routes SOLO dopo aver fissato le env
const { config } = await import('./config/index.js')
const { praticheRoutes } = await import('./routes/pratiche.js')
const { documentiRoutes } = await import('./routes/documenti.js')
const { uploadRoutes } = await import('./routes/upload.js')
const { jobsRoutes } = await import('./routes/jobs.js')
const { thumbsRoutes } = await import('./routes/thumbs.js')
const { filesystemRoutes } = await import('./routes/filesystem.js')

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'info' : 'warn',
  },
  bodyLimit: config.MAX_UPLOAD_MB * 1024 * 1024,
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
fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
  // Keep JSON/urlencoded handled by built-ins; this only catches others
  done(null, body)
})

// Register routes
await fastify.register(praticheRoutes)
await fastify.register(documentiRoutes)
await fastify.register(uploadRoutes)
await fastify.register(jobsRoutes)
await fastify.register(thumbsRoutes)
await fastify.register(filesystemRoutes)

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