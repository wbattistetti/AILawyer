import fs from 'fs/promises'
import { createRequire } from 'module'
import { Canvas, Image, ImageData, Path2D, DOMMatrix } from '@napi-rs/canvas'

// Polyfill globale per pdfjs-dist
;(globalThis as any).Canvas = Canvas
;(globalThis as any).Image = Image
;(globalThis as any).ImageData = ImageData
;(globalThis as any).Path2D = Path2D
;(globalThis as any).DOMMatrix = DOMMatrix

// Import pdf.js usando require (necessario per Node.js con ES modules)
const require = createRequire(import.meta.url)
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

/**
 * Rileva se un PDF ha testo nativo (text layer embeddato)
 * Strategia VELOCE: legge SOLO la prima pagina e conta i text items
 *
 * @param pdfPath - Path assoluto al file PDF
 * @returns true se ha testo nativo (>10 text items), false altrimenti
 */
export async function detectNativeText(pdfPath: string): Promise<boolean> {
  const filename = pdfPath.split(/[/\\]/).pop()
  // Log rimossi - troppo verbosi (viene chiamato per ogni PDF)

  try {
    // Leggi il file come buffer
    const buffer = await fs.readFile(pdfPath)

    const uint8Array = new Uint8Array(buffer)

    // Carica il documento PDF (con opzioni per Node.js)
    const loadingTask = getDocument({
      data: uint8Array,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false
    })
    const pdfDoc = await loadingTask.promise

    // Leggi SOLO la prima pagina (velocissimo!)
    const page = await pdfDoc.getPage(1)
    const textContent = await page.getTextContent()

    // Conta text items (stringhe di testo)
    const textItemCount = textContent.items.length

    // Se ha più di 10 text items, è quasi certamente nativo
    const hasNativeText = textItemCount > 10

    // Cleanup
    await pdfDoc.cleanup()

    return hasNativeText
  } catch (error) {
    // Log solo errori critici (problemi di lettura PDF)
    console.error('[DETECT][native-text][ERROR]', {
      filename,
      error: (error as Error).message
    })
    // In caso di errore, assumiamo che non ha testo nativo (safe default)
    return false
  }
}

