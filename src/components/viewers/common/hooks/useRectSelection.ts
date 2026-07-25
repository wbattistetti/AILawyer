/**
 * ✅ Hook comune per drag rettangolo (OCR-style)
 * Usato da PDF viewer e Word viewer
 * Listener LOCALI sul hostRef - ogni viewer gestisce la selezione internamente
 *
 * MODELLO SEMPLIFICATO:
 * 1. Rettangolo → coordinate schermo (sempre)
 * 2. Coordinate schermo → pagina sotto cursore (sempre via elementFromPoint)
 * 3. Pagina → bounding rect (sempre via getBoundingClientRect)
 * 4. Coordinate schermo → coordinate pagina (sempre via sottrazione + normalizzazione)
 * 5. Nessun altro layer di logica
 */

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { ViewerSelection, ViewportBox, RectSelection } from '../types/viewer.types'
import { calculateViewportBox, getPageNumberFromElement } from '../utils/coordinateUtils'

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
  hostRef: React.RefObject<HTMLElement>
  /**
   * Incrementa quando l'host reale è pronto (per riattaccare i listener)
   */
  hostReadyTick?: number
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
   * ✅ Se un overlay di estrazione è attualmente aperto
   * Quando true, blocca l'inizio di un nuovo drag (basato su stato React, non DOM)
   */
  isOverlayOpen?: boolean
  /**
   * Dimensione minima del rettangolo (default: 10x10 pixel)
   */
  minSize?: number
}

export function useRectSelection({
  viewerId,
  enabled,
  hostRef,
  hostReadyTick = 0,
  onSelection,
  onDraftChange,
  pageElsRef, // ✅ Opzionale, solo per debug
  isClickInsideOverlay,
  isOverlayOpen = false, // ✅ Nuovo parametro: stato React invece di controlli DOM
  minSize = 10
}: UseRectSelectionProps) {
  const isSelectingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const startPageRef = useRef<{ pageEl: HTMLElement; pageNumber: number } | null>(null) // ✅ Salva la pagina iniziale
  const rafRef = useRef<number | null>(null)

  const getPageNumberLoose = (element: HTMLElement | null): number | null => {
    let current = element
    while (current) {
      const pageNumberAttr = current.getAttribute('data-page-number')
      if (pageNumberAttr) {
        const parsed = parseInt(pageNumberAttr, 10)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
      const pageAttr = current.getAttribute('data-page')
      if (pageAttr) {
        const parsed = parseInt(pageAttr, 10)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
      current = current.parentElement
    }
    return null
  }

  const findPageFromEventPath = (e: MouseEvent): { pageEl: HTMLElement | null; pageNumber: number | null } => {
    const path = (e.composedPath?.() || []) as HTMLElement[]
    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue
      if (node.classList.contains('rpv-core__page-layer')) {
        return { pageEl: node, pageNumber: getPageNumberLoose(node) }
      }
      if (node.hasAttribute?.('data-page-number')) {
        const innerLayer = node.querySelector('.rpv-core__page-layer') as HTMLElement | null
        if (innerLayer) {
          return { pageEl: innerLayer, pageNumber: getPageNumberLoose(innerLayer) }
        }
      }
      if (node.hasAttribute?.('data-page')) {
        return { pageEl: node, pageNumber: getPageNumberLoose(node) }
      }
    }
    return { pageEl: null, pageNumber: null }
  }

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

    // ✅ Prima prova: trova direttamente il page-layer più vicino al punto
    const closestPageLayer = elementAtPoint.closest?.('.rpv-core__page-layer') as HTMLElement | null
    if (closestPageLayer) {
      const pageNumber = getPageNumberLoose(closestPageLayer)
      return { pageEl: closestPageLayer, pageNumber }
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
    // ✅ 2. Ottieni bounding rect (sempre aggiornato - chiamato ad ogni frame durante il drag)
    const pageRect = pageEl.getBoundingClientRect()

    // ✅ 3. Converti coordinate schermo → coordinate pagina (senza limitare ai bordi)
    // Non limitiamo più ai bordi: se il mouse esce dalla pagina, il rettangolo può estendersi oltre
    // Questo permette al rettangolo di seguire correttamente il mouse
    const startXPage = startX - pageRect.left
    const startYPage = startY - pageRect.top
    const endXPage = endX - pageRect.left
    const endYPage = endY - pageRect.top

    // ✅ 5. Calcola min/max per rettangolo
    const x0 = Math.min(startXPage, endXPage)
    const y0 = Math.min(startYPage, endYPage)
    const x1 = Math.max(startXPage, endXPage)
    const y1 = Math.max(startYPage, endYPage)

    // Percentuali relative al page-layer (stesso spazio dell'overlay OCR/selezione).
    const x0Pct = x0 / pageRect.width
    const y0Pct = y0 / pageRect.height
    const x1Pct = x1 / pageRect.width
    const y1Pct = y1 / pageRect.height

    const result = {
      page: pageNumber,
      x0Pct,
      y0Pct,
      x1Pct,
      y1Pct,
      coordSpace: 'page' as const
    }

    return result
  }, [])

  // ✅ Helper: calcola draft box (sempre da coordinate schermo)
  const calculateDraftBox = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): DraftBox | null => {
    const host = hostRef.current
    if (!host) {
      console.warn('[RECT-SEL] ⚠️ calculateDraftBox: host non trovato', { viewerId })
      return null
    }

    // ✅ CRITICO: Usa SEMPRE la pagina iniziale (salvata in handleMouseDown)
    // Questo garantisce che le coordinate siano sempre relative alla stessa pagina
    // Anche se scrolli o il mouse si sposta su un'altra pagina, usiamo sempre quella iniziale
    if (!startPageRef.current) {
      // ✅ Fallback: se non abbiamo la pagina iniziale, prova a trovarla
      const { pageEl: startPageEl, pageNumber: startPageNumber } = findPageAtPoint(startX, startY)
      if (startPageEl && startPageNumber) {
        startPageRef.current = { pageEl: startPageEl, pageNumber: startPageNumber }
      } else {
        // ✅ Ultimo fallback: prova il punto corrente
        const { pageEl: currentPageEl, pageNumber: currentPageNumber } = findPageAtPoint(endX, endY)
        if (currentPageEl && currentPageNumber) {
          startPageRef.current = { pageEl: currentPageEl, pageNumber: currentPageNumber }
        } else {
          console.warn('[RECT-SEL] ⚠️ Nessuna pagina trovata', { viewerId, startPoint: { x: startX, y: startY }, endPoint: { x: endX, y: endY } })
          return null
        }
      }
    }

    // ✅ Usa sempre la pagina iniziale (dove inizia il drag)
    // getBoundingClientRect() viene chiamato ad ogni frame, quindi è sempre aggiornato anche dopo lo scroll
    const result = calculateDraftBoxFromPage(
      startPageRef.current.pageEl,
      startPageRef.current.pageNumber,
      startX,
      startY,
      endX,
      endY
    )
    return result
  }, [hostRef, findPageAtPoint, calculateDraftBoxFromPage, viewerId, pageElsRef])

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

  // ✅ Reset completo quando enabled è false
  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, onDraftChange, viewerId])

  // ✅ Helper: reset completo dello stato (usato quando mouse esce dal host)
  const resetState = useCallback(() => {
    isSelectingRef.current = false
    startPosRef.current = null
    startPageRef.current = null // ✅ Reset anche la pagina iniziale
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (onDraftChange) {
      onDraftChange(null)
    }
    // ✅ Rimuovi selezione testo nativa (se creata durante il drag)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
  }, [onDraftChange])

      // ✅ Handler mouse down
      const handleMouseDown = useCallback((e: MouseEvent) => {
        // ✅ Rimosso controllo isActive: se l'evento arriva al listener locale, il viewer è attivo
        if (!enabled) {
          return
        }
    if (e.button !== 0) return // Solo click sinistro

    const host = hostRef.current
    if (!host) {
      return
    }

    // ✅ CRITICO: Blocca drag se overlay è aperto (basato su stato React, non DOM)
    // Questo elimina race condition, overlay "zombie", problemi di timing
    if (isOverlayOpen) {
      return
    }

    const target = e.target as HTMLElement

    // ✅ Mantieni isClickInsideOverlay per altri overlay (es. toolbar, menu)
    if (isClickInsideOverlay && isClickInsideOverlay(target)) {
      return
    }

    // ✅ RIMOSSO: Controllo DOM-based su data-extract-overlay
    // Non serve più perché usiamo isOverlayOpen (stato React)
    // if (target.closest('[data-extract-overlay="true"]') || target.closest('.extract-block-overlay')) {
    //   return
    // }

    // ✅ Ferma la propagazione per evitare interferenze con listener globali
    e.stopPropagation()
    isSelectingRef.current = true

    // ✅ Salva coordinate schermo (sempre assolute)
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY
    }

    // ✅ CRITICO: Salva la pagina iniziale (dove inizia il drag)
    const { pageEl: startPageEl, pageNumber: startPageNumber } = findPageFromEventPath(e)
    console.log('[RECT-SEL] ✅ Drag START:', { viewerId, page: startPageNumber })
    if (startPageEl && startPageNumber) {
      startPageRef.current = { pageEl: startPageEl, pageNumber: startPageNumber }
    } else {
      startPageRef.current = null
      console.warn('[RECT-SEL] ⚠️ Pagina iniziale non trovata:', { viewerId, point: { x: e.clientX, y: e.clientY } })
    }

    // ✅ Crea draft iniziale zero-area
    if (onDraftChange && startPageRef.current) {
      onDraftChange({
        page: startPageRef.current.pageNumber,
        x0Pct: 0,
        y0Pct: 0,
        x1Pct: 0,
        y1Pct: 0,
        coordSpace: 'page'
      })
    }

    // ✅ Rimuovi selezione testo se presente
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
  }, [enabled, hostRef, isClickInsideOverlay, isOverlayOpen, onDraftChange, findPageAtPoint, viewerId, findPageFromEventPath])

  // ✅ Handler mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) {
      return
    }

    // ✅ Ferma la propagazione per evitare interferenze con listener globali
    e.stopPropagation()

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
  }, [calculateDraftBox, onDraftChange, viewerId])

  // ✅ Handler mouse up
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isSelectingRef.current || !startPosRef.current) {
      return
    }

    const host = hostRef.current
    if (!host) {
      console.warn('[RECT-SEL] ⚠️ Host non trovato in handleMouseUp')
      resetState()
      return
    }

    console.log('[RECT-SEL] ✅ Drag END:', { viewerId, page: startPageRef.current?.pageNumber })
    // ✅ Ferma la propagazione per evitare interferenze con listener globali
    e.stopPropagation()
    isSelectingRef.current = false

    // ✅ Rimuovi selezione testo nativa (se creata durante il drag)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }

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

  // ✅ Ref per gli handler (evita re-render quando cambiano)
  const handleMouseDownRef = useRef(handleMouseDown)
  const handleMouseMoveRef = useRef(handleMouseMove)
  const handleMouseUpRef = useRef(handleMouseUp)

  // ✅ Aggiorna ref quando cambiano (senza causare re-render)
  useEffect(() => {
    handleMouseDownRef.current = handleMouseDown
    handleMouseMoveRef.current = handleMouseMove
    handleMouseUpRef.current = handleMouseUp
  }, [handleMouseDown, handleMouseMove, handleMouseUp])

  // ✅ Listener LOCALI sul host (non globali) - ogni viewer gestisce la selezione internamente
  // ✅ Attaccati quando hostRef.current diventa disponibile, rimossi solo all'unmount
  // ✅ Gli handler controllano enabled internamente (isActive non serve: se l'evento arriva, il viewer è attivo)
  // ✅ Usa useLayoutEffect per assicurarsi che hostRef.current sia disponibile (eseguito dopo DOM update, prima del paint)
  useLayoutEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    // ✅ Wrapper per usare ref invece di dipendenze dirette
    const wrappedMouseDown = (e: MouseEvent) => handleMouseDownRef.current(e)
    const wrappedMouseMove = (e: MouseEvent) => handleMouseMoveRef.current(e)
    const wrappedMouseUp = (e: MouseEvent) => handleMouseUpRef.current(e)

    // ✅ Attacca TUTTI i listener LOCALI sul host (una sola volta)
    // ✅ Usa capture: true per avere priorità sui listener globali di useIsolatedGlobalListeners
    host.addEventListener('mousedown', wrappedMouseDown, true) // capture: true
    host.addEventListener('mousemove', wrappedMouseMove, { passive: true, capture: true })
    host.addEventListener('mouseup', wrappedMouseUp, true) // capture: true

    // ✅ Cleanup: rimuovi listener SOLO quando il componente viene smontato
    return () => {
      if (host) {
        host.removeEventListener('mousedown', wrappedMouseDown, true) // capture: true
        host.removeEventListener('mousemove', wrappedMouseMove, true) // capture: true
        host.removeEventListener('mouseup', wrappedMouseUp, true) // capture: true
      }
    }
  }, [viewerId, hostReadyTick]) // ✅ Riattacca quando l'host reale diventa disponibile

  return {
    isSelectingRef
  }
}
