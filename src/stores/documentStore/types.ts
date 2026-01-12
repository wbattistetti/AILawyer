/**
 * Tipi per il DocumentStore centralizzato.
 * Definisce l'identità unica e stabile per i documenti.
 */

import type { Documento, Comparto, UploadProgress } from '../../types'

/**
 * Identità unica e stabile per documento.
 * Priorità: s3Key > hash > temp:${hash}
 */
export type DocumentId = string

/**
 * ID per comparto
 */
export type CompartoId = string

/**
 * ID per upload
 */
export type UploadId = string

/**
 * Stato dello store documenti
 */
export interface DocumentStoreState {
  // Stato atomico
  documents: Map<DocumentId, Documento>
  comparti: Map<CompartoId, Comparto>
  praticaId: string | null

  // Upload state
  uploads: Map<UploadId, UploadProgress>

  // Client-side thumbnails (s3Key -> dataUrl)
  clientThumbByS3: Record<string, string>

  // Pending move confirmations (ghost thumbnails)
  pendingMoveConfirmations: Map<string, PendingMoveConfirmation>
}

/**
 * Conferma spostamento in attesa
 */
export interface PendingMoveConfirmation {
  docId: DocumentId
  filename: string
  sourceCompartoId: CompartoId
  sourceCompartoNome: string
  targetCompartoId: CompartoId
  targetCompartoNome: string
  preservedThumbnail?: string
}

/**
 * Actions per modificare lo stato
 */
export interface DocumentStoreActions {
  // Documenti
  setDocuments: (docs: Documento[]) => void
  addDocument: (doc: Documento) => DocumentId
  updateDocument: (docId: DocumentId, updates: Partial<Documento>) => void
  moveDocument: (docId: DocumentId, targetCompartoId: CompartoId) => void
  removeDocument: (docId: DocumentId) => void

  // Comparti
  setComparti: (comparti: Comparto[]) => void

  // Pratica
  setPraticaId: (praticaId: string | null) => void

  // Uploads
  addUpload: (upload: UploadProgress) => UploadId
  updateUpload: (uploadId: UploadId, updates: Partial<UploadProgress>) => void
  removeUpload: (uploadId: UploadId) => void
  setUploads: (uploads: UploadProgress[]) => void
  findAndUpdateUpload: (predicate: (upload: UploadProgress) => boolean, updates: Partial<UploadProgress>) => UploadId | null
  removeUploadsBy: (predicate: (upload: UploadProgress) => boolean) => void

  // Client thumbnails
  setClientThumb: (s3Key: string, dataUrl: string) => void
  removeClientThumb: (s3Key: string) => void

  // Pending move confirmations
  addPendingMoveConfirmation: (confirmation: PendingMoveConfirmation) => void
  removePendingMoveConfirmation: (key: string) => void
  clearPendingMoveConfirmations: () => void
}

/**
 * Selectors reattivi
 */
export interface DocumentStoreSelectors {
  getDocument: (docId: DocumentId) => Documento | undefined
  getDocumentsByComparto: (compartoId: CompartoId) => Documento[]
  getDocumentCount: (compartoId: CompartoId) => number
  getAllDocuments: () => Documento[]
  getAllComparti: () => Comparto[]
  getComparto: (compartoId: CompartoId) => Comparto | undefined
}

/**
 * Store completo (state + actions + selectors)
 */
export type DocumentStore = DocumentStoreState & DocumentStoreActions & DocumentStoreSelectors
