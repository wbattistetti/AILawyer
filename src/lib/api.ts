import { Pratica, Comparto, Documento, Job } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const hasBody = options && 'body' in options && options.body !== undefined
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (hasBody && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const data = await response.json()
      if (data) {
        const msg = data.error || data.message || detail
        const extra = data.details ? `: ${data.details}` : ''
        detail = `${msg}${extra}`
      }
    } catch {}
    throw new ApiError(response.status, `API Error: ${detail}`)
  }

  return response.json()
}

export const api = {
  // Pratiche
  async createPratica(data: Omit<Pratica, 'id' | 'createdAt'>): Promise<Pratica> {
    return fetchApi('/pratiche', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getPratica(id: string): Promise<Pratica> {
    return fetchApi(`/pratiche/${id}`)
  },

  // Comparti
  async getComparti(praticaId: string): Promise<Comparto[]> {
    return fetchApi(`/pratiche/${praticaId}/comparti`)
  },

  // Documenti
  async createDocumento(data: Omit<Documento, 'id' | 'createdAt'>): Promise<Documento> {
    return fetchApi('/documenti', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getDocumento(id: string): Promise<Documento> {
    return fetchApi(`/documenti/${id}`)
  },

  async updateDocumento(id: string, data: Partial<Documento>): Promise<Documento> {
    return fetchApi(`/documenti/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async getDocumentiByPratica(praticaId: string): Promise<Documento[]> {
    return fetchApi(`/pratiche/${praticaId}/documenti`)
  },

  // Upload
  async getUploadUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; s3Key: string }> {
    return fetchApi('/upload/sign', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType }),
    })
  },

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
  },

  // Jobs
  async queueOcr(documentId: string): Promise<Job> {
    return fetchApi(`/documenti/${documentId}/queue-ocr`, {
      method: 'POST',
    })
  },

  // Files (local dev)
  getLocalFileUrl(key: string) {
    return `${API_BASE}/files/${encodeURIComponent(key)}`
  },

  // Preview first page (PDF -> PNG)
  getPreviewUrl(s3Key: string) {
    return `${API_BASE}/preview/${encodeURIComponent(s3Key)}.png`
  },

  // Thumbnails by hash (server-generated)
  getThumbUrl(hash: string) {
    return `${API_BASE}/thumb/${encodeURIComponent(hash)}.png`
  },

  async getJob(id: string): Promise<Job> {
    return fetchApi(`/jobs/${id}`)
  },
}