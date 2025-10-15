import * as pdfjsLib from 'pdfjs-dist'

// pdf.js setup for Vite
// @ts-ignore - Vite will turn this into a URL string (UMD worker path)
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker

export interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  scale?: number
}

export interface ThumbnailResult {
  dataUrl: string
  width: number
  height: number
  page: number
}

// Cache per le miniature generate
const thumbnailCache = new Map<string, ThumbnailResult>()

/**
 * Genera una miniatura della prima pagina di un PDF usando pdf.js
 * @param fileUrl URL del file PDF
 * @param options Opzioni per la generazione della miniatura
 * @returns Promise con il risultato della miniatura
 */
export async function generatePdfThumbnail(
  fileUrl: string, 
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  const {
    width = 200,
    height = 280,
    quality = 0.8,
    scale = 1.0
  } = options

  // Crea una chiave di cache basata su URL e opzioni
  const cacheKey = `${fileUrl}-${width}-${height}-${quality}-${scale}`
  
  // Controlla se è già in cache
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!
  }

  try {
    // Carica il documento PDF
    const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
    const pdf = await loadingTask.promise

    // Ottieni la prima pagina
    const page = await pdf.getPage(1)
    
    // Calcola la scala per adattare alle dimensioni richieste
    const viewport = page.getViewport({ scale: 1.0 })
    const scaleX = width / viewport.width
    const scaleY = height / viewport.height
    const finalScale = Math.min(scaleX, scaleY) * scale

    // Crea il viewport con la scala finale
    const scaledViewport = page.getViewport({ scale: finalScale })

    // Crea un canvas per il rendering
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    
    if (!context) {
      throw new Error('Impossibile creare il contesto canvas')
    }

    // Imposta le dimensioni del canvas
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height

    // Renderizza la pagina sul canvas
    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport,
    }

    await page.render(renderContext).promise

    // Converti in data URL con qualità specificata
    const dataUrl = canvas.toDataURL('image/jpeg', quality)

    const result: ThumbnailResult = {
      dataUrl,
      width: scaledViewport.width,
      height: scaledViewport.height,
      page: 1
    }

    // Salva in cache
    thumbnailCache.set(cacheKey, result)

    // Pulisci la cache se diventa troppo grande (mantieni solo le ultime 100)
    if (thumbnailCache.size > 100) {
      const firstKey = thumbnailCache.keys().next().value
      thumbnailCache.delete(firstKey)
    }

    return result

  } catch (error) {
    console.error('Errore nella generazione miniatura PDF:', error)
    throw new Error(`Impossibile generare la miniatura: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  }
}

/**
 * Genera miniature per più pagine di un PDF
 * @param fileUrl URL del file PDF
 * @param pages Array di numeri di pagina (1-based)
 * @param options Opzioni per la generazione delle miniature
 * @returns Promise con array di risultati
 */
export async function generatePdfThumbnails(
  fileUrl: string,
  pages: number[] = [1],
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult[]> {
  try {
    const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
    const pdf = await loadingTask.promise

    const results: ThumbnailResult[] = []

    for (const pageNum of pages) {
      if (pageNum < 1 || pageNum > pdf.numPages) {
        console.warn(`Pagina ${pageNum} non valida per PDF con ${pdf.numPages} pagine`)
        continue
      }

      const page = await pdf.getPage(pageNum)
      const result = await generateThumbnailFromPage(page, pageNum, options)
      results.push(result)
    }

    return results

  } catch (error) {
    console.error('Errore nella generazione miniature multiple:', error)
    throw error
  }
}

/**
 * Genera una miniatura da una pagina PDF già caricata
 */
async function generateThumbnailFromPage(
  page: any,
  pageNum: number,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  const {
    width = 200,
    height = 280,
    quality = 0.8,
    scale = 1.0
  } = options

  // Calcola la scala per adattare alle dimensioni richieste
  const viewport = page.getViewport({ scale: 1.0 })
  const scaleX = width / viewport.width
  const scaleY = height / viewport.height
  const finalScale = Math.min(scaleX, scaleY) * scale

  // Crea il viewport con la scala finale
  const scaledViewport = page.getViewport({ scale: finalScale })

  // Crea un canvas per il rendering
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  
  if (!context) {
    throw new Error('Impossibile creare il contesto canvas')
  }

  // Imposta le dimensioni del canvas
  canvas.width = scaledViewport.width
  canvas.height = scaledViewport.height

  // Renderizza la pagina sul canvas
  const renderContext = {
    canvasContext: context,
    viewport: scaledViewport,
  }

  await page.render(renderContext).promise

  // Converti in data URL con qualità specificata
  const dataUrl = canvas.toDataURL('image/jpeg', quality)

  return {
    dataUrl,
    width: scaledViewport.width,
    height: scaledViewport.height,
    page: pageNum
  }
}

/**
 * Pulisce la cache delle miniature
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear()
}

/**
 * Ottiene le statistiche della cache
 */
export function getThumbnailCacheStats(): { size: number; keys: string[] } {
  return {
    size: thumbnailCache.size,
    keys: Array.from(thumbnailCache.keys())
  }
}
