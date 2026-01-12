/**
 * Store Zustand centralizzato per documenti.
 * Sostituisce window.__archiveData e gestisce tutto lo stato in modo reattivo.
 */

import { create } from 'zustand'
import type { Documento, Comparto, UploadProgress } from '../../types'
import type {
  DocumentStoreState,
  DocumentStoreActions,
  DocumentStoreSelectors,
  DocumentStore,
  DocumentId,
  CompartoId,
  UploadId,
  PendingMoveConfirmation
} from './types'
import { generateDocumentId, deduplicateDocuments, findDocumentByCriteria } from './utils'

/**
 * Stato iniziale
 */
const initialState: DocumentStoreState = {
  documents: new Map(),
  comparti: new Map(),
  praticaId: null,
  uploads: new Map(),
  clientThumbByS3: {},
  pendingMoveConfirmations: new Map()
}

/**
 * Store Zustand completo
 */
export const useDocumentStore = create<DocumentStore>((set, get) => ({
  // ===== STATE =====
  ...initialState,

  // ===== ACTIONS =====

  /**
   * Imposta tutti i documenti (sostituisce l'array esistente)
   */
  setDocuments: (docs: Documento[]) => {
    const deduplicated = deduplicateDocuments(docs)
    const documentsMap = new Map<DocumentId, Documento>()

    for (const doc of deduplicated) {
      // ✅ Genera ID stabile: priorità hash completo > s3Key > id
      // ✅ L'hash completo è l'identificatore primario del file
      const docId = (doc.hash && doc.hash.length === 64) ? doc.hash : (doc.s3Key || doc.id)
      if (docId) {
        documentsMap.set(docId, { ...doc, id: docId })
      }
    }

    set({ documents: documentsMap })
  },

  /**
   * Aggiunge un documento (o aggiorna se esiste già)
   */
  addDocument: (doc: Documento): DocumentId => {
    const state = get()

    // Genera ID stabile
    let docId: DocumentId
    // ✅ CRITICO: Priorità 1 - Hash completo (ID costante basato sul file)
    // ✅ L'hash è l'identificatore primario del file, non cambia mai
    if (doc.hash && doc.hash.length === 64) {
      // Hash SHA-256 completo (64 caratteri hex) = ID principale
      docId = doc.hash
    } else if (doc.id && (doc.id.startsWith('temp:') || doc.id.startsWith('pending:'))) {
      // ✅ Priorità 2 - ID temp:/pending: esistente (per retrocompatibilità)
      docId = doc.id
    } else if (doc.s3Key) {
      // ✅ Priorità 3 - s3Key (solo se hash non disponibile)
      docId = doc.s3Key
    } else if (doc.id) {
      // ✅ Priorità 4 - ID esistente
      docId = doc.id
    } else {
      // Fallback: genera ID temporaneo (non dovrebbe mai arrivare qui se hash è presente)
      docId = `temp:${Date.now()}-${Math.random()}`
      console.warn('[STORE][ADD-DOCUMENT][FALLBACK] Generato ID temporaneo senza hash', { filename: doc.filename })
    }

    // Crea nuovo Map con il documento aggiunto/aggiornato
    const newDocuments = new Map(state.documents)

    // ✅ LOG DETTAGLIATO: Prima di salvare
    console.log('💾 [STORE][ADD-DOCUMENT][BEFORE-SAVE]', {
      docId: docId.substring(0, 16) + '...',
      docIdLength: docId.length,
      filename: doc.filename,
      incomingHasThumbnail: !!(doc as any).thumbnailDataUrl,
      incomingThumbnailLength: (doc as any).thumbnailDataUrl?.length || 0,
      incomingThumbnailType: typeof (doc as any).thumbnailDataUrl,
      incomingThumbnailPreview: (doc as any).thumbnailDataUrl?.substring(0, 50) || 'NULL',
      incomingHasHash: !!(doc as any).hash,
      incomingHashLength: (doc as any).hash?.length || 0,
      incomingHashPreview: (doc as any).hash?.substring(0, 16) + '...' || 'NULL',
      existingDoc: state.documents.has(docId) ? 'EXISTS' : 'NEW'
    })

    // ✅ CRITICO: Preserva TUTTI i campi del documento, incluso thumbnailDataUrl
    const docToSave = { ...doc, id: docId }
    newDocuments.set(docId, docToSave)

    // ✅ LOG DETTAGLIATO: Dopo aver salvato
    const savedDoc = newDocuments.get(docId)
    console.log('💾 [STORE][ADD-DOCUMENT][AFTER-SAVE]', {
      docId: docId.substring(0, 16) + '...',
      filename: savedDoc?.filename,
      savedHasThumbnail: !!(savedDoc as any)?.thumbnailDataUrl,
      savedThumbnailLength: (savedDoc as any)?.thumbnailDataUrl?.length || 0,
      savedThumbnailType: typeof (savedDoc as any)?.thumbnailDataUrl,
      savedThumbnailPreview: (savedDoc as any)?.thumbnailDataUrl?.substring(0, 50) || 'NULL',
      savedHasHash: !!(savedDoc as any)?.hash,
      savedHashLength: (savedDoc as any)?.hash?.length || 0,
      savedHashPreview: (savedDoc as any)?.hash?.substring(0, 16) + '...' || 'NULL',
      savedId: savedDoc?.id?.substring(0, 16) + '...',
      savedIdLength: savedDoc?.id?.length || 0,
      idsMatch: savedDoc?.id === docId
    })

    set({ documents: newDocuments })

    return docId
  },

  /**
   * Aggiorna un documento esistente
   */
  updateDocument: (docId: DocumentId, updates: Partial<Documento>) => {
    const state = get()
    const existing = state.documents.get(docId)

    if (!existing) {
      console.warn(`[DOCUMENT-STORE] Tentativo di aggiornare documento inesistente: ${docId}`)
      return
    }

    const newDocuments = new Map(state.documents)
    newDocuments.set(docId, { ...existing, ...updates, id: docId })

    set({ documents: newDocuments })
  },

  /**
   * Sposta un documento in un altro comparto
   */
  moveDocument: (docId: DocumentId, targetCompartoId: CompartoId) => {
    const state = get()
    const doc = state.documents.get(docId)

    if (!doc) {
      console.warn(`[DOCUMENT-STORE] Tentativo di spostare documento inesistente: ${docId}`)
      return
    }

    const newDocuments = new Map(state.documents)
    newDocuments.set(docId, { ...doc, compartoId: targetCompartoId })

    set({ documents: newDocuments })
  },

  /**
   * Rimuove un documento
   */
  removeDocument: (docId: DocumentId) => {
    const state = get()
    const newDocuments = new Map(state.documents)
    newDocuments.delete(docId)
    set({ documents: newDocuments })
  },

  /**
   * Imposta tutti i comparti
   */
  setComparti: (comparti: Comparto[]) => {
    const compartiMap = new Map<CompartoId, Comparto>()
    for (const comparto of comparti) {
      compartiMap.set(comparto.id, comparto)
    }
    set({ comparti: compartiMap })
  },

  /**
   * Imposta praticaId
   */
  setPraticaId: (praticaId: string | null) => {
    set({ praticaId })
  },

  /**
   * Aggiunge un upload
   */
  addUpload: (upload: UploadProgress): UploadId => {
    const state = get()
    const uploadId = upload.s3Key || `upload:${Date.now()}-${Math.random()}`

    const newUploads = new Map(state.uploads)
    newUploads.set(uploadId, upload)

    set({ uploads: newUploads })

    return uploadId
  },

  /**
   * Aggiorna un upload
   */
  updateUpload: (uploadId: UploadId, updates: Partial<UploadProgress>) => {
    const state = get()
    const existing = state.uploads.get(uploadId)

    if (!existing) {
      console.warn(`[DOCUMENT-STORE] Tentativo di aggiornare upload inesistente: ${uploadId}`)
      return
    }

    const newUploads = new Map(state.uploads)
    newUploads.set(uploadId, { ...existing, ...updates })

    set({ uploads: newUploads })
  },

  /**
   * Rimuove un upload
   */
  removeUpload: (uploadId: UploadId) => {
    const state = get()
    const newUploads = new Map(state.uploads)
    newUploads.delete(uploadId)
    set({ uploads: newUploads })
  },

  /**
   * Imposta tutti gli uploads (sostituisce l'array esistente)
   */
  setUploads: (uploads: UploadProgress[]) => {
    const uploadsMap = new Map<UploadId, UploadProgress>()
    for (const upload of uploads) {
      const uploadId = upload.s3Key || `upload:${Date.now()}-${Math.random()}`
      uploadsMap.set(uploadId, upload)
    }
    set({ uploads: uploadsMap })
  },

  /**
   * Trova un upload per file/compartoId/s3Key e aggiornalo
   */
  findAndUpdateUpload: (predicate: (upload: UploadProgress) => boolean, updates: Partial<UploadProgress>) => {
    const state = get()
    const newUploads = new Map(state.uploads)
    for (const [uploadId, upload] of state.uploads.entries()) {
      if (predicate(upload)) {
        newUploads.set(uploadId, { ...upload, ...updates })
        set({ uploads: newUploads })
        return uploadId
      }
    }
    return null
  },

  /**
   * Rimuove uploads che corrispondono al predicato
   */
  removeUploadsBy: (predicate: (upload: UploadProgress) => boolean) => {
    const state = get()
    const newUploads = new Map(state.uploads)
    for (const [uploadId, upload] of state.uploads.entries()) {
      if (predicate(upload)) {
        newUploads.delete(uploadId)
      }
    }
    set({ uploads: newUploads })
  },

  /**
   * Imposta thumbnail client-side
   */
  setClientThumb: (s3Key: string, dataUrl: string) => {
    const state = get()
    set({ clientThumbByS3: { ...state.clientThumbByS3, [s3Key]: dataUrl } })
  },

  /**
   * Rimuove thumbnail client-side
   */
  removeClientThumb: (s3Key: string) => {
    const state = get()
    const newThumbs = { ...state.clientThumbByS3 }
    delete newThumbs[s3Key]
    set({ clientThumbByS3: newThumbs })
  },

  /**
   * Aggiunge una conferma di spostamento in attesa
   */
  addPendingMoveConfirmation: (confirmation: PendingMoveConfirmation) => {
    const state = get()
    const key = `${confirmation.docId}-${confirmation.targetCompartoId}`
    const newConfirmations = new Map(state.pendingMoveConfirmations)
    newConfirmations.set(key, confirmation)
    set({ pendingMoveConfirmations: newConfirmations })
  },

  /**
   * Rimuove una conferma di spostamento
   */
  removePendingMoveConfirmation: (key: string) => {
    const state = get()
    const newConfirmations = new Map(state.pendingMoveConfirmations)
    newConfirmations.delete(key)
    set({ pendingMoveConfirmations: newConfirmations })
  },

  /**
   * Pulisce tutte le conferme di spostamento
   */
  clearPendingMoveConfirmations: () => {
    set({ pendingMoveConfirmations: new Map() })
  },

  // ===== SELECTORS =====

  /**
   * Ottiene un documento per ID
   */
  getDocument: (docId: DocumentId) => {
    return get().documents.get(docId)
  },

  /**
   * Ottiene tutti i documenti di un comparto
   */
  getDocumentsByComparto: (compartoId: CompartoId) => {
    const state = get()
    return Array.from(state.documents.values()).filter(doc => doc.compartoId === compartoId)
  },

  /**
   * Conta i documenti di un comparto
   */
  getDocumentCount: (compartoId: CompartoId) => {
    const state = get()
    return Array.from(state.documents.values()).filter(doc => doc.compartoId === compartoId).length
  },

  /**
   * Ottiene tutti i documenti
   */
  getAllDocuments: () => {
    const docs = Array.from(get().documents.values())
    // ✅ LOG DETTAGLIATO: Documenti recuperati
    const hashIdDocs = docs.filter(d => /^[0-9a-f]{64}$/i.test(d.id))
    if (hashIdDocs.length > 0) {
      console.log('📦 [STORE][GET-ALL-DOCUMENTS]', {
        totalDocs: docs.length,
        hashIdDocs: hashIdDocs.length,
        hashIdDocsDetails: hashIdDocs.map(d => ({
          id: d.id.substring(0, 16) + '...',
          filename: d.filename,
          hasThumbnail: !!(d as any).thumbnailDataUrl,
          thumbnailLength: (d as any).thumbnailDataUrl?.length || 0,
          thumbnailPreview: (d as any).thumbnailDataUrl?.substring(0, 50) || 'NULL',
          hasHash: !!(d as any).hash,
          hashLength: (d as any).hash?.length || 0
        }))
      })
    }
    return docs
  },

  /**
   * Ottiene tutti i comparti
   */
  getAllComparti: () => {
    return Array.from(get().comparti.values())
  },

  /**
   * Ottiene un comparto per ID
   */
  getComparto: (compartoId: CompartoId) => {
    return get().comparti.get(compartoId)
  }
}))
