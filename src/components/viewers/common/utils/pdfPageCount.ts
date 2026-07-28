/**
 * Legge il numero di pagine di un PDF via pdf.js, con cache per URL.
 */

import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore - Vite worker URL
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'

;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker

const pageCountCache = new Map<string, number>()
const inflight = new Map<string, Promise<number>>()

/**
 * Restituisce il numero di pagine del PDF all'URL dato.
 * @throws Error se il PDF non è leggibile o non ha pagine
 */
export async function getPdfPageCount(fileUrl: string): Promise<number> {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('URL PDF mancante per il conteggio pagine')
  }

  const cached = pageCountCache.get(fileUrl)
  if (cached != null) return cached

  const pending = inflight.get(fileUrl)
  if (pending) return pending

  const task = (async () => {
    const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
    const pdf = await loadingTask.promise
    const numPages = Math.floor(Number(pdf.numPages) || 0)
    if (numPages < 1) {
      throw new Error('PDF senza pagine')
    }
    pageCountCache.set(fileUrl, numPages)
    return numPages
  })()

  inflight.set(fileUrl, task)
  try {
    return await task
  } finally {
    inflight.delete(fileUrl)
  }
}
