/**
 * ✅ Estrae contenuto da un rettangolo nel PDF viewer
 * Implementazione specifica del viewer per extractContentFromRect()
 */

import type { RectSelection, ExtractedContent } from '../../common/types/viewer.types'
import { getSelectedTextInRect } from './textExtraction'
import { cropCanvasFromViewportBox } from './canvasCrop'

export interface ExtractContentFromRectOptions {
  /**
   * ✅ Ref all'host del viewer
   */
  hostRef: React.RefObject<HTMLElement>
  /**
   * ✅ Ref alle pagine (per trovare pageLayer)
   */
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  /**
   * ✅ Se il PDF ha testo nativo
   */
  hasNativeText: boolean
  /**
   * ✅ Ref al documento PDF (per OCR se necessario)
   */
  pdfDocRef?: React.MutableRefObject<any>
}

/**
 * ✅ Estrae contenuto da un rettangolo nel PDF viewer
 *
 * Logica:
 * - Se PDF ha testo nativo → estrae testo nativo
 * - Se PDF è immagine → OCR (se necessario)
 * - Se misto → fallback intelligente
 * - Ritaglia sempre immagine per screenshot
 */
export async function extractContentFromRect(
  rect: RectSelection,
  options: ExtractContentFromRectOptions
): Promise<ExtractedContent> {
  const { hostRef, pageElsRef, hasNativeText, pdfDocRef } = options

  // ✅ Converti pageIndex (0-based) a pageNumber (1-based)
  const pageNumber = rect.pageIndex + 1
  const pageLayer = pageElsRef.current.get(pageNumber)

  if (!pageLayer || !hostRef.current) {
    return {
      text: undefined,
      ocrText: undefined,
      imageSnippet: undefined,
      metadata: {
        error: 'Page layer not found',
        pageNumber
      }
    }
  }

  // ✅ Converti rect in viewportBox (formato attuale)
  const viewportBox = {
    x: rect.rect.x,
    y: rect.rect.y,
    w: rect.rect.width,
    h: rect.rect.height
  }

  const result: ExtractedContent = {
    metadata: {
      pageNumber,
      hasNativeText,
      viewerId: rect.viewerId
    }
  }

  // ✅ 1. Estrai testo nativo se disponibile
  if (hasNativeText) {
    try {
      const textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
      if (textLayer) {
        const { text } = await getSelectedTextInRect(textLayer, viewportBox)
        if (text && text.trim().length > 0) {
          result.text = text.trim()
        }
      }
    } catch (error) {
      console.warn('[PDF-EXTRACT] Errore estrazione testo nativo:', error)
    }
  }

  // ✅ 2. Ritaglia immagine (sempre, per screenshot)
  try {
    // ✅ Trova canvas nella pagina (cerca prima in .rpv-core__canvas-layer, poi direttamente)
    const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
    const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null

    if (canvas) {
      const imageDataUrl = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
      if (imageDataUrl) {
        // ✅ Converti data URL in Blob
        const response = await fetch(imageDataUrl)
        const blob = await response.blob()
        result.imageSnippet = blob
        // ✅ Salva anche data URL nei metadati per retrocompatibilità
        result.metadata = {
          ...result.metadata,
          imageDataUrl
        }
      }
    }
  } catch (error) {
    console.warn('[PDF-EXTRACT] Errore ritaglio immagine:', error)
  }

  // ✅ 3. OCR solo se necessario (PDF immagine senza testo nativo)
  // TODO: Implementare OCR se necessario
  // Per ora, se non c'è testo nativo, l'immagine è già disponibile per OCR esterno

  return result
}
