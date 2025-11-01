import { Client } from 'minio'
import { config } from '../config/index.js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/**
 * Sanitizza una chiave s3Key per uso come nome file su filesystem Windows/Linux
 * Rimuove caratteri non validi come : < > " | ? * \
 */
function sanitizeFileName(key: string): string {
  return key.replace(/[:<>"|?*\\]/g, '_')
}

export class StorageService {
  private client: Client
  private localDir: string

  constructor() {
    this.client = new Client({
      endPoint: new URL(config.S3_ENDPOINT).hostname,
      port: parseInt(new URL(config.S3_ENDPOINT).port) || 9000,
      useSSL: config.S3_ENDPOINT.startsWith('https'),
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
    })
    this.localDir = path.resolve(process.cwd(), '..', 'uploads')
    if (!fs.existsSync(this.localDir)) fs.mkdirSync(this.localDir, { recursive: true })
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(config.S3_BUCKET)
    if (!exists) {
      await this.client.makeBucket(config.S3_BUCKET)
    }
  }

  async getPresignedUploadUrl(filename: string, _contentType: string): Promise<{ uploadUrl: string; s3Key: string }> {
    const s3Key = `${Date.now()}-${crypto.randomUUID()}-${filename}`
    if (config.STORAGE_MODE === 'local') {
      const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(s3Key)}`
      return { uploadUrl, s3Key }
    }
    await this.ensureBucket()
    const uploadUrl = await this.client.presignedPutObject(config.S3_BUCKET, s3Key, 24 * 60 * 60)
    return { uploadUrl, s3Key }
  }

  async getObject(s3Key: string): Promise<Buffer> {
    // Sanitizza s3Key per path Windows (rimuove caratteri non validi come ':')
    // Per file locali in modalità privacy, il s3Key può essere "local:timestamp:random"
    const sanitizedKey = sanitizeFileName(s3Key)
    const localPath = path.join(this.localDir, sanitizedKey)

    if (fs.existsSync(localPath)) {
      console.log('Storage:getObject local', { s3Key, sanitizedKey, localPath })
      return fs.promises.readFile(localPath)
    }
    if (config.STORAGE_MODE === 'local') {
      // If in local mode but file not found, provide a clearer error message
      console.warn('Storage:getObject ENOENT local', {
        s3Key,
        sanitizedKey,
        localPath,
        note: 'File non trovato. In modalità privacy, il file potrebbe non essere stato ancora caricato.'
      })
      throw new Error(`File non trovato: ${s3Key}. In modalità privacy, il file deve essere caricato tramite upload on-demand prima dell'uso.`)
    }
    console.log('Storage:getObject remote', { s3Key, bucket: config.S3_BUCKET, endpoint: config.S3_ENDPOINT })
    const stream = await this.client.getObject(config.S3_BUCKET, s3Key)
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }

  async deleteObject(s3Key: string): Promise<void> {
    if (config.STORAGE_MODE === 'local') {
      const sanitizedKey = sanitizeFileName(s3Key)
      const filePath = path.join(this.localDir, sanitizedKey)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    }
    await this.client.removeObject(config.S3_BUCKET, s3Key)
  }

  getLocalPath(s3Key: string): string {
    const sanitizedKey = sanitizeFileName(s3Key)
    return path.join(this.localDir, sanitizedKey)
  }
}

export const storageService = new StorageService()