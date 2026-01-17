/**
 * ✅ Utility per catturare screenshot di selezioni HTML
 * Usato principalmente per Word viewer e documenti OCR
 */

/**
 * Cattura uno screenshot VELOCE (scale: 1) per mostrare subito qualcosa
 * ~2-3x più veloce di scale: 2, ideale per feedback immediato
 */
export async function captureElementScreenshotFast(
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
    scale: 1, // ✅ VELOCE: scale 1 invece di 2 (4x meno pixel da processare)
    logging: false,
    removeContainer: true, // ✅ Ottimizzazione
    allowTaint: false
  })

  return canvas.toDataURL('image/png', 0.9) // ✅ Qualità leggermente ridotta per velocità
}

/**
 * Cattura uno screenshot AD ALTA RISOLUZIONE (scale: 2) per qualità finale
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
 * ✅ Mantiene compatibilità con versione precedente (solo alta risoluzione)
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
 * ✅ NUOVO: Cattura screenshot veloce + ad alta risoluzione in background
 * Pattern usato da strumenti professionali: mostra subito qualcosa, migliora la qualità dopo
 *
 * @returns { fast: string, highQuality: Promise<string> }
 * - `fast`: Screenshot veloce (scale: 1) disponibile immediatamente (~0.5-1 sec)
 * - `highQuality`: Promise che risolve con screenshot ad alta risoluzione (scale: 2) in background
 *
 * Uso:
 * ```ts
 * const { fast, highQuality } = await captureSelectionScreenshotWithFallback(container, viewportBox)
 * // Mostra subito 'fast'
 * setImage(fast)
 * // Sostituisci con alta risoluzione quando pronto
 * highQuality.then(highRes => setImage(highRes))
 * ```
 */
export async function captureSelectionScreenshotWithFallback(
  container: HTMLElement,
  viewportBox: { x: number; y: number; w: number; h: number }
): Promise<{ fast: string; highQuality: Promise<string> }> {
  const options = {
    x: viewportBox.x,
    y: viewportBox.y,
    width: viewportBox.w,
    height: viewportBox.h
  }

  // ✅ Screenshot veloce (scale: 1) - mostra subito
  const fast = await captureElementScreenshotFast(container, options)

  // ✅ Screenshot ad alta risoluzione in background (scale: 2)
  // Non await - parte in background mentre l'utente vede già il risultato veloce
  const highQuality = captureElementScreenshot(container, options)

  return { fast, highQuality }
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
