/**
 * Hook comune per drag rettangolo (PDF, Word, futuri viewer).
 *
 * Modello:
 * 1. Coordinate schermo assolute
 * 2. Pagina sotto il punto iniziale (fissata per tutto il drag)
 * 3. Percentuali relative alla pagina
 * 4. Commit → RectSelection standardizzata
 *
 * Eventi: Pointer Events + listener su window durante il drag
 * (mousemove/mouseup restano affidabili anche fuori dall'host).
 */

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { RectSelection } from '../types/viewer.types'
import { calculateViewportBox } from '../utils/coordinateUtils'

export interface DraftBox {
  page: number
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
  /**
   * 'page' = relative alla pagina (default).
   * 'host' = legacy, convertito in overlay se necessario.
   */
  coordSpace?: 'page' | 'host'
}

export interface UseRectSelectionProps {
  viewerId: string
  enabled: boolean
  hostRef: React.RefObject<HTMLElement>
  /** Incrementa quando l'host reale è pronto (riattacca i listener). */
  hostReadyTick?: number
  onSelection: (selection: RectSelection) => void
  onDraftChange?: (draft: DraftBox | null) => void
  pageElsRef?: React.MutableRefObject<Map<number, HTMLElement>>
  isClickInsideOverlay?: (target: HTMLElement) => boolean
  isOverlayOpen?: boolean
  minSize?: number
  /** Log diagnostici in console (prefisso [RECT-SEL]). */
  debug?: boolean
}

export function useRectSelection({
  viewerId,
  enabled,
  hostRef,
  hostReadyTick = 0,
  onSelection,
  onDraftChange,
  pageElsRef: _pageElsRef,
  isClickInsideOverlay,
  isOverlayOpen = false,
  minSize = 10,
  debug = false
}: UseRectSelectionProps) {
  const isSelectingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const startPageRef = useRef<{ pageEl: HTMLElement; pageNumber: number } | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const windowListenersAttachedRef = useRef(false)
  const moveLogCountRef = useRef(0)

  const log = useCallback((message: string, data?: Record<string, unknown>) => {
    if (!debug) return
    if (data) console.log(`[RECT-SEL][${viewerId}] ${message}`, data)
    else console.log(`[RECT-SEL][${viewerId}] ${message}`)
  }, [debug, viewerId])

  const getPageNumberLoose = (element: HTMLElement | null): number | null => {
    if (!element) return null

    // 1) Attributo sul nodo o su un antenato
    const holderUp = element.closest('[data-page-number], [data-page]') as HTMLElement | null
    if (holderUp) {
      const raw = holderUp.getAttribute('data-page-number') || holderUp.getAttribute('data-page')
      const parsed = raw ? parseInt(raw, 10) : NaN
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }

    // 2) In rpv il data-page-number è spesso FIGLIO di .rpv-core__page-layer
    const holderDown = element.querySelector?.('[data-page-number], [data-page]') as HTMLElement | null
    if (holderDown) {
      const raw = holderDown.getAttribute('data-page-number') || holderDown.getAttribute('data-page')
      const parsed = raw ? parseInt(raw, 10) : NaN
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }

    // 3) Fallback aria-label "Page N" / "Pagina N" (come usePdfOverlays)
    let current: HTMLElement | null = element
    for (let i = 0; i < 8 && current; i++) {
      const aria = current.getAttribute('aria-label') || ''
      const match = aria.match(/\bP(?:age|agina)\s+(\d+)/i)
      if (match) {
        const parsed = parseInt(match[1], 10)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
      current = current.parentElement
    }

    return null
  }

  const resolvePageFromElement = (element: HTMLElement | null): {
    pageEl: HTMLElement | null
    pageNumber: number | null
  } => {
    if (!element) return { pageEl: null, pageNumber: null }

    const pageLayer = (element.classList.contains('rpv-core__page-layer')
      ? element
      : element.closest('.rpv-core__page-layer') as HTMLElement | null)
      || null

    if (pageLayer) {
      const pageNumber = getPageNumberLoose(pageLayer) ?? 1
      return { pageEl: pageLayer, pageNumber }
    }

    const dataPage = element.closest('[data-page]') as HTMLElement | null
    if (dataPage) {
      const pageNumber = getPageNumberLoose(dataPage)
      if (pageNumber) return { pageEl: dataPage, pageNumber }
    }

    const dataPageNumber = element.closest('[data-page-number]') as HTMLElement | null
    if (dataPageNumber) {
      const layer = (dataPageNumber.closest('.rpv-core__page-layer') as HTMLElement | null)
        || (dataPageNumber.querySelector('.rpv-core__page-layer') as HTMLElement | null)
        || dataPageNumber
      const pageNumber = getPageNumberLoose(layer) ?? getPageNumberLoose(dataPageNumber) ?? 1
      return { pageEl: layer, pageNumber }
    }

    return { pageEl: null, pageNumber: null }
  }

  const findPageFromEventPath = (e: Event): { pageEl: HTMLElement | null; pageNumber: number | null } => {
    const path = ((e as PointerEvent).composedPath?.() || []) as EventTarget[]
    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue
      const resolved = resolvePageFromElement(node)
      if (resolved.pageEl && resolved.pageNumber) return resolved
    }
    return { pageEl: null, pageNumber: null }
  }

  const findPageAtPoint = useCallback((clientX: number, clientY: number): {
    pageEl: HTMLElement | null
    pageNumber: number | null
  } => {
    const host = hostRef.current
    if (!host) {
      return { pageEl: null, pageNumber: null }
    }

    const elementAtPoint = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!elementAtPoint) {
      return { pageEl: null, pageNumber: null }
    }

    const resolved = resolvePageFromElement(elementAtPoint)
    if (resolved.pageEl && resolved.pageNumber) return resolved

    // Ultimo fallback: prima page-layer nel host sotto il punto
    const layers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
    for (const layer of layers) {
      const r = layer.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return { pageEl: layer, pageNumber: getPageNumberLoose(layer) ?? 1 }
      }
    }

    const wordPages = Array.from(host.querySelectorAll('[data-page]')) as HTMLElement[]
    for (const pageEl of wordPages) {
      const r = pageEl.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const pageNumber = getPageNumberLoose(pageEl)
        if (pageNumber) return { pageEl, pageNumber }
      }
    }

    return { pageEl: null, pageNumber: null }
  }, [hostRef])

  const calculateDraftBoxFromPage = useCallback((
    pageEl: HTMLElement,
    pageNumber: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): DraftBox => {
    const pageRect = pageEl.getBoundingClientRect()
    const startXPage = startX - pageRect.left
    const startYPage = startY - pageRect.top
    const endXPage = endX - pageRect.left
    const endYPage = endY - pageRect.top

    const x0 = Math.min(startXPage, endXPage)
    const y0 = Math.min(startYPage, endYPage)
    const x1 = Math.max(startXPage, endXPage)
    const y1 = Math.max(startYPage, endYPage)

    return {
      page: pageNumber,
      x0Pct: x0 / pageRect.width,
      y0Pct: y0 / pageRect.height,
      x1Pct: x1 / pageRect.width,
      y1Pct: y1 / pageRect.height,
      coordSpace: 'page'
    }
  }, [])

  const resolveStartPage = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { pageEl: HTMLElement; pageNumber: number } | null => {
    if (startPageRef.current) {
      if (!document.contains(startPageRef.current.pageEl)) {
        startPageRef.current = null
      } else {
        return startPageRef.current
      }
    }

    const atStart = findPageAtPoint(startX, startY)
    if (atStart.pageEl && atStart.pageNumber) {
      startPageRef.current = { pageEl: atStart.pageEl, pageNumber: atStart.pageNumber }
      return startPageRef.current
    }

    const atEnd = findPageAtPoint(endX, endY)
    if (atEnd.pageEl && atEnd.pageNumber) {
      startPageRef.current = { pageEl: atEnd.pageEl, pageNumber: atEnd.pageNumber }
      return startPageRef.current
    }

    return null
  }, [findPageAtPoint])

  const calculateDraftBox = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): DraftBox | null => {
    if (!hostRef.current) return null
    const page = resolveStartPage(startX, startY, endX, endY)
    if (!page) return null
    return calculateDraftBoxFromPage(page.pageEl, page.pageNumber, startX, startY, endX, endY)
  }, [hostRef, resolveStartPage, calculateDraftBoxFromPage])

  const resetState = useCallback(() => {
    isSelectingRef.current = false
    startPosRef.current = null
    startPageRef.current = null
    activePointerIdRef.current = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    onDraftChange?.(null)
    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()
  }, [onDraftChange])

  useEffect(() => {
    if (!enabled) return
    const host = hostRef.current
    if (!host) return

    host.style.setProperty('user-select', 'none', 'important')
    host.style.setProperty('-webkit-user-select', 'none', 'important')
    host.style.setProperty('-moz-user-select', 'none', 'important')
    host.style.setProperty('-ms-user-select', 'none', 'important')

    return () => {
      host.style.removeProperty('user-select')
      host.style.removeProperty('-webkit-user-select')
      host.style.removeProperty('-moz-user-select')
      host.style.removeProperty('-ms-user-select')
    }
  }, [enabled, hostRef])

  useEffect(() => {
    if (!enabled) {
      resetState()
    }
  }, [enabled, resetState])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) return
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!isSelectingRef.current || !startPosRef.current) return
      const draftBox = calculateDraftBox(
        startPosRef.current.x,
        startPosRef.current.y,
        e.clientX,
        e.clientY
      )
      if (moveLogCountRef.current < 3) {
        moveLogCountRef.current += 1
        log('pointermove', {
          n: moveLogCountRef.current,
          hasDraft: !!draftBox,
          page: draftBox?.page ?? null
        })
      }
      if (draftBox) onDraftChange?.(draftBox)
    })
  }, [calculateDraftBox, onDraftChange, log])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) return
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return

    const host = hostRef.current
    log('pointerup', {
      hasHost: !!host,
      startPage: startPageRef.current?.pageNumber ?? null
    })
    if (!host) {
      resetState()
      return
    }

    isSelectingRef.current = false
    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()

    const draftBox = calculateDraftBox(
      startPosRef.current.x,
      startPosRef.current.y,
      e.clientX,
      e.clientY
    )

    if (!draftBox) {
      log('pointerup: draft assente → reset')
      resetState()
      return
    }

    const viewportBox = calculateViewportBox(
      startPosRef.current.x,
      startPosRef.current.y,
      e.clientX,
      e.clientY,
      host
    )

    if (viewportBox.w < minSize || viewportBox.h < minSize) {
      log('pointerup: troppo piccolo', { w: viewportBox.w, h: viewportBox.h })
      resetState()
      return
    }

    const rectSelection: RectSelection = {
      rect: {
        x: viewportBox.x,
        y: viewportBox.y,
        width: viewportBox.w,
        height: viewportBox.h
      },
      pageIndex: draftBox.page - 1,
      viewerId,
      bbox: {
        x0Pct: draftBox.x0Pct,
        y0Pct: draftBox.y0Pct,
        x1Pct: draftBox.x1Pct,
        y1Pct: draftBox.y1Pct
      }
    }

    startPosRef.current = null
    activePointerIdRef.current = null
    log('pointerup: commit', { pageIndex: rectSelection.pageIndex, bbox: rectSelection.bbox })

    Promise.resolve(onSelection(rectSelection)).then(() => {
      resetState()
    }).catch((error) => {
      console.error('[RECT-SEL] Errore in onSelection:', error)
      resetState()
    })
  }, [hostRef, calculateDraftBox, onSelection, resetState, minSize, viewerId, log])

  const detachWindowListenersRef = useRef<() => void>(() => {})

  const attachWindowListeners = useCallback(() => {
    if (windowListenersAttachedRef.current) return
    const onMove = (e: PointerEvent) => handlePointerMove(e)
    const onUp = (e: PointerEvent) => {
      handlePointerUp(e)
      detachWindowListenersRef.current()
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    windowListenersAttachedRef.current = true
    detachWindowListenersRef.current = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      windowListenersAttachedRef.current = false
    }
  }, [handlePointerMove, handlePointerUp])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabled) {
      log('pointerdown ignorato: disabled')
      return
    }
    if (e.button !== 0) return
    if (isOverlayOpen) {
      log('pointerdown ignorato: overlay aperto')
      return
    }

    const host = hostRef.current
    if (!host) {
      log('pointerdown ignorato: host null')
      return
    }

    const target = e.target as HTMLElement
    if (isClickInsideOverlay?.(target)) {
      log('pointerdown ignorato: click su overlay')
      return
    }

    e.stopPropagation()
    isSelectingRef.current = true
    activePointerIdRef.current = e.pointerId
    startPosRef.current = { x: e.clientX, y: e.clientY }
    moveLogCountRef.current = 0

    const { pageEl: startPageEl, pageNumber: startPageNumber } = findPageFromEventPath(e)
    if (startPageEl && startPageNumber) {
      startPageRef.current = { pageEl: startPageEl, pageNumber: startPageNumber }
    } else {
      const fallback = findPageAtPoint(e.clientX, e.clientY)
      if (fallback.pageEl && fallback.pageNumber) {
        startPageRef.current = { pageEl: fallback.pageEl, pageNumber: fallback.pageNumber }
      } else {
        startPageRef.current = null
      }
    }

    log('pointerdown', {
      target: target?.className || target?.tagName,
      page: startPageRef.current?.pageNumber ?? null,
      pageElTag: startPageRef.current?.pageEl?.className || startPageRef.current?.pageEl?.tagName || null,
      hostTag: host.className || host.tagName
    })

    if (onDraftChange && startPageRef.current) {
      const draftBox = calculateDraftBoxFromPage(
        startPageRef.current.pageEl,
        startPageRef.current.pageNumber,
        e.clientX,
        e.clientY,
        e.clientX,
        e.clientY
      )
      onDraftChange(draftBox)
    } else if (!startPageRef.current) {
      log('pointerdown: pagina non trovata → nessun draft')
    }

    try {
      target.setPointerCapture?.(e.pointerId)
    } catch {
      // setPointerCapture può fallire su alcuni target; i listener window coprono il caso
    }
    attachWindowListeners()

    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()
  }, [
    enabled,
    hostRef,
    isClickInsideOverlay,
    isOverlayOpen,
    onDraftChange,
    findPageAtPoint,
    calculateDraftBoxFromPage,
    attachWindowListeners,
    log
  ])

  const handlePointerDownRef = useRef(handlePointerDown)
  useEffect(() => {
    handlePointerDownRef.current = handlePointerDown
  }, [handlePointerDown])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) {
      if (debug) {
        console.log(`[RECT-SEL][${viewerId}] listeners NON attaccati: host null`, { hostReadyTick })
      }
      return
    }

    const onDown = (e: PointerEvent) => handlePointerDownRef.current(e)
    host.addEventListener('pointerdown', onDown, true)
    if (debug) {
      console.log(`[RECT-SEL][${viewerId}] listeners attaccati su host`, {
        hostReadyTick,
        hostClass: host.className,
        tag: host.tagName
      })
    }

    return () => {
      host.removeEventListener('pointerdown', onDown, true)
      detachWindowListenersRef.current()
    }
  }, [viewerId, hostReadyTick, hostRef, debug])

  return {
    isSelectingRef
  }
}
