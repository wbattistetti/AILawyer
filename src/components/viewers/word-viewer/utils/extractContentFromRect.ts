/**
 * ✅ Estrae contenuto da un rettangolo nel Word viewer
 * Implementazione specifica del viewer per extractContentFromRect()
 */

import type { RectSelection, ExtractedContent } from '../../common/types/viewer.types'

export interface ExtractContentFromRectOptions {
  /**
   * ✅ Ref all'host del viewer
   */
  hostRef: React.RefObject<HTMLDivElement>
  /**
   * ✅ Ref alle pagine (per trovare pageElement)
   */
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  /**
   * ✅ Word ha sempre testo nativo
   */
  hasNativeText: boolean
}

/**
 * ✅ Estrae contenuto da un rettangolo nel Word viewer
 *
 * Logica:
 * - Word ha sempre testo nativo → estrae testo nativo
 * - Se intercetta un'immagine → OCR (se necessario)
 * - Se intercetta entrambi → testo nativo + OCR
 * - Ritaglia sempre immagine per screenshot
 */
export async function extractContentFromRect(
  rect: RectSelection,
  options: ExtractContentFromRectOptions
): Promise<ExtractedContent> {
  const { hostRef, pageElsRef, hasNativeText } = options

  // ✅ Converti pageIndex (0-based) a pageNumber (1-based)
  const pageNumber = rect.pageIndex + 1
  const pageEl = pageElsRef.current.get(pageNumber)

  if (!pageEl || !hostRef.current) {
    return {
      text: undefined,
      ocrText: undefined,
      imageSnippet: undefined,
      metadata: {
        error: 'Page element not found',
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

  // ✅ 1. Estrai testo nativo (Word ha sempre testo nativo)
  if (hasNativeText) {
    try {
      const pageRect = pageEl.getBoundingClientRect()
      const hostRect = hostRef.current.getBoundingClientRect()

      // ✅ Converti coordinate assolute in coordinate relative alla pagina
      const x0Absolute = rect.rect.x + hostRect.left
      const y0Absolute = rect.rect.y + hostRect.top
      const x1Absolute = x0Absolute + rect.rect.width
      const y1Absolute = y0Absolute + rect.rect.height

      const x0Page = x0Absolute - pageRect.left
      const y0Page = y0Absolute - pageRect.top
      const x1Page = x1Absolute - pageRect.left
      const y1Page = y1Absolute - pageRect.top

      // ✅ Crea Range per selezionare testo nel rettangolo
      const range = document.createRange()
      const walker = document.createTreeWalker(
        pageEl,
        NodeFilter.SHOW_TEXT,
        null
      )

      let textParts: string[] = []
      let node: Node | null

      while ((node = walker.nextNode())) {
        if (!node.textContent) continue

        const nodeRange = document.createRange()
        nodeRange.selectNodeContents(node)

        const nodeRect = nodeRange.getBoundingClientRect()
        const nodeX0 = nodeRect.left - pageRect.left
        const nodeY0 = nodeRect.top - pageRect.top
        const nodeX1 = nodeX0 + nodeRect.width
        const nodeY1 = nodeY0 + nodeRect.height

        // ✅ Verifica se il nodo interseca il rettangolo
        if (
          nodeX1 >= x0Page &&
          nodeX0 <= x1Page &&
          nodeY1 >= y0Page &&
          nodeY0 <= y1Page
        ) {
          textParts.push(node.textContent.trim())
        }
      }

      if (textParts.length > 0) {
        result.text = textParts.join(' ').trim()
      }
    } catch (error) {
      console.warn('[WORD-EXTRACT] Errore estrazione testo nativo:', error)
    }
  }

  // ✅ 2. Ritaglia immagine (sempre, per screenshot)
  try {
    // ✅ Usa html2canvas o screenshot API per Word
    // Per ora, usa captureSelectionScreenshotWithFallback (già implementato)
    const { captureSelectionScreenshotWithFallback } = await import('../../common/utils/screenshot')
    const { fast } = await captureSelectionScreenshotWithFallback(hostRef.current, viewportBox)

    if (fast) {
      // ✅ Converti data URL in Blob
      const response = await fetch(fast)
      const blob = await response.blob()
      result.imageSnippet = blob
      // ✅ Salva anche data URL nei metadati per retrocompatibilità
      result.metadata = {
        ...result.metadata,
        imageDataUrl: fast
      }
    }
  } catch (error) {
    console.warn('[WORD-EXTRACT] Errore ritaglio immagine:', error)
  }

  // ✅ 3. OCR solo se necessario (se c'è un'immagine nel rettangolo)
  // TODO: Implementare rilevamento immagini e OCR se necessario

  return result
}
