/**
 * Servizio per auto-save periodico in IndexedDB.
 * Gestisce backup locale di documenti temp: prima del salvataggio esplicito.
 */

import { Documento } from '../../types'

const DB_NAME = 'ailawyer_autosave'
const DB_VERSION = 1
const STORE_NAME = 'autosaves'

export interface AutoSaveData {
  praticaId: string
  documents: Array<any>
  timestamp: number
}

export class AutoSaveService {
  private static db: IDBDatabase | null = null

  /**
   * Apre la connessione IndexedDB
   */
  static async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'praticaId' })
        }
      }
    })
  }

  /**
   * Salva documenti temp: in IndexedDB
   */
  static async save(praticaId: string, documents: Documento[]): Promise<void> {
    const tempDocs = documents.filter(d =>
      d.id.startsWith('temp:') || d.id.startsWith('pending:')
    )

    if (tempDocs.length === 0) return

    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const data: AutoSaveData = {
      praticaId,
      documents: tempDocs.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        mime: doc.mime,
        size: doc.size,
        compartoId: doc.compartoId,
        praticaId: doc.praticaId,
        filePath: (doc as any).filePath,
        thumbnailDataUrl: (doc as any).thumbnailDataUrl,
        hasNativeText: (doc as any).hasNativeText,
        ocrStatus: doc.ocrStatus,
        tags: doc.tags,
        createdAt: doc.createdAt,
        // NOTA: localUrl non viene salvato (blob URL non serializzabile)
        // Verrà ricreato quando necessario dal filePath
      })),
      timestamp: Date.now()
    }

    await new Promise<void>((resolve, reject) => {
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    console.log('[AUTO-SAVE] Salvato in IndexedDB', { praticaId, count: tempDocs.length })
  }

  /**
   * Recupera documenti temp: da IndexedDB
   */
  static async restore(praticaId: string): Promise<AutoSaveData | null> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.get(praticaId)
      request.onsuccess = () => {
        const data = request.result as AutoSaveData | undefined
        if (data) {
          console.log('[AUTO-SAVE] Recuperato da IndexedDB', { praticaId, count: data.documents?.length || 0 })
        }
        resolve(data || null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Pulisce IndexedDB dopo salvataggio esplicito
   */
  static async clear(praticaId: string): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(praticaId)
      request.onsuccess = () => {
        console.log('[AUTO-SAVE] Pulito IndexedDB dopo salvataggio esplicito', { praticaId })
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }
}
