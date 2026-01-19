/**
 * ✅ Componente per renderizzare il rettangolo draft durante il drag
 * Gestisce automaticamente la conversione host→pagina se coordSpace === 'host'
 */

import React from 'react'
import { createPortal } from 'react-dom'
import type { DraftBox } from '../../common/hooks/useRectSelection'

interface DraftOverlayProps {
  draft: DraftBox | null
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
  hostRef?: React.RefObject<HTMLElement> // ✅ Aggiunto per conversione host→pagina
}

export const DraftOverlay: React.FC<DraftOverlayProps> = ({
  draft,
  pageElsRef,
  overlayRootsRef,
  hostRef
}) => {
  if (!draft) return null

  // ✅ Trova overlay root
  let root = overlayRootsRef.current.get(draft.page)

  // ✅ Fallback: crea root temporaneo se non esiste
  if (!root) {
    const pageEl = pageElsRef.current.get(draft.page)
    if (pageEl) {
      root = document.createElement('div')
      root.className = 'viewer-overlay-root'
      Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '100'
      })

      const computedStyle = window.getComputedStyle(pageEl)
      if (computedStyle.position === 'static') {
        pageEl.style.position = 'relative'
      }

      pageEl.appendChild(root)
      overlayRootsRef.current.set(draft.page, root)
    } else {
      console.warn('[DraftOverlay] Root e pageEl non trovati per pagina', {
        page: draft.page,
        availablePages: Array.from(overlayRootsRef.current.keys()),
        pageEls: Array.from(pageElsRef.current.keys())
      })
      return null
    }
  }

  // ✅ Calcola coordinate finali
  let left: string
  let top: string
  let width: string
  let height: string

  // ✅ Se coordSpace === 'host', converti host→pagina
  if (draft.coordSpace === 'host' && hostRef?.current) {
    const host = hostRef.current
    let pageEl = pageElsRef.current.get(draft.page)

    // ✅ Se pagina non trovata in pageElsRef, prova a cercarla direttamente nel DOM
    if (!pageEl) {
      const found = host.querySelector(`[data-page="${draft.page}"]`) as HTMLElement
      if (found) {
        pageEl = found
        // ✅ Aggiorna pageElsRef per prossime volte
        pageElsRef.current.set(draft.page, found)
      }
    }

    if (pageEl) {
      const hostRect = host.getBoundingClientRect()
      const pageRect = pageEl.getBoundingClientRect()

      // ✅ Offset tra host e pagina
      const offsetX = pageRect.left - hostRect.left
      const offsetY = pageRect.top - hostRect.top

      // ✅ Converti percentuali host in pixel host
      const hostWidth = hostRect.width
      const hostHeight = hostRect.height
      const x0Host = draft.x0Pct * hostWidth
      const y0Host = draft.y0Pct * hostHeight
      const x1Host = draft.x1Pct * hostWidth
      const y1Host = draft.y1Pct * hostHeight

      // ✅ Converti pixel host in pixel pagina
      const x0Page = x0Host - offsetX
      const y0Page = y0Host - offsetY
      const x1Page = x1Host - offsetX
      const y1Page = y1Host - offsetY

      // ✅ Converti pixel pagina in percentuali pagina
      const pageWidth = pageRect.width
      const pageHeight = pageRect.height
      const x0Pct = x0Page / pageWidth
      const y0Pct = y0Page / pageHeight
      const x1Pct = x1Page / pageWidth
      const y1Pct = y1Page / pageHeight

      // ✅ Debug log (solo se necessario)
      // console.log('[DraftOverlay] Conversione host→pagina:', {
      //   page: draft.page,
      //   coordSpace: draft.coordSpace,
      //   hostRect: { left: hostRect.left, top: hostRect.top, width: hostWidth, height: hostHeight },
      //   pageRect: { left: pageRect.left, top: pageRect.top, width: pageWidth, height: pageHeight },
      //   offsetX, offsetY,
      //   draft: { x0Pct: draft.x0Pct, y0Pct: draft.y0Pct, x1Pct: draft.x1Pct, y1Pct: draft.y1Pct },
      //   x0Host, y0Host, x1Host, y1Host,
      //   x0Page, y0Page, x1Page, y1Page,
      //   x0Pct, y0Pct, x1Pct, y1Pct
      // })

      left = `${x0Pct * 100}%`
      top = `${y0Pct * 100}%`
      width = `${(x1Pct - x0Pct) * 100}%`
      height = `${(y1Pct - y0Pct) * 100}%`
    } else {
      // ✅ Fallback: usa coordinate host direttamente (non ideale ma meglio di niente)
      console.warn('[DraftOverlay] Pagina non trovata, uso coordinate host:', {
        page: draft.page,
        availablePages: Array.from(pageElsRef.current.keys())
      })
      left = `${draft.x0Pct * 100}%`
      top = `${draft.y0Pct * 100}%`
      width = `${(draft.x1Pct - draft.x0Pct) * 100}%`
      height = `${(draft.y1Pct - draft.y0Pct) * 100}%`
    }
  } else {
    // ✅ coordSpace === 'page' o non specificato: usa direttamente (come PDF viewer)
    // console.log('[DraftOverlay] Usa coordinate pagina direttamente:', {
    //   page: draft.page,
    //   coordSpace: draft.coordSpace,
    //   x0Pct: draft.x0Pct, y0Pct: draft.y0Pct, x1Pct: draft.x1Pct, y1Pct: draft.y1Pct
    // })
    left = `${draft.x0Pct * 100}%`
    top = `${draft.y0Pct * 100}%`
    width = `${(draft.x1Pct - draft.x0Pct) * 100}%`
    height = `${(draft.y1Pct - draft.y0Pct) * 100}%`
  }

  const node = (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        background: 'rgba(59,130,246,0.3)',
        border: 'none',
        borderRadius: 2,
        pointerEvents: 'none'
      }}
    />
  )

  return createPortal(node, root)
}
