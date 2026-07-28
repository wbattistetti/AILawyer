/**
 * Utility per catturare screenshot di selezioni HTML
 * Usato principalmente per Word viewer e documenti OCR.
 * L'output viene normalizzato alla dimensione CSS della selezione (niente zoom fantasma).
 */

/**
 * Ridimensiona un canvas alla dimensione CSS della selezione.
 * html2canvas con scale>1 produce pixel HiDPI; senza questo l'<img> appare ingrandita.
 */
function toDisplaySizedDataUrl(
  source: HTMLCanvasElement,
  displayW: number,
  displayH: number,
  quality = 0.95
): string {
  const w = Math.max(1, Math.round(displayW))
  const h = Math.max(1, Math.round(displayH))
  if (source.width === w && source.height === h) {
    return source.toDataURL('image/png', quality)
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) {
    throw new Error('toDisplaySizedDataUrl: cannot get 2d context')
  }
  ctx.drawImage(source, 0, 0, w, h)
  return out.toDataURL('image/png', quality)
}

/**
 * Cattura uno screenshot VELOCE (scale: 1) per mostrare subito qualcosa
 * ~2-3x più veloce di scale: 2, ideale per feedback immediato
 * ⚠️ NOTA: Per Word viewer, questa funzione può risultare nera - usa captureWordScreenshot invece
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
    backgroundColor: options?.backgroundColor ?? (() => {
      // ✅ Usa CSS variable del tema invece di #ffffff hardcoded
      const bgValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      return bgValue ? `hsl(${bgValue})` : '#ffffff' // Fallback a bianco se non disponibile
    })(),
    scale: 1,
    logging: false,
    allowTaint: false,
    ignoreElements: (el) => {
      return el.classList?.contains('extract-block-overlay') || false
    }
  })

  const displayW = options?.width ?? canvas.width
  const displayH = options?.height ?? canvas.height
  return toDisplaySizedDataUrl(canvas, displayW, displayH, 0.9)
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
    backgroundColor: options?.backgroundColor ?? (() => {
      // ✅ Usa CSS variable del tema invece di #ffffff hardcoded
      const bgValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      return bgValue ? `hsl(${bgValue})` : '#ffffff' // Fallback a bianco se non disponibile
    })(),
    scale: 2,
    logging: false,
    ignoreElements: (el) => {
      return el.classList?.contains('extract-block-overlay') || false
    }
  })

  const displayW = options?.width ?? canvas.width
  const displayH = options?.height ?? canvas.height
  return toDisplaySizedDataUrl(canvas, displayW, displayH, 1.0)
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
 * ✅ NUOVO: Cattura screenshot ottimizzato per Word viewer
 * Per Word, usa sempre scale: 2 perché scale: 1 risulta nero
 * Rileva automaticamente il colore di sfondo reale del documento
 */
async function captureWordScreenshot(
  container: HTMLElement,
  viewportBox: { x: number; y: number; w: number; h: number }
): Promise<string> {
  const html2canvas = (await import('html2canvas')).default

  // ✅ Rileva il colore di sfondo reale del documento Word
  const wordPage = container.querySelector('.word-page') as HTMLElement | null
  const computedBg = wordPage
    ? window.getComputedStyle(wordPage).backgroundColor
    : window.getComputedStyle(container).backgroundColor

  // ✅ Se il background è trasparente o rgba(0,0,0,0), usa CSS variable del tema
  const bgValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  const themeBg = bgValue ? `hsl(${bgValue})` : '#ffffff' // Fallback a bianco se non disponibile
  const backgroundColor = computedBg === 'rgba(0, 0, 0, 0)' || !computedBg
    ? themeBg
    : computedBg

  const canvas = await html2canvas(container, {
    x: viewportBox.x,
    y: viewportBox.y,
    width: viewportBox.w,
    height: viewportBox.h,
    useCORS: true,
    backgroundColor: backgroundColor,
    scale: 1.5,
    logging: false,
    allowTaint: false,
    ignoreElements: (el) => {
      return el.classList?.contains('extract-block-overlay') || false
    }
  })

  return toDisplaySizedDataUrl(canvas, viewportBox.w, viewportBox.h, 0.95)
}

/**
 * ✅ NUOVO: Cattura screenshot veloce + ad alta risoluzione in background
 * Pattern usato da strumenti professionali: mostra subito qualcosa, migliora la qualità dopo
 *
 * IMPORTANTE: Per Word viewer, usa sempre alta risoluzione (scale: 1 risulta nero)
 *
 * @returns { fast: string, highQuality: Promise<string> }
 * - `fast`: Screenshot veloce (scale: 1) disponibile immediatamente (~0.5-1 sec)
 *   Per Word: usa scale: 2 perché scale: 1 risulta nero
 * - `highQuality`: Promise che risolve con screenshot ad alta risoluzione (scale: 2) in background
 *   Per Word: è la stessa cosa di `fast`
 *
 * Uso:
 * ```ts
 * const { fast, highQuality } = await captureSelectionScreenshotWithFallback(container, viewportBox)
 * // Mostra subito 'fast'
 * setImage(fast)
 * // Sostituisci con alta risoluzione quando pronto (solo per PDF/altri, non per Word)
 * highQuality.then(highRes => setImage(highRes))
 * ```
 */
export async function captureSelectionScreenshotWithFallback(
  container: HTMLElement,
  viewportBox: { x: number; y: number; w: number; h: number }
): Promise<{ fast: string; highQuality: Promise<string> }> {
  // ✅ Verifica se è un Word viewer
  const isWordViewer = container.classList.contains('word-viewer-container') ||
                       container.querySelector('.word-page') !== null

  if (isWordViewer) {
    // ✅ Per Word, usa sempre alta risoluzione (scale: 2)
    // scale: 1 risulta nero, quindi non ha senso usare lo screenshot veloce
    const highQuality = captureWordScreenshot(container, viewportBox)
    // ✅ Per Word, "fast" e "highQuality" sono la stessa cosa
    return { fast: await highQuality, highQuality }
  } else {
    // ✅ Per PDF/altri, usa il pattern veloce + alta risoluzione
    const options = {
      x: viewportBox.x,
      y: viewportBox.y,
      width: viewportBox.w,
      height: viewportBox.h
    }
    const fast = await captureElementScreenshotFast(container, options)
    const highQuality = captureElementScreenshot(container, options)
    return { fast, highQuality }
  }
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
    backgroundColor: options?.backgroundColor ?? (() => {
      // ✅ Usa CSS variable del tema invece di #ffffff hardcoded
      const bgValue = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      return bgValue ? `hsl(${bgValue})` : '#ffffff' // Fallback a bianco se non disponibile
    })()
  })
}
