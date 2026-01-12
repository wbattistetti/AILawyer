/**
 * Helper functions pure per useArchive.
 * Funzioni senza side effects che possono essere testate in isolamento.
 */

import { Documento } from '../../../../types'
import { MAX_UPLOAD_SIZE, MAX_FILES_PER_BATCH } from '../../../../lib/constants'

/**
 * Helper per trovare un documento nell'array usando vari criteri
 * Priorità: ID esatto > s3Key > hash > filePath > filename
 */
export function findDocumentByCriteria(
  documenti: Documento[],
  criteria: {
    id?: string
    s3Key?: string
    hash?: string
    filePath?: string
    filename?: string
    compartoId?: string
  }
): { index: number; doc: Documento } | null {
  // Priorità 1: ID esatto
  if (criteria.id) {
    const index = documenti.findIndex(d => d.id === criteria.id)
    if (index >= 0) return { index, doc: documenti[index] }
  }

  // Priorità 2: s3Key
  if (criteria.s3Key) {
    const index = documenti.findIndex(d => d.s3Key === criteria.s3Key)
    if (index >= 0) return { index, doc: documenti[index] }
  }

  // Priorità 3: hash
  if (criteria.hash) {
    const index = documenti.findIndex(d => (d as any).hash === criteria.hash && (d as any).hash?.trim() !== '')
    if (index >= 0) return { index, doc: documenti[index] }
  }

  // Priorità 4: filePath (per documenti da Explorer)
  if (criteria.filePath) {
    const index = documenti.findIndex(d =>
      (d as any).filePath === criteria.filePath &&
      (!criteria.compartoId || d.compartoId === criteria.compartoId)
    )
    if (index >= 0) return { index, doc: documenti[index] }
  }

  // Priorità 5: filename + compartoId
  if (criteria.filename && criteria.compartoId) {
    const index = documenti.findIndex(d =>
      d.filename === criteria.filename &&
      d.compartoId === criteria.compartoId
    )
    if (index >= 0) return { index, doc: documenti[index] }
  }

  return null
}

/**
 * Helper per preservare la miniatura durante le transizioni di stato
 * Priorità: miniatura esistente > nuova miniatura > miniatura dal backend
 */
export function preserveThumbnail(
  existingDoc: Documento | undefined,
  newThumbnail: string | undefined,
  backendThumbnail: string | undefined
): string | undefined {
  if (existingDoc && (existingDoc as any).thumbnailDataUrl) {
    return (existingDoc as any).thumbnailDataUrl
  }
  if (newThumbnail) {
    return newThumbnail
  }
  return backendThumbnail
}

/**
 * Valida i file prima dell'upload
 * @returns null se validi, oggetto con errore se non validi
 */
export function validateFiles(files: File[]): { title: string; description: string } | null {
  if (files.length > MAX_FILES_PER_BATCH) {
    return {
      title: 'Troppi file',
      description: `Puoi caricare massimo ${MAX_FILES_PER_BATCH} file alla volta.`
    }
  }

  const oversizedFiles = files.filter(file => file.size > MAX_UPLOAD_SIZE)
  if (oversizedFiles.length > 0) {
    return {
      title: 'File troppo grandi',
      description: `Alcuni file superano il limite di ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`
    }
  }

  return null
}

/**
 * Calcola hash SHA-256 di un file
 */
export async function calculateFileHash(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', buf)
    const b = new Uint8Array(hash)
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

/**
 * Normalizza filename rimuovendo estensione per trovare duplicati legacy
 */
export function normalizeFilename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').toLowerCase()
}

/**
 * Verifica se un file è duplicato confrontando hash, nome e dimensione
 */
export async function isFileDuplicate(
  file: File,
  documenti: Documento[],
  existingHashes: Set<string>
): Promise<boolean> {
  const hash = await calculateFileHash(file)

  // Controlla hash
  if (hash && existingHashes.has(hash)) {
    return true
  }

  // Se hash non disponibile, controlla nome e dimensione
  if (!hash || hash.length === 0) {
    // Confronta filename esatto
    const existsByNameSize = documenti.some(d => d.filename === file.name && (d as any).size === file.size)
    if (existsByNameSize) return true

    // Confronta senza estensione per trovare duplicati legacy
    const normalizedNewName = normalizeFilename(file.name)
    const existsByNormalizedName = documenti.some(d => {
      const normalizedExisting = normalizeFilename(d.filename)
      return normalizedExisting === normalizedNewName && (d as any).size === file.size
    })
    if (existsByNormalizedName) return true
  }

  return false
}

/**
 * Fa merge di documenti reali dal backend con documenti temporanei in memoria.
 * Preserva le thumbnail dai documenti temporanei quando corrispondono a documenti reali.
 */
export function mergeDocumentsWithTemp(
  realDocs: Documento[],
  tempDocs: Documento[]
): Documento[] {
  // Crea mappa dei documenti reali per s3Key
  const realDocsByS3Key = new Map<string, Documento>()
  realDocs.forEach(d => {
    if (d.s3Key) {
      realDocsByS3Key.set(d.s3Key, d)
    }
  })

  // Crea mappa tempDoc per filename+compartoId (per match quando s3Key differisce)
  const tempDocsByKey = new Map<string, Documento>()
  tempDocs.forEach(tempDoc => {
    if (tempDoc.filename && tempDoc.compartoId) {
      const key = `${tempDoc.filename}:${tempDoc.compartoId}`
      tempDocsByKey.set(key, tempDoc)
    }
  })

  // Arricchisci documenti reali con thumbnail dai tempDoc
  const enrichedRealDocs = realDocs.map(realDoc => {
    // Cerca tempDoc corrispondente per s3Key
    let matchingTempDoc: Documento | undefined = undefined
    if (realDoc.s3Key) {
      matchingTempDoc = tempDocs.find(t => t.s3Key === realDoc.s3Key)
    }
    // Se non trovato per s3Key, cerca per filename+compartoId
    if (!matchingTempDoc && realDoc.filename && realDoc.compartoId) {
      const key = `${realDoc.filename}:${realDoc.compartoId}`
      matchingTempDoc = tempDocsByKey.get(key)
    }

    // Se trovato tempDoc con thumbnail, preservala
    if (matchingTempDoc) {
      const tempThumbnail = (matchingTempDoc as any)?.thumbnailDataUrl
      const realThumbnail = (realDoc as any)?.thumbnailDataUrl
      // Priorità: thumbnail client-side generata (tempDoc) > backend
      if (tempThumbnail && tempThumbnail !== realThumbnail) {
        return {
          ...realDoc,
          thumbnailDataUrl: tempThumbnail,
          localUrl: (matchingTempDoc as any)?.localUrl // Preserva anche localUrl
        } as Documento
      }
    }
    return realDoc
  })

  // Mantieni solo i documenti temporanei che NON hanno un documento reale corrispondente
  const tempDocsToKeep = tempDocs.filter(tempDoc => {
    if (!tempDoc.s3Key) {
      return true // Mantieni temp senza s3Key
    }
    // Escludi temp solo se esiste un documento reale con lo stesso s3Key
    if (realDocsByS3Key.has(tempDoc.s3Key)) {
      return false
    }
    // Escludi anche se c'è un documento reale con stesso filename+compartoId
    if (tempDoc.filename && tempDoc.compartoId) {
      const key = `${tempDoc.filename}:${tempDoc.compartoId}`
      return !realDocs.some(d => d.filename === tempDoc.filename && d.compartoId === tempDoc.compartoId)
    }
    return true
  })

  // Combina documenti reali arricchiti + documenti temporanei da mantenere
  return [...enrichedRealDocs, ...tempDocsToKeep]
}
