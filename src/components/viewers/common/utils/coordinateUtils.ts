/**
 * ✅ Utility comuni per conversioni coordinate
 * Usate da PDF e Word viewers
 */

import { ViewportBox } from '../types/viewer.types'

/**
 * Converte viewportBox (pixel) in coordinate percentuali
 */
export function viewportBoxToPercent(
  viewportBox: ViewportBox,
  hostElement: HTMLElement
): { x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } {
  const hostRect = hostElement.getBoundingClientRect()
  const hostWidth = hostRect.width
  const hostHeight = hostRect.height

  return {
    x0Pct: viewportBox.x / hostWidth,
    y0Pct: viewportBox.y / hostHeight,
    x1Pct: (viewportBox.x + viewportBox.w) / hostWidth,
    y1Pct: (viewportBox.y + viewportBox.h) / hostHeight
  }
}

/**
 * Calcola viewportBox da coordinate mouse (relativo a host)
 */
export function calculateViewportBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  hostElement: HTMLElement
): ViewportBox {
  const hostRect = hostElement.getBoundingClientRect()
  const x = Math.min(startX, endX) - hostRect.left
  const y = Math.min(startY, endY) - hostRect.top
  const w = Math.abs(endX - startX)
  const h = Math.abs(endY - startY)

  return { x, y, w, h }
}

/**
 * Trova numero pagina da elemento DOM
 * Supporta sia PDF (data-page-number) che Word (data-page)
 */
export function getPageNumberFromElement(
  element: HTMLElement,
  hostElement: HTMLElement
): number {
  let current: HTMLElement | null = element
  let page = 1

  while (current && current !== hostElement) {
    // ✅ Prova prima PDF format (data-page-number)
    const pageNumberAttr = current.getAttribute('data-page-number')
    if (pageNumberAttr) {
      const parsed = parseInt(pageNumberAttr, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }

    // ✅ Prova Word format (data-page)
    const pageAttr = current.getAttribute('data-page')
    if (pageAttr) {
      const parsed = parseInt(pageAttr, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }

    current = current.parentElement
  }

  return page
}
