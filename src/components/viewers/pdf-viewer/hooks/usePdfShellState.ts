import { useRef, useState, useCallback } from 'react'
import { usePdfViewerState } from './usePdfViewerState'
import { usePdfSearch } from './usePdfSearch'
import { useNativeSelection } from './useNativeSelection'
import { usePdfDeskew } from './usePdfDeskew'
import { usePdfAudit } from './usePdfAudit'
import { usePdfAnnotations } from './usePdfAnnotations'
import { usePdfJumpTo } from './usePdfJumpTo'
import { usePdfSearchPanel } from './usePdfSearchPanel'
import { usePdfDocument } from './usePdfDocument'
import { usePdfNativeStyles } from './usePdfNativeStyles'
import { usePdfOverlays } from './usePdfOverlays'
import { usePdfPanelResizer } from './usePdfPanelResizer'
import { usePdfExtract } from './usePdfExtract'
import { useRectSelection, type DraftBox } from '../../common/hooks/useRectSelection'
import { captureSelectionScreenshot } from '../../common/utils/screenshot'
import type { PersistentSelection } from '../types'

interface UsePdfShellStateProps {
  hostRef: React.MutableRefObject<HTMLDivElement | null>
  fileUrl: string
  docId?: string
  onPageChange?: (page: number) => void
  viewerRef: React.RefObject<any> // PdfViewerHandle
  /**
   * ✅ Se il viewer è attualmente attivo (visibile/focus)
   */
  isActive?: boolean
}

export function usePdfShellState({ hostRef, fileUrl, docId, onPageChange, viewerRef, isActive = false }: UsePdfShellStateProps) {
  // Core state hooks
  const viewerState = usePdfViewerState()
  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = usePdfSearchPanel()
  const { totalPages, setTotalPages, pageInput, setPageInput, zoomPct, setZoomPct, searchCacheRef, matches, setMatches, runSearch } = usePdfSearch(docId, fileUrl)
  const lastOcrMatchesRef = useRef<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>([])

  // Areas state for jump-to functionality
  const [areas, setAreas] = useState<Array<{ id: string; pageIndex: number; left: number; top: number; width: number; height: number }>>([])

  // Feature hooks
  const { tool, setTool, annots, setAnnots, draft, setDraft } = usePdfAnnotations({ hostRef })
  const { autoDeskew, setAutoDeskew, skewAngles, setSkewAngles, persistSkew, estimateSkewForPage, applyImmediateToPage } = usePdfDeskew({ docId, hostRef })
  const { audit, setAudit } = usePdfAudit({ hostRef })

  // Utility hooks
  const { pdfDocRef } = usePdfDocument({ fileUrl })
  const { overlayRootsRef, selectRootsRef, pageElsRef, elToPageRef } = usePdfOverlays({ hostRef })

  // Zoom functionality
  const scaleRef = useRef<number>(1)
  const zoomDebounceRef = useRef<number | null>(null)
  const zoomTo = (scale: number) => {
    scaleRef.current = scale
    // Zoom ora gestito tramite viewerRef
    viewerRef.current?.zoomTo?.(scale);
  }

  // Hook per lo stato dell'estratto
  const {
    extractDate,
    setExtractDate,
    extractNotes,
    setExtractNotes,
    showNotes,
    setShowNotes,
    extractTitle,
    setExtractTitle,
    selectedAnnot,
    setSelectedAnnot,
    openedAtRef,
    isSelectingRef,
    lastNativeRangeRef,
    lastDraftBoxRef,
    suppressClearRef
  } = usePdfExtract()

  // Jump-to functionality
  const { goToMatch } = usePdfJumpTo({
    docId,
    hostRef,
    viewerRef,
    overlayRootsRef,
    setSelectedAnnot: viewerState.setSelectedAnnot,
    areas,
    setAreas,
    searchCacheRef,
    fileUrl
  })

  const selectionHandledRef = useRef(false)

  // ✅ SEMPLIFICAZIONE: Selezione rettangolo sempre attiva (indipendente da selectKind)
  // Funziona per PDF, Word, immagini - sempre screenshot, testo opzionale
  const rectSelection = useRectSelection({
    viewerId: docId || 'pdf-viewer',
    enabled: viewerState.selectMode, // ✅ Sempre attiva quando selectMode=true
    isActive,
    hostRef: hostRef as React.RefObject<HTMLElement>,
    pageElsRef,
    onDraftChange: useCallback((draftBox: DraftBox | null) => {
      // ✅ Converti DraftBox in Annotation per AnnotationOverlays
      if (draftBox) {
        const annotation: any = {
          id: 'draft',
          page: draftBox.page,
          type: 'highlight' as const,
          color: 'rgba(59,130,246,0.3)',
          x0Pct: draftBox.x0Pct,
          y0Pct: draftBox.y0Pct,
          x1Pct: draftBox.x1Pct,
          y1Pct: draftBox.y1Pct
        }
        setDraft(annotation)
      } else {
        setDraft(null)
      }
    }, [setDraft]),
    onSelection: useCallback(async (selection) => {
      // ✅ Calcola coordinate percentuali rispetto alla pagina
      const pageEl = pageElsRef.current.get(selection.pageNumber)
      if (!pageEl) return

      const pageRect = pageEl.getBoundingClientRect()
      const percentCoords = {
        x0Pct: selection.viewportBox.x / pageRect.width,
        y0Pct: selection.viewportBox.y / pageRect.height,
        x1Pct: (selection.viewportBox.x + selection.viewportBox.w) / pageRect.width,
        y1Pct: (selection.viewportBox.y + selection.viewportBox.h) / pageRect.height
      }

      // ✅ Cattura screenshot (sempre, come richiesto)
      let imageDataUrl: string | undefined
      try {
        if (hostRef.current) {
          imageDataUrl = await captureSelectionScreenshot(hostRef.current, selection.viewportBox)
        }
      } catch (error) {
        console.warn('[PdfShellState] Errore durante cattura screenshot:', error)
      }

      // ✅ Crea PersistentSelection con screenshot
      const persistentSelection: PersistentSelection = {
        id: `pdf-persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        page: selection.pageNumber,
        x0Pct: percentCoords.x0Pct,
        y0Pct: percentCoords.y0Pct,
        x1Pct: percentCoords.x1Pct,
        y1Pct: percentCoords.y1Pct,
        text: '', // ✅ Sempre vuoto inizialmente - testo estratto opzionale a posteriori
        viewportBox: selection.viewportBox,
        source: docId || 'Documento',
        imageDataUrl // ✅ Screenshot sempre presente
      }

      // ✅ Salva lastSelection per ExtractBlockOverlay
      viewerState.setLastSelection({
        pdfPageNumber: selection.pageNumber,
        viewportBox: selection.viewportBox,
        text: '',
        imageDataUrl
      })

      // ✅ Aggiungi alla lista di persistent selections
      viewerState.setPersistentSelections(prev => [...prev, persistentSelection])
    }, [pageElsRef, hostRef, docId, viewerState]),
    isClickInsideOverlay: useCallback((target: HTMLElement) => {
      // ✅ Verifica se click è dentro overlay ExtractBlock
      return !!(
        target.closest('[data-extract-overlay="true"]') ||
        target.closest('.extract-block-overlay')
      )
    }, [])
  })

  // ✅ Native selection - solo per selezione testo nativo (non rettangolo)
  // Gestisce quando l'utente seleziona testo con il mouse (non drag rettangolo)
  const nativeSelection = useNativeSelection({
    viewerId: docId || 'pdf-viewer', // ✅ ID univoco per isolamento
    selectMode: viewerState.selectMode,
    selectKind: 'NATIVE', // ✅ Solo selezione testo nativo
    extractOpen: viewerState.extractOpen,
    hostRef,
    pageElsRef,
    elToPageRef,
    overlayRootsRef,
    pdfDocRef,
    setDraft,
    setExtractPos: viewerState.setExtractPos,
    setExtractPage: viewerState.setExtractPage,
    setLastSelection: viewerState.setLastSelection,
    setContextMenu: viewerState.setContextMenu,
    selectionHandledRef,
    setPersistentSelections: viewerState.setPersistentSelections,
    persistentSelections: viewerState.persistentSelections,
    draft,
    docId,
    isActive // ✅ Passa isActive per isolamento
  })

  // Public interface
  return {
    // Core state
    totalPages,
    pageInput,
    setPageInput,
    zoomPct,
    setZoomPct,
    searchQ,
    setSearchQ,
    showAdvanced,
    setShowAdvanced,
    panelW,
    setPanelW,
    resizingRef,

    // Viewer state
    ...viewerState,

    // Features
    tool,
    setTool,
    annots,
    setAnnots,
    draft,
    setDraft,
    autoDeskew,
    setAutoDeskew,
    skewAngles,
    audit,
    setAudit,

    // Extract state
    extractDate,
    setExtractDate,
    extractNotes,
    setExtractNotes,
    showNotes,
    setShowNotes,
    extractTitle,
    setExtractTitle,
    selectedAnnot,
    setSelectedAnnot,

    // Functions
    jumpToPage: (page: number) => {
      if (viewerRef.current?.jumpToPage) {
        viewerRef.current.jumpToPage(page);
        onPageChange?.(page);
      }
    },
    goToMatch,
    estimateSkewForPage,
    applyImmediateToPage,
    persistSkew,

    // Search functions
    matches,
    setMatches,
    runSearch,

    // Zoom functions
    zoomTo,
    scaleRef,
    zoomDebounceRef,

    // Refs for child components
    hostRef,
    pdfDocRef,
    overlayRootsRef,
    searchCacheRef,
    pageElsRef,
    elToPageRef,
    lastOcrMatchesRef,
    setSelectionHandled: (handled: boolean) => { selectionHandledRef.current = handled },
    selectionHandledRef,

    // Extract refs
    openedAtRef,
    isSelectingRef,
    lastNativeRangeRef,
    lastDraftBoxRef,
    suppressClearRef,

    // Persistent selections
    persistentSelections: viewerState.persistentSelections,
    setPersistentSelections: viewerState.setPersistentSelections
  }
}
