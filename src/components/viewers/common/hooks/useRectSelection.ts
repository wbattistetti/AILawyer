/**
 * ✅ Hook comune per drag rettangolo (OCR-style)
 * Usato da PDF viewer (selectKind='OCR') e Word viewer
 * Enterprise-ready: usa useIsolatedGlobalListeners per isolamento completo
 */

import { useEffect, useRef, useCallback } from 'react'
import { ViewerSelection, ViewportBox } from '../types/viewer.types'
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
  onSelection: (selection: ViewerSelection) => void
  /**
   * Callback opzionale per aggiornare il rettangolo draft durante il drag
   */
  onDraftChange?: (draft: DraftBox | null) => void
  /**
   * ✅ Ref alle pagine per calcolare coordinate rispetto alla pagina (come PDF viewer)
   * Se fornito, calcola coordinate rispetto alla pagina; altrimenti usa host come fallback
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
  pageElsRef, // ✅ AGGIUNTO
  isClickInsideOverlay,
  minSize = 10
}: UseRectSelectionProps) {
  const isSelectingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const currentPageRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  // ✅ Helper: calcola coordinate rispetto alla pagina o host
  const calculateDraftBox = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    page: number
  ): DraftBox | null => {
    // ✅ Se abbiamo pageElsRef, prova a calcolare rispetto alla pagina
    if (pageElsRef) {
      const pageEl = pageElsRef.current.get(page)
      if (pageEl) {
        const pageRect = pageEl.getBoundingClientRect()

        // ✅ IMPORTANTE: clientX/clientY sono coordinate assolute rispetto al viewport
        // Converti in coordinate relative alla pagina
        const startXPage = startX - pageRect.left
        const startYPage = startY - pageRect.top
        const endXPage = endX - pageRect.left
        const endYPage = endY - pageRect.top

        // ✅ Calcola min/max per ottenere angolo in alto-sx e basso-dx
        const x0 = Math.min(startXPage, endXPage)
        const y0 = Math.min(startYPage, endYPage)
        const x1 = Math.max(startXPage, endXPage)
        const y1 = Math.max(startYPage, endYPage)

        // ✅ Converti in percentuali (clamp tra 0 e 1)
        const x0Pct = Math.max(0, Math.min(1, x0 / pageRect.width))
        const y0Pct = Math.max(0, Math.min(1, y0 / pageRect.height))
        const x1Pct = Math.max(0, Math.min(1, x1 / pageRect.width))
        const y1Pct = Math.max(0, Math.min(1, y1 / pageRect.height))

        return {
          page,
          x0Pct,
          y0Pct,
          x1Pct,
          y1Pct,
          coordSpace: 'page' // ✅ Marca come coordinate pagina
        }
      }
    }

    // ✅ Fallback: calcola rispetto al host
    const host = hostRef.current
    if (!host) return null

    const hostRect = host.getBoundingClientRect()
    const startXHost = startX - hostRect.left
    const startYHost = startY - hostRect.top
    const endXHost = endX - hostRect.left
    const endYHost = endY - hostRect.top

    // ✅ Calcola min/max per ottenere angolo in alto-sx e basso-dx
    const x0 = Math.min(startXHost, endXHost)
    const y0 = Math.min(startYHost, endYHost)
    const x1 = Math.max(startXHost, endXHost)
    const y1 = Math.max(startYHost, endYHost)

    const x0Pct = Math.max(0, Math.min(1, x0 / hostRect.width))
    const y0Pct = Math.max(0, Math.min(1, y0 / hostRect.height))
    const x1Pct = Math.max(0, Math.min(1, x1 / hostRect.width))
    const y1Pct = Math.max(0, Math.min(1, y1 / hostRect.height))

    return {
      page,
      x0Pct,
      y0Pct,
      x1Pct,
      y1Pct,
      coordSpace: 'host' // ✅ Marca come coordinate host
    }
  }, [hostRef, pageElsRef])

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
      // ✅ Reset stato
      isSelectingRef.current = false
      startPosRef.current = null
      currentPageRef.current = null
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      // ✅ Pulisci draft
      if (onDraftChange) {
        onDraftChange(null)
      }
    }
  }, [enabled, isActive, onDraftChange])

  // ✅ Helper: reset completo dello stato (usato quando mouse esce dal host)
  const resetState = useCallback(() => {
    isSelectingRef.current = false
    startPosRef.current = null
    currentPageRef.current = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (onDraftChange) {
      onDraftChange(null)
    }
  }, [onDraftChange])

  // ✅ Gestisce drag rettangolo usando useIsolatedGlobalListeners
  const handleMouseDown = useCallback((e: MouseEvent) => {
      const host = hostRef.current
      if (!host) return

      if (e.button !== 0) return // Solo click sinistro

      const target = e.target as HTMLElement

      // ✅ Verifica se click è dentro overlay (se funzione fornita)
      if (isClickInsideOverlay && isClickInsideOverlay(target)) {
        return
      }

      // ✅ Verifica default: overlay ExtractBlock
      const isInsideOverlay = target && (
        target.closest('[data-extract-overlay="true"]') ||
        target.closest('.extract-block-overlay')
      )

      if (isInsideOverlay) {
        return
      }

      isSelectingRef.current = true

      // ✅ Salva coordinate assolute (clientX/clientY) invece di relative
      // Questo permette di ricalcolare correttamente durante mousemove anche con scroll/resize
      startPosRef.current = {
        x: e.clientX,  // ✅ Coordinate assolute
        y: e.clientY   // ✅ Coordinate assolute
      }

      // ✅ Trova pagina iniziale
      const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement
      if (elementAtPoint) {
        currentPageRef.current = getPageNumberFromElement(elementAtPoint, host)
      } else {
        // ✅ Fallback: usa pagina 1 se non trovata
        currentPageRef.current = 1
      }

      // ✅ Crea draft iniziale zero-area IMMEDIATAMENTE
      if (onDraftChange) {
        const page = currentPageRef.current || 1
        const draftBox = calculateDraftBox(
          e.clientX,
          e.clientY,
          e.clientX,
          e.clientY,
          page
        )
        if (draftBox) {
          onDraftChange(draftBox)
        }
      }

      // ✅ Rimuovi selezione testo se presente
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
      }
  }, [hostRef, isClickInsideOverlay, onDraftChange, calculateDraftBox])

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isSelectingRef.current || !startPosRef.current) return

      // ✅ Rimuovi selezione testo durante drag
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
      }

      // ✅ Aggiorna draft box (con throttling via requestAnimationFrame)
      if (onDraftChange && currentPageRef.current) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }

        rafRef.current = requestAnimationFrame(() => {
          if (!isSelectingRef.current || !startPosRef.current || !currentPageRef.current) return

          const page = currentPageRef.current
          const draftBox = calculateDraftBox(
            startPosRef.current.x,
            startPosRef.current.y,
            e.clientX,
            e.clientY,
            page
          )

          if (draftBox) {
            onDraftChange(draftBox)
          }
        })
      }
  }, [onDraftChange, calculateDraftBox])

  const handleMouseUp = useCallback((e: MouseEvent) => {
      const host = hostRef.current
      if (!host) {
        resetState()
        return
      }

      if (!isSelectingRef.current || !startPosRef.current) {
        isSelectingRef.current = false
        return
      }

      const target = e.target as HTMLElement

      // ✅ Verifica se click è dentro overlay
      if (isClickInsideOverlay && isClickInsideOverlay(target)) {
        isSelectingRef.current = false
        startPosRef.current = null
        return
      }

      const isInsideOverlay = target && (
        target.closest('[data-extract-overlay="true"]') ||
        target.closest('.extract-block-overlay')
      )

      if (isInsideOverlay) {
        resetState()
        return
      }

      isSelectingRef.current = false

      // ✅ Ricalcola hostRect per mouseup (per gestire scroll/resize)
      const hostRect = host.getBoundingClientRect()

      // ✅ IMPORTANTE: calculateViewportBox si aspetta coordinate assolute (viewport)
      // Non sottrarre hostRect.left/top qui, lo fa calculateViewportBox
      const viewportBox = calculateViewportBox(
        startPosRef.current.x, // ✅ Coordinata assoluta (viewport)
        startPosRef.current.y, // ✅ Coordinata assoluta (viewport)
        e.clientX, // ✅ Coordinata assoluta (viewport)
        e.clientY, // ✅ Coordinata assoluta (viewport)
        host
      )

      // ✅ Verifica dimensione minima
      if (viewportBox.w < minSize || viewportBox.h < minSize) {
        resetState()
        return
      }

      // ✅ Trova pagina dal punto centrale
      const centerX = viewportBox.x + viewportBox.w / 2
      const centerY = viewportBox.y + viewportBox.h / 2
      const elementAtPoint = document.elementFromPoint(
        hostRect.left + centerX,
        hostRect.top + centerY
      ) as HTMLElement

      if (!elementAtPoint) {
        resetState()
        return
      }

      const pageNumber = getPageNumberFromElement(elementAtPoint, host)

      // ✅ Crea selezione (solo screenshot, nessun testo)
      const viewerSelection: ViewerSelection = {
        pageNumber,
        viewportBox,
        text: '' // ✅ Sempre vuoto - solo screenshot
      }

      // ✅ IMPORTANTE: onSelection è asincrono (fa screenshot)
      // NON pulire il draft subito - lascia che onSelection gestisca la pulizia
      // Il draft rimane visibile fino a quando la PersistentSelection viene creata
      Promise.resolve(onSelection(viewerSelection)).then(() => {
        // ✅ Pulisci draft solo DOPO che onSelection ha finito
        resetState()
      }).catch((error) => {
        console.error('[useRectSelection] Errore in onSelection:', error)
        // ✅ In caso di errore, pulisci comunque
        resetState()
      })
  }, [hostRef, onSelection, isClickInsideOverlay, minSize, resetState, calculateViewportBox, getPageNumberFromElement])

  // ✅ Usa useIsolatedGlobalListeners per gestire listener globali isolati
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
    onResetState: resetState // ✅ Reset automatico quando mouse esce dal host
  })

  // ✅ Listener locale su host per mousedown (più efficiente)
  useEffect(() => {
    if (!enabled || !isActive) return

    const host = hostRef.current
    if (!host) return

    host.addEventListener('mousedown', handleMouseDown)

    return () => {
      host.removeEventListener('mousedown', handleMouseDown)
    }
  }, [enabled, isActive, hostRef, handleMouseDown])

  return {
    isSelectingRef
  }
}
