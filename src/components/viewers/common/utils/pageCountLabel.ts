/**
 * Formatta e risolve il numero di pagine da mostrare sulle miniature documento.
 */

export type PageCountSource = {
  pageCount?: number | null
  ocrLayout?: unknown
  ocrText?: string | null
  mime?: string | null
  ocrStatus?: string | null
}

/**
 * Restituisce l'etichetta italiana per il conteggio pagine (es. "1 pagina", "5 pagine").
 * @throws Error se count non è un intero >= 1
 */
export function formatPageCountLabel(count: number): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Conteggio pagine non valido: ${count}`)
  }
  return count === 1 ? '1 pagina' : `${count} pagine`
}

/**
 * Normalizza un valore numerico a conteggio pagine valido, altrimenti null.
 */
export function normalizePageCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  return n >= 1 ? n : null
}

/**
 * Conta le pagine dal testo OCR usando i separatori noti del backend.
 */
export function countPagesFromOcrText(ocrText: string): number | null {
  if (!ocrText || typeof ocrText !== 'string') return null
  if (ocrText.includes('\n\f\n')) {
    return normalizePageCount(ocrText.split(/\n\f\n/g).length)
  }
  if (ocrText.includes('\f')) {
    return normalizePageCount(ocrText.split(/\f/g).length)
  }
  return null
}

/**
 * Ricava il numero di pagine da metadati già disponibili sul documento.
 * Non apre il file: per i PDF senza OCR layout/text restituisce null.
 */
export function resolveDocumentPageCount(doc: PageCountSource): number | null {
  const explicit = normalizePageCount(doc.pageCount)
  if (explicit != null) return explicit

  if (typeof doc.mime === 'string' && doc.mime.startsWith('image/')) {
    return 1
  }

  if (Array.isArray(doc.ocrLayout) && doc.ocrLayout.length >= 1) {
    return doc.ocrLayout.length
  }

  const fromText = typeof doc.ocrText === 'string' ? countPagesFromOcrText(doc.ocrText) : null
  if (fromText != null) return fromText

  // OCR completato senza separatori → un'unica pagina di testo
  if (doc.ocrStatus === 'completed' && typeof doc.ocrText === 'string' && doc.ocrText.trim().length > 0) {
    return 1
  }

  return null
}
