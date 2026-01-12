/**
 * Export principale per documentStore.
 * Fornisce accesso centralizzato allo store e ai suoi tipi.
 */

export { useDocumentStore } from './store'
export type {
  DocumentId,
  CompartoId,
  UploadId,
  DocumentStoreState,
  DocumentStoreActions,
  DocumentStoreSelectors,
  DocumentStore,
  PendingMoveConfirmation
} from './types'
export {
  generateDocumentId,
  calculateFileHash,
  deduplicateDocuments,
  findDocumentByCriteria
} from './utils'
