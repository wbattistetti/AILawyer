import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { storageService } from '../lib/storage.js'
import { config } from '../config/index.js'
import fs from 'fs'
import path from 'path'
import { execa } from 'execa'

const uploadSignSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
})

// Sanitizza il nome del file per Windows (rimuove caratteri non validi: < > : " | ? * \)
function sanitizeFileName(key: string): string {
  return key.replace(/[:<>"|?*\\]/g, '_')
}

export async function uploadRoutes(fastify: FastifyInstance) {
  // Get presigned upload URL
  fastify.post<{ Body: { filename: string; contentType: string } }>('/upload/sign', async (request, reply) => {
    try {
      const { filename, contentType } = uploadSignSchema.parse(request.body)

      const result = await storageService.getPresignedUploadUrl(filename, contentType)

      return result
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nella generazione dell\'URL di upload' })
    }
  })

  // Local upload endpoint (fallback without MinIO)
  fastify.put<{ Params: { key: string } }>('/upload/local/:key', {
    bodyLimit: 100 * 1024 * 1024, // 100MB limite per file grandi
  }, async (request, reply) => {
    try {
      if (config.STORAGE_MODE !== 'local') {
        return reply.status(400).send({ error: 'Local storage non abilitato' })
      }
      const s3Key = decodeURIComponent(request.params.key)
      const uploadDir = path.resolve(process.cwd(), '..', 'uploads')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

      const sanitizedKey = sanitizeFileName(s3Key)
      const filePath = path.join(uploadDir, sanitizedKey)

      fastify.log.info({
        msg: 'Upload local: receiving file',
        s3Key,
        uploadDir,
        filePath,
        contentType: request.headers['content-type'],
        hasBody: !!request.body,
        bodyType: typeof request.body,
        bodyIsBuffer: Buffer.isBuffer(request.body)
      })

      // Prova prima request.body (se Fastify ha già parsato come buffer)
      let buffer: Buffer
      if (Buffer.isBuffer(request.body)) {
        buffer = request.body
        fastify.log.info({ msg: 'Upload local: using parsed body buffer', s3Key, size: buffer.length })
      } else {
        // Altrimenti leggi dallo stream
        const chunks: Buffer[] = []
        for await (const chunk of request.raw) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        buffer = Buffer.concat(chunks)
        fastify.log.info({ msg: 'Upload local: read from raw stream', s3Key, size: buffer.length })
      }

      if (!buffer || buffer.length === 0) {
        fastify.log.warn({ msg: 'Upload local: empty buffer', s3Key })
        return reply.status(400).send({ error: 'File vuoto o non ricevuto' })
      }

      fastify.log.info({ msg: 'Upload local: got buffer from stream', s3Key, size: buffer.length })

      fs.writeFileSync(filePath, buffer)
      fastify.log.info({ msg: 'Upload local: file saved', s3Key, filePath, size: buffer.length })
      return reply.status(200).send()
    } catch (error: any) {
      fastify.log.error({
        msg: 'Upload local: error',
        error: error?.message,
        stack: error?.stack,
        s3Key: request.params.key
      })
      return reply.status(500).send({
        error: 'Errore durante l\'upload locale',
        details: error?.message || String(error)
      })
    }
  })

  // ✅ Copia file da filesystem a repository (streaming - zero memoria)
  fastify.post<{ Body: { filePath: string; s3Key: string } }>('/upload/copy-from-path', async (request, reply) => {
    try {
      const { filePath, s3Key } = request.body

      if (!filePath || !s3Key) {
        return reply.status(400).send({ error: 'filePath e s3Key sono richiesti' })
      }

      // Verifica che il file sorgente esista
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File sorgente non trovato' })
      }

      const uploadDir = path.resolve(process.cwd(), '..', 'uploads')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

      const sanitizedKey = sanitizeFileName(s3Key)
      const targetPath = path.join(uploadDir, sanitizedKey)

      // ✅ Streaming: leggi dal disco → scrivi nel repository (zero memoria)
      const sourceStream = fs.createReadStream(filePath)
      const targetStream = fs.createWriteStream(targetPath)

      await new Promise<void>((resolve, reject) => {
        sourceStream.pipe(targetStream)
        targetStream.on('finish', resolve)
        targetStream.on('error', reject)
        sourceStream.on('error', reject)
      })

      fastify.log.info({ msg: 'Copy from path: success', filePath, s3Key, targetPath })
      return reply.status(200).send({ success: true, s3Key })
    } catch (error: any) {
      fastify.log.error({ msg: 'Copy from path: error', error: error?.message, filePath: request.body?.filePath })
      return reply.status(500).send({
        error: 'Errore durante la copia del file',
        details: error?.message || String(error)
      })
    }
  })

  // Serve uploaded files for local OCR and preview
  fastify.get<{ Params: { key: string } }>('/files/:key', async (request, reply) => {
    try {
      const s3Key = decodeURIComponent(request.params.key)
      const sanitizedKey = sanitizeFileName(s3Key)
      const filePath = path.resolve(process.cwd(), '..', 'uploads', sanitizedKey)

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File non trovato' })
      }

      const stats = await fs.promises.stat(filePath)
      const ext = path.extname(s3Key).toLowerCase()
      let contentType = 'application/octet-stream'

      // ✅ PDF
      if (ext === '.pdf') {
        contentType = 'application/pdf'
      }
      // ✅ Word
      else if (ext === '.docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else if (ext === '.doc') {
        contentType = 'application/msword'
      }
      // ✅ Immagini
      else if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg'
      } else if (ext === '.png') {
        contentType = 'image/png'
      } else if (ext === '.gif') {
        contentType = 'image/gif'
      } else if (ext === '.webp') {
        contentType = 'image/webp'
      } else if (ext === '.bmp') {
        contentType = 'image/bmp'
      } else if (ext === '.svg') {
        contentType = 'image/svg+xml'
      }
      // ✅ Video
      else if (ext === '.mp4') {
        contentType = 'video/mp4'
      } else if (ext === '.avi') {
        contentType = 'video/x-msvideo'
      } else if (ext === '.mov') {
        contentType = 'video/quicktime'
      } else if (ext === '.wmv') {
        contentType = 'video/x-ms-wmv'
      } else if (ext === '.flv') {
        contentType = 'video/x-flv'
      } else if (ext === '.webm') {
        contentType = 'video/webm'
      } else if (ext === '.mkv') {
        contentType = 'video/x-matroska'
      } else if (ext === '.m4v') {
        contentType = 'video/x-m4v'
      }
      // ✅ Audio
      else if (ext === '.mp3') {
        contentType = 'audio/mpeg'
      } else if (ext === '.wav') {
        contentType = 'audio/wav'
      } else if (ext === '.ogg') {
        contentType = 'audio/ogg'
      } else if (ext === '.m4a') {
        contentType = 'audio/mp4'
      } else if (ext === '.flac') {
        contentType = 'audio/flac'
      } else if (ext === '.aac') {
        contentType = 'audio/aac'
      }

      reply.header('Content-Type', contentType)
      reply.header('Content-Length', String(stats.size))
      reply.header('Accept-Ranges', 'bytes') // ✅ Supporta range requests per video/audio
      reply.header('Cache-Control', 'public, max-age=3600')

      return reply.send(fs.createReadStream(filePath)) // ✅ Streaming
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel download del file' })
    }
  })

  // Preview first page for PDF (PNG), pass-through for images
  fastify.get<{ Params: { key: string } }>('/preview/:key.png', async (request, reply) => {
    try {
      const s3Key = decodeURIComponent(request.params.key)
      const sanitizedKey = sanitizeFileName(s3Key)
      const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
      const srcPath = path.join(uploadsDir, sanitizedKey)
      if (!fs.existsSync(srcPath)) {
        const payload = { error: 'File non trovato', details: srcPath }
        fastify.log.error({ msg: 'preview: missing source', ...payload, s3Key })
        return reply.status(404).send(payload)
      }

      const isPdf = s3Key.toLowerCase().endsWith('.pdf')
      if (!isPdf) {
        return reply.send(fs.createReadStream(srcPath))
      }

      const previewsDir = path.join(uploadsDir, '_previews')
      if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true })
      const safeName = s3Key.replace(/[\\/:"*?<>|]/g, '_')
      const outPng = path.join(previewsDir, `${safeName}.png`)

      if (!fs.existsSync(outPng)) {
        const binName = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
        let pdftoppm = config.POPPLER_PATH || ''
        // If POPPLER_PATH points to folder, append binary; if it points directly to exe, use it
        if (pdftoppm) {
          const looksExe = /pdftoppm(\.exe)?$/i.test(pdftoppm)
          pdftoppm = looksExe ? pdftoppm : path.join(pdftoppm, binName)
        } else {
          pdftoppm = binName // rely on PATH
        }
        if (!fs.existsSync(pdftoppm) && path.isAbsolute(pdftoppm)) {
          const payload = { error: 'pdftoppm non trovato', details: pdftoppm }
          fastify.log.error({ msg: 'preview: pdftoppm missing', ...payload, s3Key, srcPath, outPng, envPath: process.env.POPPLER_PATH })
          return reply.status(500).send(payload)
        }
        const prefix = outPng.slice(0, -4)
        try {
          const args = ['-singlefile', '-f', '1', '-l', '1', '-png', '-scale-to', '1000', srcPath, prefix]
          // Ensure PATH includes POPPLER_PATH so Windows can resolve the binary
          const envPath = process.env.PATH || ''
          const injectedPath = config.POPPLER_PATH ? `${config.POPPLER_PATH};${envPath}` : envPath
          fastify.log.info({ msg: 'preview: running pdftoppm', pdftoppm, args, injectedPath })
          await execa(pdftoppm, args, {
            shell: false,
            windowsHide: true,
            env: { ...process.env, PATH: injectedPath },
          })
        } catch (e: any) {
          const payload = { error: 'Errore esecuzione pdftoppm', details: e?.message, stderr: e?.stderr }
          fastify.log.error({ msg: 'preview: pdftoppm failed', ...payload, s3Key, srcPath, outPng, pdftoppm })
          return reply.status(500).send(payload)
        }
      }

      return reply.type('image/png').send(fs.createReadStream(outPng))
    } catch (error: any) {
      const payload = { error: 'Errore generazione anteprima', details: error?.message }
      fastify.log.error({ msg: 'preview: unhandled error', ...payload })
      return reply.status(500).send(payload)
    }
  })
}