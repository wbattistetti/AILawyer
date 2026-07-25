/**
 * Overlay del rettangolo draft durante il drag.
 * Usato da Word e PDF: porta il box nella root overlay della pagina.
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DraftBox } from '../../common/hooks/useRectSelection'

interface DraftOverlayProps {
  draft: DraftBox | null
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
  hostRef?: React.RefObject<HTMLElement>
}

function resolvePageElement(
  page: number,
  pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>,
  hostRef?: React.RefObject<HTMLElement>
): HTMLElement | null {
  const cached = pageElsRef.current.get(page)
  if (cached && document.contains(cached)) return cached

  const host = hostRef?.current
  const scope: ParentNode = host ?? document

  const byDataPage = scope.querySelector(`[data-page="${page}"]`) as HTMLElement | null
  if (byDataPage) {
    pageElsRef.current.set(page, byDataPage)
    return byDataPage
  }

  const holder = scope.querySelector(`[data-page-number="${page}"]`) as HTMLElement | null
  if (holder) {
    const layer = (holder.closest('.rpv-core__page-layer') as HTMLElement | null)
      || (holder.querySelector('.rpv-core__page-layer') as HTMLElement | null)
      || holder
    pageElsRef.current.set(page, layer)
    return layer
  }

  return null
}

function ensureOverlayRoot(
  page: number,
  pageEl: HTMLElement,
  overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
): HTMLElement {
  const existing = overlayRootsRef.current.get(page)
  if (existing && document.contains(existing) && existing.parentElement === pageEl) {
    return existing
  }
  if (existing) {
    existing.remove()
    overlayRootsRef.current.delete(page)
  }

  const root = document.createElement('div')
  root.className = 'viewer-overlay-root ai-overlay-root'
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '100'
  })

  const computedStyle = window.getComputedStyle(pageEl)
  if (computedStyle.position === 'static') {
    pageEl.style.position = 'relative'
  }

  pageEl.appendChild(root)
  overlayRootsRef.current.set(page, root)
  return root
}

export const DraftOverlay: React.FC<DraftOverlayProps> = ({
  draft,
  pageElsRef,
  overlayRootsRef,
  hostRef
}) => {
  const pageEl = draft ? resolvePageElement(draft.page, pageElsRef, hostRef) : null
  const root = pageEl && draft ? ensureOverlayRoot(draft.page, pageEl, overlayRootsRef) : null

  useEffect(() => {
    if (!draft) return
    console.log('[RECT-SEL][DraftOverlay]', {
      page: draft.page,
      pageElFound: !!pageEl,
      rootReady: !!(root && document.contains(root)),
      pageElClass: pageEl?.className || null,
      bbox: {
        x0Pct: draft.x0Pct,
        y0Pct: draft.y0Pct,
        x1Pct: draft.x1Pct,
        y1Pct: draft.y1Pct
      },
      cachedPages: Array.from(pageElsRef.current.keys()),
      roots: Array.from(overlayRootsRef.current.keys())
    })
  }, [draft, pageEl, root, pageElsRef, overlayRootsRef])

  if (!draft || !pageEl || !root) return null

  let left: string
  let top: string
  let width: string
  let height: string

  if (draft.coordSpace === 'host' && hostRef?.current) {
    const host = hostRef.current
    const hostRect = host.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const offsetX = pageRect.left - hostRect.left
    const offsetY = pageRect.top - hostRect.top

    const x0Page = draft.x0Pct * hostRect.width - offsetX
    const y0Page = draft.y0Pct * hostRect.height - offsetY
    const x1Page = draft.x1Pct * hostRect.width - offsetX
    const y1Page = draft.y1Pct * hostRect.height - offsetY

    const x0Pct = x0Page / pageRect.width
    const y0Pct = y0Page / pageRect.height
    const x1Pct = x1Page / pageRect.width
    const y1Pct = y1Page / pageRect.height

    left = `${x0Pct * 100}%`
    top = `${y0Pct * 100}%`
    width = `${(x1Pct - x0Pct) * 100}%`
    height = `${(y1Pct - y0Pct) * 100}%`
  } else {
    left = `${draft.x0Pct * 100}%`
    top = `${draft.y0Pct * 100}%`
    width = `${(draft.x1Pct - draft.x0Pct) * 100}%`
    height = `${(draft.y1Pct - draft.y0Pct) * 100}%`
  }

  return createPortal(
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        background: 'rgba(59,130,246,0.35)',
        border: '2px solid rgba(59,130,246,1)',
        borderRadius: 2,
        pointerEvents: 'none',
        zIndex: 9999,
        boxSizing: 'border-box'
      }}
    />,
    root
  )
}
