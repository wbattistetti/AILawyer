/**
 * Funzione centralizzata per deduplicare documenti.
 * Rimuove documenti temporanei duplicati quando esiste un documento reale corrispondente,
 * o quando ci sono più documenti temporanei per lo stesso file.
 *
 * Regole di deduplicazione:
 * 1. Documenti con stesso ID → mantieni solo il primo
 * 2. Documenti temporanei con stesso filePath → mantieni solo uno (preferisce quello con hash/miniatura)
 * 3. Documenti temporanei con stesso s3Key → mantieni solo uno (preferisce documento reale)
 * 4. Documenti temporanei con stesso hash → mantieni solo uno (preferisce documento reale)
 */
export function deduplicateDocuments<T extends {
  id: string
  compartoId?: string
  filePath?: string
  s3Key?: string
  hash?: string
}>(
  documents: T[]
): T[] {
  const seenIds = new Set<string>()
  const seenByFilePath = new Map<string, T>() // filePath -> documento (preferisce documento reale o con hash)
  const seenByS3Key = new Map<string, T>() // s3Key -> documento (preferisce documento reale)
  const seenByHash = new Map<string, T>() // hash -> documento (preferisce documento reale)

  return documents.filter(doc => {
    // ✅ 1. Deduplica per ID (ogni documento deve avere un ID univoco)
    if (seenIds.has(doc.id)) {
      return false // ID già visto, escludi
    }
    seenIds.add(doc.id)

    const isTemp = doc.id.startsWith('temp:') || doc.id.startsWith('pending:')

    // ✅ 2. Deduplica per hash (più affidabile in assoluto)
    if (doc.hash && doc.hash.trim() !== '') {
      const existing = seenByHash.get(doc.hash)
      if (existing) {
        const existingIsTemp = existing.id.startsWith('temp:') || existing.id.startsWith('pending:')
        if (isTemp && !existingIsTemp) {
          // Documento reale ha priorità su temporaneo
          return false
        }
        if (!isTemp && existingIsTemp) {
          // Sostituisci il temporaneo con il reale
          seenByHash.set(doc.hash, doc)
          // Rimuovi il vecchio dalla mappa filePath/s3Key se presente
          if (existing.filePath) seenByFilePath.delete(existing.filePath)
          if (existing.s3Key) seenByS3Key.delete(existing.s3Key)
          return true
        }
        // Entrambi temporanei o entrambi reali: mantieni il primo (quello già nella mappa)
        return false
      }
      seenByHash.set(doc.hash, doc)
    }

    // ✅ 3. Deduplica per filePath (per documenti da Explorer)
    if (doc.filePath && doc.filePath.trim() !== '') {
      const existing = seenByFilePath.get(doc.filePath)
      if (existing) {
        const existingIsTemp = existing.id.startsWith('temp:') || existing.id.startsWith('pending:')
        // Se entrambi sono temporanei, preferisci quello con hash (più completo)
        if (isTemp && existingIsTemp) {
          const existingHasHash = !!(existing.hash && existing.hash.trim() !== '')
          const currentHasHash = !!(doc.hash && doc.hash.trim() !== '')
          if (currentHasHash && !existingHasHash) {
            // Sostituisci quello senza hash con quello con hash
            seenByFilePath.set(doc.filePath, doc)
            return true
          }
          // Mantieni quello esistente (primo arrivato o con hash)
          return false
        }
        if (isTemp && !existingIsTemp) {
          // Documento reale ha priorità
          return false
        }
        if (!isTemp && existingIsTemp) {
          // Sostituisci temporaneo con reale
          seenByFilePath.set(doc.filePath, doc)
          return true
        }
        return false
      }
      seenByFilePath.set(doc.filePath, doc)
    }

    // ✅ 4. Deduplica per s3Key (per documenti caricati)
    if (doc.s3Key && doc.s3Key.trim() !== '') {
      const existing = seenByS3Key.get(doc.s3Key)
      if (existing) {
        const existingIsTemp = existing.id.startsWith('temp:') || existing.id.startsWith('pending:')
        if (isTemp && !existingIsTemp) {
          return false
        }
        if (!isTemp && existingIsTemp) {
          seenByS3Key.set(doc.s3Key, doc)
          return true
        }
        // Entrambi temporanei: preferisci quello con hash
        if (isTemp && existingIsTemp) {
          const existingHasHash = !!(existing.hash && existing.hash.trim() !== '')
          const currentHasHash = !!(doc.hash && doc.hash.trim() !== '')
          if (currentHasHash && !existingHasHash) {
            seenByS3Key.set(doc.s3Key, doc)
            return true
          }
        }
        return false
      }
      seenByS3Key.set(doc.s3Key, doc)
    }

    return true
  })
}
