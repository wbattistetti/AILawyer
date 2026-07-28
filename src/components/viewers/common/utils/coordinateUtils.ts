/**
 * ✅ Utility comuni per conversioni coordinate
 * Usate da PDF e Word viewers
 */

import { ViewportBox } from '../types/viewer.types'

/**
 * Converte viewportBox (pixel CSS relativi a `relativeTo`) in percentuali 0–1.
 */
export function viewportBoxToPercent(
  viewportBox: ViewportBox,
  relativeTo: HTMLElement
): { x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } {
  const rect = relativeTo.getBoundingClientRect()
  const width = rect.width
  const height = rect.height

  if (width <= 0 || height <= 0) {
    throw new Error('viewportBoxToPercent: element has zero size')
  }

  return {
    x0Pct: viewportBox.x / width,
    y0Pct: viewportBox.y / height,
    x1Pct: (viewportBox.x + viewportBox.w) / width,
    y1Pct: (viewportBox.y + viewportBox.h) / height
  }
}

/**
 * Calcola viewportBox da coordinate client relative a un elemento
 * (tipicamente la pagina del documento, non lo scroll host).
 */
export function calculateViewportBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  relativeTo: HTMLElement
): ViewportBox {
  const rect = relativeTo.getBoundingClientRect()
  const x = Math.min(startX, endX) - rect.left
  const y = Math.min(startY, endY) - rect.top
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
