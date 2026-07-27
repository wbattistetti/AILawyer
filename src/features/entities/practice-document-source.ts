/**
 * Fonte unica dei documenti di pratica per l’estrazione anagrafiche.
 * Legge dallo store documenti a call-time (mai da props catturate dal dock).
 */

import { useDocumentStore } from '../../stores/documentStore/store'
import type { Documento } from '../../types'
import { createDocAdapters } from './adapters/create-doc-adapters'
import type { AdapterBuildResult } from './adapters/types'

export type PracticeDocMeta = {
  praticaId: string
  hash: string
  docId: string
  title: string
  pages: number
}

/** Elenco documenti della pratica dalla fonte di verità runtime. */
export function getPracticeDocuments(praticaId: string): Documento[] {
  if (!praticaId) return []
  const documents = useDocumentStore.getState().documents
  // Lo store canvas è già ripopolato per la pratica aperta; i temp possono non avere praticaId.
  return Array.from(documents.values()).filter(
    document => !document.praticaId || document.praticaId === praticaId
  )
}

/** Hook reattivo: stessa fonte di `getPracticeDocuments`. */
export function usePracticeDocuments(praticaId: string): Documento[] {
  return useDocumentStore(state => {
    if (!praticaId) return []
    return Array.from(state.documents.values()).filter(
      document => !document.praticaId || document.praticaId === praticaId
    )
  })
}

/** Meta minime per il pannello anagrafiche / draft signature. */
export function toPracticeDocMeta(praticaId: string, documents: Documento[]): PracticeDocMeta[] {
  return documents.map(document => ({
    praticaId,
    hash: document.hash,
    docId: document.id,
    title: document.filename,
    pages: 0,
  }))
}

/** Meta correnti della pratica, lette dallo store al momento della chiamata. */
export function listPracticeDocMeta(praticaId: string): PracticeDocMeta[] {
  return toPracticeDocMeta(praticaId, getPracticeDocuments(praticaId))
}

/**
 * Costruisce gli adapter di estrazione dai documenti correnti dello store.
 * Se `docIds` è passato, limita al sottoinsieme richiesto (sempre risolto dallo store).
 */
export function buildPracticeExtractionAdapters(
  praticaId: string,
  docIds?: string[]
): AdapterBuildResult {
  let documents = getPracticeDocuments(praticaId)
  if (docIds !== undefined) {
    const allowed = new Set(docIds)
    documents = documents.filter(document => allowed.has(document.id))
  }
  return createDocAdapters(documents)
}

/** Risolve un documento della pratica dallo store (apertura occorrenza, ecc.). */
export function findPracticeDocument(praticaId: string, docId: string): Documento | undefined {
  return getPracticeDocuments(praticaId).find(document => document.id === docId)
}
