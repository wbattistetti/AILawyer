import { useRef, useState, useCallback, useEffect } from 'react'
import type { ExtractCard } from '../../common/types/viewer.types'
import { usePdfViewerState } from './usePdfViewerState'
import { usePdfSearch } from './usePdfSearch'
import { useNativeSelection } from './useNativeSelection'
import { usePdfDeskew } from './usePdfDeskew'
import { usePdfAudit } from './usePdfAudit'
import { usePdfAnnotations } from './usePdfAnnotations'
import { usePdfJumpTo } from './usePdfJumpTo'
import { useDocumentSearchPanel } from '../../../search/useDocumentSearchPanel'
import { useOptionalViewerSearchNavigatorRegistry } from '../../../search/ViewerSearchNavigatorProvider'
import { usePdfDocument } from './usePdfDocument'
import { usePdfNativeStyles } from './usePdfNativeStyles'
import { usePdfOverlays } from './usePdfOverlays'
import { usePdfExtract } from './usePdfExtract'
import { useRectSelection, type DraftBox } from '../../common/hooks/useRectSelection'
import type { PersistentSelection } from '../types'
import type { RectSelection, ExtractedContent } from '../../common/types/viewer.types'
import { extractContentFromRect } from '../utils/extractContentFromRect'
import { resolveExtractImageDataUrl } from '../../common/utils/resolveExtractImageDataUrl'
import { toPdfMatchItem } from '../utils/toPdfMatchItem'
import {
  getPdfViewerSession,
  patchPdfViewerSession,
} from '../../common/pdfViewerSessionStore'

interface UsePdfShellStateProps {
  hostRef: React.MutableRefObject<HTMLDivElement | null>
  /** Contenitore overflow-auto del shell (scroll reale verso i match). */
  scrollHostRef: React.MutableRefObject<HTMLElement | null>
  fileUrl: string
  docId?: string
  onPageChange?: (page: number) => void
  viewerRef: React.RefObject<any> // PdfViewerHandle
  /**
   * ✅ Se il viewer è attualmente attivo (visibile/focus)
   */
  isActive?: boolean
  viewerReadyTick?: number
}

export function usePdfShellState({ hostRef, scrollHostRef, fileUrl, docId, onPageChange, viewerRef, isActive = false, viewerReadyTick = 0, isExtractOverlayOpen = false }: UsePdfShellStateProps) {
  // Core state hooks
  const viewerState = usePdfViewerState()
  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = useDocumentSearchPanel()
  const { totalPages, setTotalPages, pageInput, setPageInput, zoomPct, setZoomPct, searchCacheRef, matches, setMatches, runSearch } = usePdfSearch(docId, fileUrl)
  const restoredSession = docId ? getPdfViewerSession(docId) : undefined
  const [activeSearchMatchId, setActiveSearchMatchId] = useState<string | null>(
    () => restoredSession?.activeSearchMatchId ?? null
  )
  const lastOcrMatchesRef = useRef<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>([])
  const restoredMatchesRef = useRef(false)

  // Areas state for jump-to functionality
  const [, setAreas] = useState<Array<{ id: string; pageIndex: number; left: number; top: number; width: number; height: number }>>([])

  // Feature hooks
  const { tool, setTool, annots, setAnnots, draft, setDraft } = usePdfAnnotations({ hostRef })
  /** Draft rettangolo: stato separato da annotazioni/native selection */
  const [rectangleDraft, setRectangleDraft] = useState<DraftBox | null>(null)
  const { autoDeskew, setAutoDeskew, skewAngles, setSkewAngles, persistSkew, estimateSkewForPage, applyImmediateToPage } = usePdfDeskew({ docId, hostRef })
  const { audit, setAudit } = usePdfAudit({ hostRef })

  // Utility hooks
  const { pdfDocRef } = usePdfDocument({ fileUrl })
  const { overlayRootsRef, selectRootsRef, pageElsRef, elToPageRef, ensureOverlayRootForPage, selectTick, setSelectTick } = usePdfOverlays({
    hostRef,
    selectMode: viewerState.selectMode,
    selectKind: 'NATIVE',
    viewerReadyTick
  })

  // ✅ Funzione per estrarre contenuto da rettangolo (specifica del viewer)
  const extractContentFromRectImpl = useCallback(async (rect: RectSelection): Promise<ExtractedContent> => {
    return extractContentFromRect(rect, {
      hostRef,
      pageElsRef,
      hasNativeText: viewerState.hasNativeText ?? false,
      pdfDocRef
    })
  }, [hostRef, pageElsRef, viewerState.hasNativeText, pdfDocRef, ensureOverlayRootForPage])

  // Zoom functionality
  const scaleRef = useRef<number>(1)
  const zoomDebounceRef = useRef<number | null>(null)
  const zoomTo = (scale: number) => {
    scaleRef.current = scale
    viewerRef.current?.zoomTo?.(scale)
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
  const persistPage = useCallback((page: number) => {
    if (!docId?.trim()) {
      onPageChange?.(page)
      return
    }
    patchPdfViewerSession(docId, { page })
    onPageChange?.(page)
  }, [docId, onPageChange])

  const { goToMatch } = usePdfJumpTo({
    docId,
    hostRef,
    scrollHostRef,
    viewerRef,
    overlayRootsRef,
    ensureOverlayRootForPage,
    bumpOverlayTick: () => setSelectTick((tick) => tick + 1),
    setActiveSearchMatchId,
    setAreas,
    onPageChange: persistPage,
  })

  // Ripristina match evidenziate dopo remount (es. tab spostata in split).
  useEffect(() => {
    if (!docId?.trim() || restoredMatchesRef.current) return
    const session = getPdfViewerSession(docId)
    restoredMatchesRef.current = true
    if (!session?.matches?.length) return
    setMatches(session.matches)
    if (session.activeSearchMatchId) {
      setActiveSearchMatchId(session.activeSearchMatchId)
    }
  }, [docId, setMatches])

  // Persiste match / highlight attivi nella sessione per-documento.
  useEffect(() => {
    if (!docId?.trim() || !restoredMatchesRef.current) return
    patchPdfViewerSession(docId, {
      matches,
      activeSearchMatchId,
    })
  }, [docId, matches, activeSearchMatchId])

  const viewerNavigatorRegistry = useOptionalViewerSearchNavigatorRegistry()
  useEffect(() => {
    if (!viewerNavigatorRegistry || !docId?.trim()) return

    return viewerNavigatorRegistry.register({
      documentId: docId,
      kind: 'pdf',
      goToMatch: async (match) => {
        const item = toPdfMatchItem(match)
        restoredMatchesRef.current = true
        if (item.rects.length > 0) {
          setMatches((previous) => {
            const next = previous.some((candidate) => candidate.id === item.id)
              ? previous
              : [...previous, item]
            patchPdfViewerSession(docId, {
              page: item.page,
              matches: next,
              activeSearchMatchId: item.id,
            })
            return next
          })
        } else {
          setActiveSearchMatchId(null)
          patchPdfViewerSession(docId, {
            page: item.page,
            activeSearchMatchId: null,
          })
        }
        await goToMatch(item)
      }
    })
  }, [viewerNavigatorRegistry, docId, goToMatch, setMatches, setActiveSearchMatchId])

  const highlightReplayDoneRef = useRef(false)
  // Dopo remount + viewer ready, ripeti il salto all'highlight attivo.
  useEffect(() => {
    if (!docId?.trim() || viewerReadyTick < 1 || highlightReplayDoneRef.current) return
    const session = getPdfViewerSession(docId)
    if (!session?.activeSearchMatchId || !session.matches.length) {
      highlightReplayDoneRef.current = true
      return
    }
    const active = session.matches.find(match => match.id === session.activeSearchMatchId)
    if (!active) {
      highlightReplayDoneRef.current = true
      return
    }
    highlightReplayDoneRef.current = true
    let cancelled = false
    void (async () => {
      try {
        if (!cancelled) await goToMatch(active)
      } catch {
        // Il lifecycle ritenta al resize del pannello.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, viewerReadyTick, goToMatch])

  const selectionHandledRef = useRef(false)

  // Eventi sul scroll host (sempre montato), non su .rpv-core__viewer (pronto in ritardo).
  // Stesso pattern di Word: il container overflow è l'host dei listener.
  const rectSelection = useRectSelection({
    viewerId: docId || 'pdf-viewer',
    enabled: true,
    hostRef: scrollHostRef as React.RefObject<HTMLElement>,
    hostReadyTick: viewerReadyTick,
    pageElsRef,
    isOverlayOpen: isExtractOverlayOpen,
    debug: true,
    onDraftChange: useCallback((draftBox: DraftBox | null) => {
      if (draftBox) {
        const rootOk = ensureOverlayRootForPage?.(draftBox.page) ?? false
        console.log('[RECT-SEL][PDF] onDraftChange', {
          page: draftBox.page,
          x0Pct: draftBox.x0Pct,
          y0Pct: draftBox.y0Pct,
          x1Pct: draftBox.x1Pct,
          y1Pct: draftBox.y1Pct,
          rootOk,
          pageEl: !!pageElsRef.current.get(draftBox.page),
          roots: Array.from(overlayRootsRef.current.keys())
        })
        setRectangleDraft(draftBox)
      } else {
        console.log('[RECT-SEL][PDF] onDraftChange null')
        setRectangleDraft(null)
      }
    }, [ensureOverlayRootForPage, pageElsRef, overlayRootsRef]),
    onSelection: useCallback((rect: RectSelection) => {
      console.log('[RECT-SEL][PDF] onSelection', {
        pageIndex: rect.pageIndex,
        rect: rect.rect,
        bbox: rect.bbox
      })

      const card: ExtractCard = {
        id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        rect: rect.rect,
        pageIndex: rect.pageIndex,
        viewerId: rect.viewerId,
        viewerType: 'pdf',
        createdAt: new Date()
      }

      const pageNumber = rect.pageIndex + 1
      const percentCoords = rect.bbox || {
        x0Pct: 0,
        y0Pct: 0,
        x1Pct: 1,
        y1Pct: 1
      }

      const viewportBox = {
        x: rect.rect.x,
        y: rect.rect.y,
        w: rect.rect.width,
        h: rect.rect.height
      }

      // Optimistic UI: mount overlay immediately; extract text/screenshot in background.
      const persistentSelection: PersistentSelection = {
        id: card.id,
        page: pageNumber,
        x0Pct: percentCoords.x0Pct,
        y0Pct: percentCoords.y0Pct,
        x1Pct: percentCoords.x1Pct,
        y1Pct: percentCoords.y1Pct,
        text: '',
        viewportBox,
        source: docId || 'Documento',
        contentReady: false
      }

      viewerState.setLastSelection({
        pdfPageNumber: pageNumber,
        viewportBox,
        text: '',
        imageDataUrl: undefined
      })
      viewerState.setPersistentSelections(prev => [...prev, persistentSelection])

      void (async () => {
        try {
          const content = await extractContentFromRectImpl(rect)
          const imageDataUrl = resolveExtractImageDataUrl(content)
          const text = content.text || ''

          viewerState.setLastSelection({
            pdfPageNumber: pageNumber,
            viewportBox,
            text,
            imageDataUrl
          })
          viewerState.setPersistentSelections(prev =>
            prev.map(selection =>
              selection.id === card.id
                ? { ...selection, text, imageDataUrl, contentReady: true }
                : selection
            )
          )
        } catch (error) {
          console.error('[PdfShellState] Errore in onSelection:', error)
          viewerState.setPersistentSelections(prev =>
            prev.map(selection =>
              selection.id === card.id
                ? { ...selection, contentReady: true }
                : selection
            )
          )
        }
      })()
    }, [extractContentFromRectImpl, docId, viewerState]),
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
    rectangleDraft,
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
    activeSearchMatchId,
    setActiveSearchMatchId,

    // Zoom functions
    zoomTo,
    scaleRef,
    zoomDebounceRef,

    // Refs for child components
    hostRef,
    pdfDocRef,
    overlayRootsRef,
    overlayTick: selectTick,
    bumpOverlayTick: () => setSelectTick((tick) => tick + 1),
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

    // Overlay management
    ensureOverlayRootForPage,

    // Persistent selections
    persistentSelections: viewerState.persistentSelections,
    setPersistentSelections: viewerState.setPersistentSelections
  }
}
