import { Client } from 'minio'
import { config } from '../config/index.js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

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
      const uploadUrl = `/api/upload/local/${encodeURIComponent(s3Key)}`
      return { uploadUrl, s3Key }
    }
    await this.ensureBucket()
    const uploadUrl = await this.client.presignedPutObject(config.S3_BUCKET, s3Key, 24 * 60 * 60)
    return { uploadUrl, s3Key }
  }

  async getObject(s3Key: string): Promise<Buffer> {
    // Prefer local file if present to avoid any remote calls
    const localPath = path.join(this.localDir, s3Key)
    if (fs.existsSync(localPath)) {
      console.log('Storage:getObject local', { s3Key, localPath })
      return fs.promises.readFile(localPath)
    }
    if (config.STORAGE_MODE === 'local') {
      // If in local mode but file not found, still try local path to surface ENOENT
      console.warn('Storage:getObject ENOENT local', { s3Key, localPath })
      return fs.promises.readFile(localPath)
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
      const filePath = path.join(this.localDir, s3Key)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    }
    await this.client.removeObject(config.S3_BUCKET, s3Key)
  }
}

export const storageService = new StorageService()