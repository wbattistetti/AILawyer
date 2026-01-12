/**
 * Utility per gestire identità e deduplicazione documenti.
 * Centralizza la logica per identificare univocamente i documenti.
 */

import type { Documento } from '../../types'
import type { DocumentId } from './types'

/**
 * Calcola hash SHA-256 di un file (client-side)
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * Genera un DocumentId stabile per un documento.
 * ✅ CRITICO: Priorità hash completo > s3Key > ID esistente
 * ✅ L'hash completo (64 caratteri) è l'identificatore primario del file, non cambia mai
 *
 * @param doc Documento o dati parziali
 * @returns DocumentId univoco e stabile
 */
export function generateDocumentId(doc: {
  id?: string
  s3Key?: string
  hash?: string
  filePath?: string
  file?: File
}): DocumentId | Promise<DocumentId> {
  // ✅ Priorità 1: hash completo (SHA-256 = 64 caratteri hex) - ID costante basato sul file
  if (doc.hash && doc.hash.length === 64) {
    return doc.hash
  }

  // ✅ Priorità 2: s3Key (solo se hash non disponibile)
  if (doc.s3Key && doc.s3Key.trim() !== '') {
    return doc.s3Key
  }

  // ✅ Priorità 3: ID esistente se non è temp/pending
  if (doc.id && !doc.id.startsWith('temp:') && !doc.id.startsWith('pending:')) {
    return doc.id
  }

  // ✅ Priorità 4: calcola hash da file (per file non ancora nel DB)
  if (doc.file) {
    return calculateFileHash(doc.file).then(hash => hash) // ✅ Usa hash completo, non temp:hash16
  }

  // ✅ Priorità 5: hash da filePath (se possibile)
  if (doc.filePath) {
    // Per ora usiamo un hash semplice del path (potrebbe essere migliorato)
    // In produzione, si potrebbe calcolare l'hash del file se accessibile
    const pathHash = doc.filePath.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0) | 0
    }, 0)
    // ✅ Usa hash completo simulato (64 caratteri) invece di temp:hash16
    const hash64 = Math.abs(pathHash).toString(16).padStart(64, '0').substring(0, 64)
    return hash64
  }

  // Fallback: genera ID temporaneo
  if (doc.id) {
    return doc.id
  }

  throw new Error('Cannot generate DocumentId: missing identifiers (s3Key, hash, file, filePath, or id)')
}

/**
 * Deduplica documenti mantenendo il documento più completo.
 * Priorità: documento reale > documento temp
 * Match per: DocumentId (s3Key/hash) > filePath > filename+compartoId
 *
 * @param docs Array di documenti da deduplicare
 * @returns Array deduplicato
 */
export function deduplicateDocuments(docs: Documento[]): Documento[] {
  const seen = new Map<DocumentId, Documento>()

  for (const doc of docs) {
    // Genera ID stabile (sincrono se possibile)
    let docId: DocumentId
    if (doc.s3Key) {
      docId = doc.s3Key
    } else if (doc.hash) {
      docId = doc.hash
    } else if (doc.id && !doc.id.startsWith('temp:') && !doc.id.startsWith('pending:')) {
      docId = doc.id
    } else {
      // Per documenti temp/pending, usa l'ID esistente o genera uno temporaneo
      docId = doc.id || `temp:${Date.now()}-${Math.random()}`
    }

    const existing = seen.get(docId)

    // Priorità: documento reale > documento temp
    // Se non esiste o se quello esistente è temp e questo è reale, sostituisci
    if (!existing) {
      seen.set(docId, { ...doc, id: docId })
    } else {
      const existingIsTemp = existing.id.startsWith('temp:') || existing.id.startsWith('pending:')
      const currentIsTemp = doc.id.startsWith('temp:') || doc.id.startsWith('pending:')

      if (existingIsTemp && !currentIsTemp) {
        // Sostituisci temp con reale
        seen.set(docId, { ...doc, id: docId })
      } else if (!existingIsTemp && currentIsTemp) {
        // Mantieni reale, ignora temp
        // Non fare nulla
      } else if (existingIsTemp && currentIsTemp) {
        // Entrambi temp: mantieni quello più completo
        const existingCompleteness = calculateCompleteness(existing)
        const currentCompleteness = calculateCompleteness(doc)
        if (currentCompleteness > existingCompleteness) {
          seen.set(docId, { ...doc, id: docId })
        }
      }
    }
  }

  return Array.from(seen.values())
}

/**
 * Calcola un punteggio di "completezza" per un documento.
 * Utile per decidere quale documento mantenere in caso di duplicati.
 */
function calculateCompleteness(doc: Documento): number {
  let score = 0

  if (doc.s3Key) score += 10
  if (doc.hash) score += 8
  if (doc.thumbnailDataUrl) score += 5
  if (doc.ocrStatus === 'completed') score += 3
  if (doc.ocrText) score += 2
  if (doc.filePath) score += 1

  return score
}

/**
 * Trova un documento nell'array usando vari criteri.
 * Priorità: ID esatto > s3Key > hash > filePath > filename+compartoId
 */
export function findDocumentByCriteria(
  documents: Documento[],
  criteria: {
    id?: DocumentId
    s3Key?: string
    hash?: string
    filePath?: string
    filename?: string
    compartoId?: string
  }
): Documento | undefined {
  // Priorità 1: ID esatto
  if (criteria.id) {
    const found = documents.find(d => d.id === criteria.id)
    if (found) return found
  }

  // Priorità 2: s3Key
  if (criteria.s3Key) {
    const found = documents.find(d => d.s3Key === criteria.s3Key)
    if (found) return found
  }

  // Priorità 3: hash
  if (criteria.hash && criteria.hash.trim() !== '') {
    const found = documents.find(d => d.hash === criteria.hash)
    if (found) return found
  }

  // Priorità 4: filePath
  if (criteria.filePath) {
    const found = documents.find(d =>
      (d as any).filePath === criteria.filePath &&
      (!criteria.compartoId || d.compartoId === criteria.compartoId)
    )
    if (found) return found
  }

  // Priorità 5: filename + compartoId
  if (criteria.filename && criteria.compartoId) {
    const found = documents.find(d =>
      d.filename === criteria.filename &&
      d.compartoId === criteria.compartoId
    )
    if (found) return found
  }

  return undefined
}
