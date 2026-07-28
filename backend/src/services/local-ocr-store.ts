/**
 * Archivio in memoria dei risultati OCR locali.
 * Centralizza stato e lookup senza accoppiare i servizi applicativi alle route HTTP.
 */

export interface LocalOcrResult {
  texts: string[]
  layout: unknown[]
  status: 'completed'
  progress: number
  s3Key?: string
}

export interface LocalOcrProgress {
  progress: number
  status: string
  result?: {
    texts?: string[]
    layout?: unknown[]
  }
  error?: string
}

export const localOcrProgress = new Map<string, LocalOcrProgress>()

/**
 * Restituisce un risultato OCR completato per la chiave esatta.
 */
export function getLocalOcrResult(s3Key: string): LocalOcrResult | null {
  const progress = localOcrProgress.get(s3Key)
  if (!progress || progress.status !== 'completed' || !progress.result) {
    return null
  }

  return {
    texts: progress.result.texts || [],
    layout: progress.result.layout || [],
    status: 'completed',
    progress: progress.progress,
    s3Key
  }
}

/**
 * Trova la chiave OCR locale per match esatto o prefisso hash.
 */
export function findLocalOcrKey(keyPrefix: string): string | null {
  const normalizedPrefix = keyPrefix.trim()
  if (!normalizedPrefix) {
    throw new Error('Il prefisso OCR locale non può essere vuoto')
  }

  if (localOcrProgress.has(normalizedPrefix)) return normalizedPrefix

  const matchingKey = Array.from(localOcrProgress.keys()).find((key) =>
    key.startsWith(normalizedPrefix)
  )
  return matchingKey ?? null
}

/**
 * Restituisce lo stato OCR in memoria (anche in corso / fallito), se presente.
 */
export function getLocalOcrProgressByPrefix(keyPrefix: string): LocalOcrProgress | null {
  const key = findLocalOcrKey(keyPrefix)
  if (!key) return null
  return localOcrProgress.get(key) ?? null
}

/**
 * Risolve un risultato OCR tramite chiave esatta o prefisso hash.
 */
export function getLocalOcrResultByPrefix(keyPrefix: string): LocalOcrResult | null {
  const key = findLocalOcrKey(keyPrefix)
  if (!key) return null
  return getLocalOcrResult(key)
}
