/**
 * ✅ Hook comune per gestione overlay roots
 * Usato da PDF e Word viewers
 */

import { useEffect, useRef } from 'react'

export interface UseViewerOverlaysProps {
  hostRef: React.RefObject<HTMLElement>
  /**
   * Selettore per trovare gli elementi pagina (es: '[data-page-number]' o '[data-page]')
   */
  pageSelector: string
  /**
   * Funzione per estrarre il numero pagina da un elemento
   */
  getPageNumber: (element: HTMLElement) => number | null
  /**
   * Funzione per trovare il container dove appendere l'overlay root
   * Se non fornita, usa l'elemento pagina stesso
   */
  getOverlayContainer?: (pageElement: HTMLElement) => HTMLElement | null
}

export interface UseViewerOverlaysReturn {
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
}

export function useViewerOverlays({
  hostRef,
  pageSelector,
  getPageNumber,
  getOverlayContainer
}: UseViewerOverlaysProps): UseViewerOverlaysReturn {
  const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
  const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const ensureRoots = () => {
      // ✅ Trova elementi pagina
      const pages = Array.from(host.querySelectorAll(pageSelector)) as HTMLElement[]

      // ✅ Debug: verifica se trova pagine
      if (pages.length === 0) {
        // Non loggare continuamente, solo se c'è un problema
        return
      }

      for (const pageEl of pages) {
        const pageNum = getPageNumber(pageEl)
        if (!pageNum || pageNum <= 0) continue

        pageElsRef.current.set(pageNum, pageEl)

        // ✅ Trova container per overlay
        const container = getOverlayContainer ? getOverlayContainer(pageEl) : pageEl
        if (!container) continue

        // ✅ Crea overlay root se non esiste
        let root = overlayRootsRef.current.get(pageNum)
        if (!root) {
          root = document.createElement('div')
          root.className = 'viewer-overlay-root'
          Object.assign(root.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '100'
          })

          // ✅ Assicura che il container abbia position relative
          if (container.style.position !== 'relative' && container.style.position !== 'absolute') {
            container.style.position = 'relative'
          }

          container.appendChild(root)
          overlayRootsRef.current.set(pageNum, root)
        }
      }
    }

    ensureRoots()
    const mo = new MutationObserver(() => ensureRoots())
    mo.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-page', 'data-page-number']
    })

    return () => {
      mo.disconnect()
    }
  }, [hostRef, pageSelector, getPageNumber, getOverlayContainer])

  return {
    pageElsRef,
    overlayRootsRef
  }
}
