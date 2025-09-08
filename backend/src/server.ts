import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config/index.js'
import { praticheRoutes } from './routes/pratiche.js'
import { documentiRoutes } from './routes/documenti.js'
import { uploadRoutes } from './routes/upload.js'
import { jobsRoutes } from './routes/jobs.js'
import { thumbsRoutes } from './routes/thumbs.js'

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'info' : 'warn',
  },
  bodyLimit: config.MAX_UPLOAD_MB * 1024 * 1024,
})

// Register CORS
await fastify.register(cors, {
  origin: config.NODE_ENV === 'development' ? 'http://localhost:5173' : true,
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