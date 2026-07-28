/**
 * Estrae contenuto da un rettangolo nel Word viewer.
 * `rect.rect` / viewportBox sono in pixel CSS relativi alla pagina.
 */

import type { RectSelection, ExtractedContent } from '../../common/types/viewer.types'

export interface ExtractContentFromRectOptions {
  /**
   * Ref all'host del viewer
   */
  hostRef: React.RefObject<HTMLDivElement>
  /**
   * Ref alle pagine (per trovare pageElement)
   */
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  /**
   * Word ha sempre testo nativo
   */
  hasNativeText: boolean
}

/**
 * Estrae testo nativo e screenshot dalla selezione rettangolare Word.
 */
export async function extractContentFromRect(
  rect: RectSelection,
  options: ExtractContentFromRectOptions
): Promise<ExtractedContent> {
  const { hostRef, pageElsRef, hasNativeText } = options

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

  if (hasNativeText) {
    try {
      const pageRect = pageEl.getBoundingClientRect()
      const x0Page = rect.rect.x
      const y0Page = rect.rect.y
      const x1Page = x0Page + rect.rect.width
      const y1Page = y0Page + rect.rect.height

      const walker = document.createTreeWalker(
        pageEl,
        NodeFilter.SHOW_TEXT,
        null
      )

      const textParts: string[] = []
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

  // Screenshot sulla pagina (coordinate già page-relative).
  try {
    const { captureSelectionScreenshotWithFallback } = await import('../../common/utils/screenshot')
    const { fast } = await captureSelectionScreenshotWithFallback(pageEl, viewportBox)

    if (fast) {
      result.metadata = {
        ...result.metadata,
        imageDataUrl: fast
      }
    }
  } catch (error) {
    console.warn('[WORD-EXTRACT] Errore ritaglio immagine:', error)
  }

  return result
}
