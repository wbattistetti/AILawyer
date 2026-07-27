import { Pratica, Comparto, Documento, Job, Cliente, Estratto } from '@/types'
import type {
  GenericEntity,
  GenericOccurrence,
  GenericRelation,
} from '@/features/generic-entities/types'
import type { PracticePersonsPayload } from '@/types/person'

/** Snapshot persistito delle entità generiche di una pratica (senza diagnostics). */
export type PracticeEntitiesPayload = {
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
}

export type LlmModelCatalogItem = {
  id: string
  ownedBy: string
  contextWindow: number | null
  pricing: {
    inputUsdPer1M: number
    outputUsdPer1M: number
    source: string
    asOf: string
  } | null
}

export type PracticeAiCall = {
  id: string
  praticaId: string
  operationId: string
  purpose: string
  providerId: string
  modelId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number | null
  costEur: number | null
  pricingFound: boolean
  durationMs: number
  error: string | null
  createdAt: string
}

export type PracticeAiCostsPayload = {
  calls: PracticeAiCall[]
  summary: {
    callCount: number
    errorCount: number
    inputTokens: number
    outputTokens: number
    durationMs: number
    costUsd: number
    costEur: number
    unpricedCallCount: number
  }
  updatedAt: string
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export type DocumentContentSource = 'local-ocr' | 'database-ocr' | 'native-pdf'

export type DocumentContentWord = {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export type ResolvedDocumentContent = {
  requestedId: string
  canonicalId: string
  filename: string
  source: DocumentContentSource
  pages: string[]
  layout: Array<{
    page?: number
    width?: number
    height?: number
    words: DocumentContentWord[]
  }>
}

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
    } catch { }
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

  async getPratiche(): Promise<Pratica[]> {
    return fetchApi('/pratiche')
  },

  async updatePratica(id: string, data: { numeroRuolo?: string; foro?: string; pmGiudice?: string; explorerState?: string; graphsState?: string }): Promise<Pratica> {
    return fetchApi(`/pratiche/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
  },

  async checkDraft(nome: string): Promise<{ exists: boolean; draft?: { id: string; nome: string; cliente: string; createdAt: string; documentCount: number } }> {
    return fetchApi(`/pratiche/check-draft?nome=${encodeURIComponent(nome)}`)
  },

  async commitPratica(id: string): Promise<{ ok: boolean; pratica?: Pratica }> {
    return fetchApi(`/pratiche/${id}/commit`, {
      method: 'POST'
    })
  },

  async deletePratica(id: string): Promise<{ ok: boolean; message: string }> {
    console.log('🌐 [API][CLIENT] Invio DELETE /pratiche/' + id)
    try {
      const result = await fetchApi<{ ok: boolean; message: string }>(`/pratiche/${id}`, {
        method: 'DELETE'
      })
      console.log('✅ [API][CLIENT] DELETE riuscito:', result)
      return result
    } catch (error) {
      console.error('❌ [API][CLIENT] DELETE fallito:', error)
      throw error
    }
  },

  async deleteAllDrafts(): Promise<{ ok: boolean; count: number; message: string }> {
    return fetchApi('/pratiche/drafts/all', {
      method: 'DELETE'
    })
  },

  // Comparti
  async getComparti(praticaId: string): Promise<Comparto[]> {
    return fetchApi(`/pratiche/${praticaId}/comparti`)
  },

  // Documenti
  async createDocumento(data: Omit<Documento, 'id' | 'createdAt'>): Promise<Documento> {
    // ✅ Rimuovi i campi undefined prima di stringify (JSON.stringify li rimuove comunque, ma è meglio essere espliciti)
    // ✅ Se thumbnailDataUrl è undefined, non includerlo (o passa null esplicitamente)
    const payload: any = { ...data }
    if (payload.thumbnailDataUrl === undefined) {
      delete payload.thumbnailDataUrl
    }
    if (payload.filePath === undefined) {
      delete payload.filePath
    }
    return fetchApi('/documenti', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getDocumento(id: string): Promise<Documento> {
    return fetchApi(`/documenti/${id}`)
  },

  // Get thumbnail (lazy loading)
  async getDocumentoThumbnail(id: string): Promise<{ id: string; thumbnailDataUrl: string; filename: string }> {
    return fetchApi(`/documenti/${id}/thumbnail`)
  },

  async updateDocumento(id: string, data: Partial<Documento>): Promise<Documento> {
    console.log('[UPDATE][DOCUMENTO][FRONTEND][START]', {
      docId: id,
      updateData: data,
      compartoId: data.compartoId
    })
    try {
      // ✅ Rimuovi i campi undefined prima di stringify (JSON.stringify li rimuove comunque, ma è meglio essere espliciti)
      const payload: any = { ...data }
      if (payload.thumbnailDataUrl === undefined) {
        delete payload.thumbnailDataUrl
      }
      const updated = await fetchApi(`/documenti/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      console.log('[UPDATE][DOCUMENTO][FRONTEND][SUCCESS]', {
        docId: id,
        filename: updated.filename,
        newCompartoId: updated.compartoId
      })
      return updated
    } catch (error) {
      console.error('[UPDATE][DOCUMENTO][FRONTEND][ERROR]', {
        docId: id,
        error
      })
      throw error
    }
  },

  async deleteDocumento(id: string): Promise<{ ok: boolean }> {
    try {
      return await fetchApi(`/documenti/${id}`, { method: 'DELETE' })
    } catch (e) {
      // backend potrebbe non avere ancora la route; segnala best-effort
      return { ok: false } as any
    }
  },

  async getDocumentiByPratica(praticaId: string): Promise<Documento[]> {
    try {
      const documenti = await fetchApi(`/pratiche/${praticaId}/documenti`)
      return documenti
    } catch (error) {
      console.error('[LOAD][DOCUMENTI][FRONTEND][ERROR]', {
        praticaId,
        error
      })
      throw error
    }
  },

  // ✅ Cerca documento esistente per hash (prima di creare tempDoc)
  async findDocumentByHash(praticaId: string, hash: string): Promise<Documento | null> {
    try {
      const documenti = await fetchApi(`/pratiche/${praticaId}/documenti`)
      const existing = documenti.find((d: Documento) => d.hash === hash)
      return existing || null
    } catch (error) {
      console.error('[FIND][DOCUMENT][BY-HASH][ERROR]', { praticaId, hash, error })
      return null
    }
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
  async queueOcr(documentId: string, mode: 'quick' | 'full' = 'full', limitPages?: number): Promise<Job> {
    const qp = new URLSearchParams({ mode })
    if (limitPages && limitPages > 0) qp.set('limitPages', String(limitPages))
    return fetchApi(`/documenti/${documentId}/queue-ocr?${qp.toString()}`, {
      method: 'POST',
    })
  },

  // OCR for local files (without database record - in-memory only)
  async queueOcrLocal(params: {
    s3Key: string
    filename: string
    mime?: string
    mode?: 'quick' | 'full'
    limitPages?: number
    praticaId?: string
    compartoId?: string
  }): Promise<{ s3Key: string; status: string; message: string }> {
    return fetchApi('/ocr/process-local', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  // Get OCR progress for local file (in-memory)
  async getOcrProgressLocal(s3Key: string): Promise<{ progress: number; status: string; result?: any; error?: string }> {
    return fetchApi(`/ocr/progress-local/${encodeURIComponent(s3Key)}`, {
      method: 'GET',
    })
  },

  // Cancel OCR for local file (in-memory)
  async cancelOcrLocal(s3Key: string): Promise<{ status: string; s3Key: string }> {
    return fetchApi(`/ocr/cancel-local/${encodeURIComponent(s3Key)}`, {
      method: 'DELETE',
    })
  },

  // Files (local dev)
  getLocalFileUrl(key: string) {
    return `${API_BASE}/files/${encodeURIComponent(key)}`
  },

  /** Recupera testo/layout dalla sorgente canonica scelta dal backend. */
  async getDocumentContent(locator: {
    docId: string
    hash?: string
    storageKey?: string
    filename?: string
  }): Promise<ResolvedDocumentContent> {
    const query = new URLSearchParams({ docId: locator.docId })
    if (locator.hash) query.set('hash', locator.hash)
    if (locator.storageKey) query.set('storageKey', locator.storageKey)
    if (locator.filename) query.set('filename', locator.filename)
    return fetchApi(`/document-content?${query.toString()}`)
  },

  // Preview first page (PDF -> PNG)
  getPreviewUrl(s3Key: string) {
    return `${API_BASE}/preview/${encodeURIComponent(s3Key)}.png`
  },

  // ❌ Rimossa getThumbUrl - thumbnail generate solo client-side e salvate in thumbnailDataUrl

  async getJob(id: string): Promise<Job> {
    return fetchApi(`/jobs/${id}`)
  },
  async cancelJob(id: string): Promise<{ ok: boolean }> {
    return fetchApi(`/jobs/${id}/cancel`, { method: 'POST' })
  },

  // Clienti
  async getCliente(id: string): Promise<Cliente> {
    return fetchApi(`/clienti/${id}`)
  },

  async getAllClienti(): Promise<Cliente[]> {
    const response = await fetchApi('/clienti')
    return Array.isArray(response) ? response : response.clienti || []
  },

  async getClientiByPratica(praticaId: string): Promise<{ clienti: Cliente[] }> {
    return fetchApi(`/pratiche/${praticaId}/clienti`)
  },

  // Anagrafiche estratte
  async getPracticePersons(praticaId: string): Promise<PracticePersonsPayload> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/persons`)
  },

  async savePracticePersons(
    praticaId: string,
    payload: PracticePersonsPayload
  ): Promise<Pick<PracticePersonsPayload, 'persons'>> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/persons`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async clearPracticePersons(praticaId: string): Promise<{ ok: boolean; count: number }> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/persons`, {
      method: 'DELETE',
    })
  },

  // Entità generiche estratte
  async getPracticeEntities(praticaId: string): Promise<PracticeEntitiesPayload> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/entities`)
  },

  async savePracticeEntities(
    praticaId: string,
    payload: PracticeEntitiesPayload
  ): Promise<PracticeEntitiesPayload> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/entities`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async clearPracticeEntities(praticaId: string): Promise<{ ok: boolean; count: number }> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/entities`, {
      method: 'DELETE',
    })
  },

  // Gateway Groq e costi LLM practice-scoped
  async getLlmModels(): Promise<{
    provider: 'groq'
    models: LlmModelCatalogItem[]
  }> {
    return fetchApi('/llm/models')
  },

  async getLlmExchangeRate(): Promise<{
    usdToEur: number
    source: 'ecb' | 'fallback'
  }> {
    return fetchApi('/llm/exchange-rate')
  },

  async getPracticeAiCosts(praticaId: string): Promise<PracticeAiCostsPayload> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/ai-costs`)
  },

  async clearPracticeAiCosts(
    praticaId: string
  ): Promise<{ ok: boolean; count: number }> {
    return fetchApi(`/pratiche/${encodeURIComponent(praticaId)}/ai-costs`, {
      method: 'DELETE',
    })
  },

  // Estratti
  async createEstratto(data: any): Promise<Estratto> {
    return fetchApi('/estratti', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getEstrattiByPratica(praticaId: string): Promise<{ estratti: Estratto[] }> {
    return fetchApi(`/estratti/pratica/${praticaId}`)
  },

  async updateEstratto(id: string, data: any): Promise<Estratto> {
    return fetchApi(`/estratti/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteEstratto(id: string): Promise<{ success: boolean }> {
    return fetchApi(`/estratti/${id}`, {
      method: 'DELETE',
    })
  },

  // Memoria Difensiva
  async createMemoriaDifensiva(data: any): Promise<any> {
    return fetchApi('/memoria-difensiva', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getMemorieDifensiveByPratica(praticaId: string): Promise<{ memorie: any[] }> {
    return fetchApi(`/memoria-difensiva/pratica/${praticaId}`)
  },

  async getMemoriaDifensiva(id: string): Promise<any> {
    return fetchApi(`/memoria-difensiva/${id}`)
  },

  async updateMemoriaDifensiva(id: string, data: any): Promise<any> {
    return fetchApi(`/memoria-difensiva/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteMemoriaDifensiva(id: string): Promise<{ success: boolean }> {
    return fetchApi(`/memoria-difensiva/${id}`, {
      method: 'DELETE',
    })
  },

  async generateMemoriaDifensiva(id: string): Promise<any> {
    return fetchApi(`/memoria-difensiva/${id}/generate`, {
      method: 'POST',
    })
  },
}