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
  fastify.put<{ Params: { key: string } }>('/upload/local/:key', async (request, reply) => {
    try {
      if (config.STORAGE_MODE !== 'local') {
        return reply.status(400).send({ error: 'Local storage non abilitato' })
      }
      const s3Key = decodeURIComponent(request.params.key)
      const uploadDir = path.resolve(process.cwd(), '..', 'uploads')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
      const filePath = path.join(uploadDir, s3Key)

      // Prefer the parsed body (Buffer) from the content-type parser
      let buffer: Buffer | undefined
      const anyReq: any = request as any
      if (anyReq.body && Buffer.isBuffer(anyReq.body)) {
        buffer = anyReq.body as Buffer
      } else {
        const chunks: Buffer[] = []
        for await (const chunk of request.raw) {
          chunks.push(Buffer.from(chunk))
        }
        buffer = Buffer.concat(chunks)
      }

      if (!buffer || buffer.length === 0) {
        return reply.status(400).send({ error: 'File vuoto o non ricevuto' })
      }

      fs.writeFileSync(filePath, buffer)
      return reply.status(200).send()
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore durante l\'upload locale' })
    }
  })

  // Serve uploaded files for local OCR and preview
  fastify.get<{ Params: { key: string } }>('/files/:key', async (request, reply) => {
    try {
      const filePath = path.resolve(process.cwd(), '..', 'uploads', request.params.key)
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File non trovato' })
      }
      return reply.send(fs.createReadStream(filePath))
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Errore nel download del file' })
    }
  })

  // Preview first page for PDF (PNG), pass-through for images
  fastify.get<{ Params: { key: string } }>('/preview/:key.png', async (request, reply) => {
    try {
      const s3Key = decodeURIComponent(request.params.key)
      const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
      const srcPath = path.join(uploadsDir, s3Key)
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