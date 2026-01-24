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
  hostRef,
  onSelection,
  onDraftChange,
  pageElsRef, // ✅ Opzionale, solo per debug
  isClickInsideOverlay,
  minSize = 10
}: UseRectSelectionProps) {
  const isSelectingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const startPageRef = useRef<{ pageEl: HTMLElement; pageNumber: number } | null>(null) // ✅ Salva la pagina iniziale
  const rafRef = useRef<number | null>(null)
  const lastLogTimeRef = useRef<number>(0) // ✅ Per throttling dei log durante il drag

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

    // ✅ 6. Trova textLayer per ottenere le dimensioni corrette per il rendering
    let textLayerRect: DOMRect | null = null
    if (startPageRef.current) {
      const pageLayer = startPageRef.current.pageEl
      let textLayer: HTMLElement | null = null

      // Strategia 1: cerca dentro il pageLayer stesso
      textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLElement | null

      // Strategia 2: se non trovato, cerca nel parent container
      if (!textLayer) {
        const pageContainer = pageLayer.closest('[data-page-number]') as HTMLElement | null
        if (pageContainer) {
          textLayer = pageContainer.querySelector('.rpv-core__text-layer') as HTMLElement | null
        }
      }

      // Strategia 3: se ancora non trovato, cerca nel parent del pageLayer
      if (!textLayer) {
        const parent = pageLayer.parentElement
        if (parent) {
          textLayer = parent.querySelector('.rpv-core__text-layer') as HTMLElement | null
        }
      }

      if (textLayer) {
        textLayerRect = textLayer.getBoundingClientRect()
      }
    }

    // ✅ 7. Normalizza in percentuale usando textLayer se disponibile, altrimenti pageRect
    // CRITICO: Le percentuali devono essere calcolate rispetto al textLayer perché è lì che viene renderizzato il rettangolo
    let x0Pct: number, y0Pct: number, x1Pct: number, y1Pct: number

    if (textLayerRect) {
      // ✅ Converti coordinate da pageRect a textLayerRect
      // Le coordinate x0, y0, x1, y1 sono relative a pageRect (top-left)
      // Devo convertirle in coordinate relative a textLayerRect
      const offsetX = textLayerRect.left - pageRect.left
      const offsetY = textLayerRect.top - pageRect.top

      // Coordinate relative a textLayerRect
      const x0Text = x0 - offsetX
      const y0Text = y0 - offsetY
      const x1Text = x1 - offsetX
      const y1Text = y1 - offsetY

      // Calcola percentuali rispetto a textLayerRect (SENZA clamping per permettere estensione oltre i bordi)
      x0Pct = x0Text / textLayerRect.width
      y0Pct = y0Text / textLayerRect.height
      x1Pct = x1Text / textLayerRect.width
      y1Pct = y1Text / textLayerRect.height
    } else {
      // Fallback: usa pageRect (SENZA clamping)
      x0Pct = x0 / pageRect.width
      y0Pct = y0 / pageRect.height
      x1Pct = x1 / pageRect.width
      y1Pct = y1 / pageRect.height
    }

    const result = {
      page: pageNumber,
      x0Pct,
      y0Pct,
      x1Pct,
      y1Pct,
      coordSpace: 'page' as const
    }

    // ✅ Log dettagliato delle coordinate (con throttling: max 1 ogni 200ms)
    const now = Date.now()
    if (now - lastLogTimeRef.current > 200) {
      // ✅ Calcola gli angoli del rettangolo in coordinate schermo
      const rectTopLeftScreenX = pageRect.left + x0
      const rectTopLeftScreenY = pageRect.top + y0
      const rectBottomRightScreenX = pageRect.left + x1
      const rectBottomRightScreenY = pageRect.top + y1

      // ✅ Calcola la distanza tra il mouse e l'angolo in basso a destra del rettangolo
      const distanceX = Math.abs(endX - rectBottomRightScreenX)
      const distanceY = Math.abs(endY - rectBottomRightScreenY)
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY)

      // ✅ Calcola la distanza tra il punto iniziale e l'angolo in alto a sinistra del rettangolo
      const startDistanceX = Math.abs(startX - rectTopLeftScreenX)
      const startDistanceY = Math.abs(startY - rectTopLeftScreenY)
      const startDistance = Math.sqrt(startDistanceX * startDistanceX + startDistanceY * startDistanceY)

      // ✅ Verifica dimensioni del root overlay e del textLayer (se disponibili)
      let rootRect: DOMRect | null = null
      let textLayerRect: DOMRect | null = null
      let rootSizeMismatch = false
      let textLayerSizeMismatch = false
      let debugInfo: any = {}
      if (startPageRef.current) {
        const pageLayer = startPageRef.current.pageEl

        // ✅ Trova il textLayer: può essere dentro il pageLayer o dentro il suo parent container
        let textLayer: HTMLElement | null = null

        // Strategia 1: cerca dentro il pageLayer stesso
        textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLElement | null
        debugInfo.textLayerFoundInPageLayer = !!textLayer

        // Strategia 2: se non trovato, cerca nel parent container con data-page-number
        if (!textLayer) {
          const pageContainer = pageLayer.closest('[data-page-number]') as HTMLElement | null
          debugInfo.pageContainerFound = !!pageContainer
          if (pageContainer) {
            textLayer = pageContainer.querySelector('.rpv-core__text-layer') as HTMLElement | null
            debugInfo.textLayerFoundInContainer = !!textLayer
          }
        }

        // Strategia 3: se ancora non trovato, cerca nel parent del pageLayer
        if (!textLayer) {
          const parent = pageLayer.parentElement
          if (parent) {
            textLayer = parent.querySelector('.rpv-core__text-layer') as HTMLElement | null
            debugInfo.textLayerFoundInParent = !!textLayer
          }
        }

        debugInfo.textLayerFound = !!textLayer

        if (textLayer) {
          textLayerRect = textLayer.getBoundingClientRect()
          const overlayRoot = textLayer.querySelector('.ai-overlay-root') as HTMLElement | null
          debugInfo.overlayRootFound = !!overlayRoot
          if (overlayRoot) {
            rootRect = overlayRoot.getBoundingClientRect()
            // ✅ Verifica se le dimensioni del root corrispondono a quelle della pagina
            const widthDiff = Math.abs(rootRect.width - pageRect.width)
            const heightDiff = Math.abs(rootRect.height - pageRect.height)
            rootSizeMismatch = widthDiff > 1 || heightDiff > 1 // Tolleranza di 1px
          }
          // ✅ Verifica se le dimensioni del textLayer corrispondono a quelle della pagina
          const textWidthDiff = Math.abs(textLayerRect.width - pageRect.width)
          const textHeightDiff = Math.abs(textLayerRect.height - pageRect.height)
          textLayerSizeMismatch = textWidthDiff > 1 || textHeightDiff > 1 // Tolleranza di 1px
        }
      }

      // ✅ Log con distanze in evidenza
      const distanceStr = `DISTANZA bottom-right: ${Math.round(distance)}px (X: ${Math.round(distanceX)}px, Y: ${Math.round(distanceY)}px) | DISTANZA top-left: ${Math.round(startDistance)}px (X: ${Math.round(startDistanceX)}px, Y: ${Math.round(startDistanceY)}px)`
      const logData: any = {
        startPoint: { x: Math.round(startX), y: Math.round(startY) },
        mouse: { x: Math.round(endX), y: Math.round(endY) },
        rectTopLeftScreen: { x: Math.round(rectTopLeftScreenX), y: Math.round(rectTopLeftScreenY) },
        rectBottomRightScreen: { x: Math.round(rectBottomRightScreenX), y: Math.round(rectBottomRightScreenY) },
        rectTopLeftPage: { x: Math.round(x0), y: Math.round(y0) },
        rectBottomRightPage: { x: Math.round(x1), y: Math.round(y1) },
        rectTopLeftPct: { x: (x0Pct * 100).toFixed(2) + '%', y: (y0Pct * 100).toFixed(2) + '%' },
        rectBottomRightPct: { x: (x1Pct * 100).toFixed(2) + '%', y: (y1Pct * 100).toFixed(2) + '%' },
        pageRect: {
          width: Math.round(pageRect.width),
          height: Math.round(pageRect.height),
          left: Math.round(pageRect.left),
          top: Math.round(pageRect.top)
        },
        debug: debugInfo
      }

      if (textLayerRect) {
        logData.textLayerRect = {
          width: Math.round(textLayerRect.width),
          height: Math.round(textLayerRect.height),
          left: Math.round(textLayerRect.left),
          top: Math.round(textLayerRect.top)
        }
        logData.textLayerSizeMismatch = textLayerSizeMismatch
        if (textLayerSizeMismatch) {
          logData.textLayerSizeDiff = {
            width: Math.round(textLayerRect.width - pageRect.width),
            height: Math.round(textLayerRect.height - pageRect.height)
          }
        }
      }
      if (rootRect) {
        logData.rootRect = {
          width: Math.round(rootRect.width),
          height: Math.round(rootRect.height),
          left: Math.round(rootRect.left),
          top: Math.round(rootRect.top)
        }
        logData.rootSizeMismatch = rootSizeMismatch
        if (rootSizeMismatch) {
          logData.rootSizeDiff = {
            width: Math.round(rootRect.width - pageRect.width),
            height: Math.round(rootRect.height - pageRect.height)
          }
        }
      }

      console.log(`[RECT-SEL] 📐 ${distanceStr}`, logData)

      // ✅ Log esplicito per debug rendering
      // ✅ Log esplicito con dimensioni in evidenza
      const pageW = Math.round(pageRect.width)
      const pageH = Math.round(pageRect.height)
      const textW = textLayerRect ? Math.round(textLayerRect.width) : 0
      const textH = textLayerRect ? Math.round(textLayerRect.height) : 0
      const rootW = rootRect ? Math.round(rootRect.width) : 0
      const rootH = rootRect ? Math.round(rootRect.height) : 0

      const sizeInfo = `DIMENSIONI: page=${pageW}x${pageH} | textLayer=${textW}x${textH} | root=${rootW}x${rootH}`
      const mismatchInfo = textLayerSizeMismatch || rootSizeMismatch
        ? `⚠️ MISMATCH: textLayer=${textLayerSizeMismatch ? `${textW-pageW}x${textH-pageH}` : 'OK'} | root=${rootSizeMismatch ? `${rootW-pageW}x${rootH-pageH}` : 'OK'}`
        : '✅ Dimensioni OK'

      console.log(`[RECT-SEL] 🔍 ${sizeInfo} | ${mismatchInfo}`)
      console.log(`[RECT-SEL] 🔍 DEBUG RENDERING:`, {
        pageContainerFound: debugInfo.pageContainerFound,
        textLayerFound: debugInfo.textLayerFound,
        overlayRootFound: debugInfo.overlayRootFound,
        pageRect: { w: pageW, h: pageH },
        textLayerRect: textLayerRect ? { w: textW, h: textH } : 'NOT FOUND',
        rootRect: rootRect ? { w: rootW, h: rootH } : 'NOT FOUND',
        textLayerSizeMismatch,
        rootSizeMismatch,
        textLayerSizeDiff: textLayerSizeMismatch && textLayerRect ? {
          w: textW - pageW,
          h: textH - pageH
        } : null,
        rootSizeDiff: rootSizeMismatch && rootRect ? {
          w: rootW - pageW,
          h: rootH - pageH
        } : null
      })

      lastLogTimeRef.current = now
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

    const target = e.target as HTMLElement
    if (isClickInsideOverlay && isClickInsideOverlay(target)) {
      return
    }
    if (target.closest('[data-extract-overlay="true"]') || target.closest('.extract-block-overlay')) {
      return
    }

    console.log('[RECT-SEL] ✅ Drag START:', { viewerId, point: { x: e.clientX, y: e.clientY } })
    // ✅ Ferma la propagazione per evitare interferenze con listener globali
    e.stopPropagation()
    isSelectingRef.current = true

    // ✅ Salva coordinate schermo (sempre assolute)
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY
    }

    // ✅ CRITICO: Salva la pagina iniziale (dove inizia il drag)
    const { pageEl: startPageEl, pageNumber: startPageNumber } = findPageAtPoint(e.clientX, e.clientY)
    if (startPageEl && startPageNumber) {
      startPageRef.current = { pageEl: startPageEl, pageNumber: startPageNumber }
      console.log('[RECT-SEL] 📌 Pagina iniziale salvata:', { viewerId, page: startPageNumber })
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
  }, [enabled, hostRef, isClickInsideOverlay, onDraftChange, findPageAtPoint, viewerId])

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

    console.log('[RECT-SEL] ✅ Drag END:', { viewerId, point: { x: e.clientX, y: e.clientY } })
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

    console.log('[RECT-SEL] 💾 Salvataggio selezione:', {
      viewerId,
      page: draftBox.page,
      pageIndex: rectSelection.pageIndex,
      bbox: rectSelection.bbox,
      rect: rectSelection.rect,
      startPoint: { x: startPosRef.current.x, y: startPosRef.current.y },
      endPoint: { x: e.clientX, y: e.clientY }
    })

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
  }, [viewerId]) // ✅ Solo viewerId nelle dipendenze (per isolamento tra viewer diversi)

  return {
    isSelectingRef
  }
}
