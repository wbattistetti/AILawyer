/**
 * ✅ Utility per catturare screenshot di selezioni HTML
 * Usato principalmente per Word viewer e documenti OCR
 */

/**
 * Cattura uno screenshot di un elemento HTML o di una regione specifica
 */
export async function captureElementScreenshot(
  element: HTMLElement,
  options?: {
    x?: number
    y?: number
    width?: number
    height?: number
    useCORS?: boolean
    backgroundColor?: string
  }
): Promise<string> {
  // ✅ Lazy import di html2canvas per ridurre bundle size
  const html2canvas = (await import('html2canvas')).default

  const canvas = await html2canvas(element, {
    x: options?.x ?? 0,
    y: options?.y ?? 0,
    width: options?.width,
    height: options?.height,
    useCORS: options?.useCORS ?? true,
    backgroundColor: options?.backgroundColor ?? '#ffffff',
    scale: 2, // ✅ Alta risoluzione per screenshot
    logging: false
  })

  return canvas.toDataURL('image/png', 1.0)
}

/**
 * Cattura uno screenshot di una selezione basata su viewportBox
 */
export async function captureSelectionScreenshot(
  container: HTMLElement,
  viewportBox: { x: number; y: number; w: number; h: number }
): Promise<string> {
  return captureElementScreenshot(container, {
    x: viewportBox.x,
    y: viewportBox.y,
    width: viewportBox.w,
    height: viewportBox.h
  })
}

/**
 * Cattura uno screenshot di un elemento specifico (per Word: paragrafo, tabella, etc.)
 */
export async function captureElementScreenshotById(
  elementId: string,
  options?: {
    useCORS?: boolean
    backgroundColor?: string
  }
): Promise<string | null> {
  const element = document.getElementById(elementId)
  if (!element) {
    console.warn(`[screenshot] Elemento con id "${elementId}" non trovato`)
    return null
  }

  const rect = element.getBoundingClientRect()
  const container = element.closest('.viewer-container') as HTMLElement
  if (!container) {
    console.warn('[screenshot] Container viewer non trovato')
    return null
  }

  const containerRect = container.getBoundingClientRect()
  const relativeX = rect.left - containerRect.left
  const relativeY = rect.top - containerRect.top

  return captureElementScreenshot(container, {
    x: relativeX,
    y: relativeY,
    width: rect.width,
    height: rect.height,
    useCORS: options?.useCORS ?? true,
    backgroundColor: options?.backgroundColor ?? '#ffffff'
  })
}
