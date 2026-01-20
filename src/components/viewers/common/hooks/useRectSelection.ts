/**
 * ✅ Hook comune per drag rettangolo (OCR-style)
 * Usato da PDF viewer e Word viewer
 * Enterprise-ready: usa useIsolatedGlobalListeners per isolamento completo
 *
 * MODELLO SEMPLIFICATO:
 * 1. Rettangolo → coordinate schermo (sempre)
 * 2. Coordinate schermo → pagina sotto cursore (sempre via elementFromPoint)
 * 3. Pagina → bounding rect (sempre via getBoundingClientRect)
 * 4. Coordinate schermo → coordinate pagina (sempre via sottrazione + normalizzazione)
 * 5. Nessun altro layer di logica
 */

import { useEffect, useRef, useCallback } from 'react'
import { ViewerSelection, ViewportBox, RectSelection } from '../types/viewer.types'
import { calculateViewportBox, getPageNumberFromElement } from '../utils/coordinateUtils'
import { useIsolatedGlobalListeners } from './useIsolatedGlobalListeners'

export interface DraftBox {
  page: number
  x0Pct: number
  y0Pct: number
  x1Pct: number
  y1Pct: number
  /**
   * ✅ Spazio di coordinate: 'page' = relative alla pagina, 'host' = relative al container
   * Se non specificato, assume 'page' per retrocompatibilità
   */
  coordSpace?: 'page' | 'host'
}

export interface UseRectSelectionProps {
  /**
   * ID univoco del viewer (es. docId) - necessario per isolamento
   */
  viewerId: string
  /**
   * Se il viewer è abilitato
   */
  enabled: boolean
  /**
   * Se il viewer è attualmente attivo (visibile/focus)
   * Deve essere passato dal componente padre (es. da DockWorkspace)
   */
  isActive: boolean
  hostRef: React.RefObject<HTMLElement>
  /**
   * ✅ Callback chiamato quando la selezione è completata
   * Riceve RectSelection standardizzata (formato unificato per tutti i viewer)
   */
  onSelection: (selection: RectSelection) => void
  /**
   * Callback opzionale per aggiornare il rettangolo draft durante il drag
   */
  onDraftChange?: (draft: DraftBox | null) => void
  /**
   * ✅ Ref alle pagine (opzionale, usato solo per debug/log, NON come fallback)
   */
  pageElsRef?: React.MutableRefObject<Map<number, HTMLElement>>
  /**
   * Funzione opzionale per verificare se un click è dentro un overlay
   * Se ritorna true, il drag non viene iniziato
   */
  isClickInsideOverlay?: (target: HTMLElement) => boolean
  /**
   * Dimensione minima del rettangolo (default: 10x10 pixel)
   */
  minSize?: number
}

export function useRectSelection({
  viewerId,
  enabled,
  isActive,
  hostRef,
  onSelection,
  onDraftChange,
  pageElsRef, // ✅ Opzionale, solo per debug
  isClickInsideOverlay,
  minSize = 10
}: UseRectSelectionProps) {
  const isSelectingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  // ✅ Helper: trova pagina sotto coordinate schermo (sempre via elementFromPoint)
  const findPageAtPoint = useCallback((clientX: number, clientY: number): {
    pageEl: HTMLElement | null
    pageNumber: number | null
  } => {
    const host = hostRef.current
    if (!host) {
      return { pageEl: null, pageNumber: null }
    }

    // ✅ SEMPRE usa elementFromPoint (non cache)
    const elementAtPoint = document.elementFromPoint(clientX, clientY) as HTMLElement
    if (!elementAtPoint) {
      return { pageEl: null, pageNumber: null }
    }

    // ✅ Risali fino a trovare la pagina (PDF o Word)
    let current: HTMLElement | null = elementAtPoint
    let depth = 0
    while (current && current !== host && depth < 20) {
      // ✅ PDF: .rpv-core__page-layer
      if (current.classList.contains('rpv-core__page-layer')) {
        const pageNumber = getPageNumberFromElement(current, host)
        return { pageEl: current, pageNumber }
      }

      // ✅ Word: [data-page]
      if (current.hasAttribute('data-page')) {
        const pageNumber = getPageNumberFromElement(current, host)
        return { pageEl: current, pageNumber }
      }

      // ✅ PDF: [data-page-number] → cerca .rpv-core__page-layer dentro
      if (current.hasAttribute('data-page-number')) {
        const pageLayer = current.querySelector('.rpv-core__page-layer') as HTMLElement
        if (pageLayer) {
          const pageNumber = getPageNumberFromElement(pageLayer, host)
          return { pageEl: pageLayer, pageNumber }
        }
      }

      current = current.parentElement
      depth++
    }

    return { pageEl: null, pageNumber: null }
  }, [hostRef])

  // ✅ Helper: calcola draft box da pagina trovata
  const calculateDraftBoxFromPage = useCallback((
    pageEl: HTMLElement,
    pageNumber: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): DraftBox | null => {
    // ✅ 2. Ottieni bounding rect (sempre aggiornato)
    const pageRect = pageEl.getBoundingClientRect()

    // ✅ 3. Converti coordinate schermo → coordinate pagina
    const startXPage = startX - pageRect.left
    const startYPage = startY - pageRect.top
    const endXPage = endX - pageRect.left
    const endYPage = endY - pageRect.top

    // ✅ 4. Calcola min/max per rettangolo
    const x0 = Math.min(startXPage, endXPage)
    const y0 = Math.min(startYPage, endYPage)
    const x1 = Math.max(startXPage, endXPage)
    const y1 = Math.max(startYPage, endYPage)

    // ✅ 5. Normalizza in percentuale
    const x0Pct = Math.max(0, Math.min(1, x0 / pageRect.width))
    const y0Pct = Math.max(0, Math.min(1, y0 / pageRect.height))
    const x1Pct = Math.max(0, Math.min(1, x1 / pageRect.width))
    const y1Pct = Math.max(0, Math.min(1, y1 / pageRect.height))

    return {
      page: pageNumber,
      x0Pct,
      y0Pct,
      x1Pct,
      y1Pct,
      coordSpace: 'page'
    }
  }, [])

  // ✅ Helper: calcola draft box (sempre da coordinate schermo)
  const calculateDraftBox = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): DraftBox | null => {
    const host = hostRef.current
    if (!host) return null

    // ✅ 1. Trova pagina sotto punto iniziale (sempre via elementFromPoint)
    const { pageEl, pageNumber } = findPageAtPoint(startX, startY)

    if (!pageEl || !pageNumber) {
      // ✅ Se non trovato, prova punto finale
      const endResult = findPageAtPoint(endX, endY)
      if (endResult.pageEl && endResult.pageNumber) {
        return calculateDraftBoxFromPage(
          endResult.pageEl,
          endResult.pageNumber,
          startX,
          startY,
          endX,
          endY
        )
      }
      return null
    }

    return calculateDraftBoxFromPage(pageEl, pageNumber, startX, startY, endX, endY)
  }, [hostRef, findPageAtPoint, calculateDraftBoxFromPage])

  // ✅ Disabilita selezione testo nativa
  useEffect(() => {
    if (!enabled) return

    const host = hostRef.current
    if (!host) return

    // ✅ Blocca selezione testo
    host.style.setProperty('user-select', 'none', 'important')
    host.style.setProperty('-webkit-user-select', 'none', 'important')
    host.style.setProperty('-moz-user-select', 'none', 'important')
    host.style.setProperty('-ms-user-select', 'none', 'important')

    return () => {
      if (host) {
        host.style.removeProperty('user-select')
        host.style.removeProperty('-webkit-user-select')
        host.style.removeProperty('-moz-user-select')
        host.style.removeProperty('-ms-user-select')
      }
    }
  }, [enabled, hostRef])

  // ✅ Reset completo quando enabled è false o isActive è false
  useEffect(() => {
    if (!enabled || !isActive) {
      isSelectingRef.current = false
      startPosRef.current = null
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (onDraftChange) {
        onDraftChange(null)
      }
    }
  }, [enabled, isActive, onDraftChange])

  // ✅ Helper: reset completo dello stato (usato quando mouse esce dal host)
  const resetState = useCallback(() => {
    isSelectingRef.current = false
    startPosRef.current = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (onDraftChange) {
      onDraftChange(null)
    }
  }, [onDraftChange])

      // ✅ Handler mouse down
      const handleMouseDown = useCallback((e: MouseEvent) => {
        if (!enabled || !isActive) {
          console.warn('[RECT-SEL] ⚠️ MOUSE-DOWN bloccato:', { viewerId, enabled, isActive })
          return
        }
    if (e.button !== 0) return // Solo click sinistro

    const host = hostRef.current
    if (!host) {
      return
    }

    const target = e.target as HTMLElement
    if (isClickInsideOverlay && isClickInsideOverlay(target)) return
    if (target.closest('[data-extract-overlay="true"]') || target.closest('.extract-block-overlay')) return

    isSelectingRef.current = true

    // ✅ Salva coordinate schermo (sempre assolute)
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY
    }

    // ✅ Crea draft iniziale zero-area
    if (onDraftChange) {
      const { pageEl, pageNumber } = findPageAtPoint(e.clientX, e.clientY)

      if (pageNumber) {
        onDraftChange({
          page: pageNumber,
          x0Pct: 0,
          y0Pct: 0,
          x1Pct: 0,
          y1Pct: 0,
          coordSpace: 'page'
        })
      }
    }

    // ✅ Rimuovi selezione testo se presente
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
  }, [enabled, isActive, hostRef, isClickInsideOverlay, onDraftChange, findPageAtPoint, viewerId])

  // ✅ Handler mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) return

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!isSelectingRef.current || !startPosRef.current) return

      const draftBox = calculateDraftBox(
        startPosRef.current.x,
        startPosRef.current.y,
        e.clientX,
        e.clientY
      )

      if (draftBox && onDraftChange) {
        onDraftChange(draftBox)
      }
    })
  }, [calculateDraftBox, onDraftChange])

  // ✅ Handler mouse up
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) return

    const host = hostRef.current
    if (!host) {
      resetState()
      return
    }

    isSelectingRef.current = false

    // ✅ Calcola draft box finale
    const draftBox = calculateDraftBox(
      startPosRef.current.x,
      startPosRef.current.y,
      e.clientX,
      e.clientY
    )

    if (!draftBox) {
      resetState()
      return
    }

    // ✅ Calcola viewport box per screenshot
    const viewportBox = calculateViewportBox(
      startPosRef.current.x,
      startPosRef.current.y,
      e.clientX,
      e.clientY,
      host
    )

    if (viewportBox.w < minSize || viewportBox.h < minSize) {
      resetState()
      return
    }

    // ✅ Crea selezione standardizzata (formato unificato)
    const rectSelection: RectSelection = {
      rect: {
        x: viewportBox.x,
        y: viewportBox.y,
        width: viewportBox.w,
        height: viewportBox.h
      },
      pageIndex: draftBox.page - 1, // ✅ Converti a 0-based
      viewerId,
      bbox: {
        x0Pct: draftBox.x0Pct,
        y0Pct: draftBox.y0Pct,
        x1Pct: draftBox.x1Pct,
        y1Pct: draftBox.y1Pct
      }
    }

    // ✅ Emetti selezione standardizzata
    Promise.resolve(onSelection(rectSelection)).then(() => {
      resetState()
    }).catch((error) => {
      console.error('[RECT-SEL] Errore in onSelection:', error)
      resetState()
    })

    startPosRef.current = null
  }, [hostRef, calculateDraftBox, onSelection, resetState, minSize])

  // ✅ SOLO listener globali isolati (nessun listener locale)
  useIsolatedGlobalListeners({
    viewerId,
    hostRef,
    enabled,
    isActive,
    listeners: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp
    },
    options: {
      capture: false,
      passive: true
    },
    onResetState: resetState
  })

  return {
    isSelectingRef
  }
}
