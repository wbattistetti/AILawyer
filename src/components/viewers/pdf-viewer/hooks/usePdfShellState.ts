import { useRef, useState, useCallback } from 'react'
import type { ExtractCard } from '../../common/types/viewer.types'
import { usePdfViewerState } from './usePdfViewerState'
import { usePdfSearch } from './usePdfSearch'
import { useNativeSelection } from './useNativeSelection'
import { usePdfDeskew } from './usePdfDeskew'
import { usePdfAudit } from './usePdfAudit'
import { usePdfAnnotations } from './usePdfAnnotations'
import { usePdfJumpTo } from './usePdfJumpTo'
import { useDocumentSearchPanel } from '../../../search/useDocumentSearchPanel'
import { usePdfDocument } from './usePdfDocument'
import { usePdfNativeStyles } from './usePdfNativeStyles'
import { usePdfOverlays } from './usePdfOverlays'
import { usePdfExtract } from './usePdfExtract'
import { useRectSelection, type DraftBox } from '../../common/hooks/useRectSelection'
import { captureSelectionScreenshotWithFallback } from '../../common/utils/screenshot'
import type { PersistentSelection } from '../types'
import type { RectSelection, ExtractedContent, ExtractCard } from '../../common/types/viewer.types'
import { extractContentFromRect } from '../utils/extractContentFromRect'

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
  viewerReadyTick?: number
}

export function usePdfShellState({ hostRef, fileUrl, docId, onPageChange, viewerRef, isActive = false, viewerReadyTick = 0, isExtractOverlayOpen = false }: UsePdfShellStateProps) {
  // Core state hooks
  const viewerState = usePdfViewerState()
  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = useDocumentSearchPanel()
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
  const { overlayRootsRef, selectRootsRef, pageElsRef, elToPageRef, ensureOverlayRootForPage } = usePdfOverlays({
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
  const { goToMatch } = usePdfJumpTo({
    docId,
    hostRef,
    viewerRef,
    overlayRootsRef,
    pageElsRef, // ✅ Aggiunto per creare overlay root nel posto giusto
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
    enabled: true, // ✅ Sempre abilitato (come Word) - elimina dipendenza da selectMode
    hostRef: hostRef as React.RefObject<HTMLElement>,
    hostReadyTick: viewerReadyTick,
    pageElsRef, // ✅ Usa pageElsRef per calcolare coordinate rispetto alla pagina
    isOverlayOpen: isExtractOverlayOpen, // ✅ Passa stato React invece di controllare DOM
    onDraftChange: useCallback((draftBox: DraftBox | null) => {
      // ✅ Converti DraftBox in Annotation per AnnotationOverlays
      if (draftBox) {
        const hasOverlayRoot = overlayRootsRef.current.has(draftBox.page)
        const allRoots = Array.from(overlayRootsRef.current.keys())
        const overlayRootInDOM = hasOverlayRoot ? document.contains(overlayRootsRef.current.get(draftBox.page)!) : false

        // ✅ Se il root non esiste o non è nel DOM, prova a ricrearlo
        if (!hasOverlayRoot || !overlayRootInDOM) {
          console.warn('[RECT-SEL] ⚠️ Draft creato SENZA overlayRoot:', {
            page: draftBox.page,
            hasOverlayRoot,
            overlayRootInDOM,
            allRoots
          })

          // ✅ Prova a ricreare il root
          if (ensureOverlayRootForPage) {
            const recreated = ensureOverlayRootForPage(draftBox.page)
            if (recreated) {
              console.log('[RECT-SEL] ✅ OverlayRoot ricreato per pagina:', draftBox.page)
            } else {
              console.warn('[RECT-SEL] ⚠️ Impossibile ricreare overlayRoot per pagina:', draftBox.page)
            }
          }
        }

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
    }, [setDraft, overlayRootsRef]),
    onSelection: useCallback(async (rect: RectSelection) => {
      try {
        // ✅ 1. Crea ExtractCard viewer-agnostica (SOLO rettangolo, senza contenuto)
        const card: ExtractCard = {
          id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          rect: rect.rect,
          pageIndex: rect.pageIndex,
          viewerId: rect.viewerId,
          viewerType: 'pdf',
          // ✅ content non viene incluso qui - viene estratto solo quando necessario
          createdAt: new Date()
        }

        // ✅ 2. Estrai contenuto SOLO quando necessario (per PersistentSelection/overlay)
        const content = await extractContentFromRectImpl(rect)

        // ✅ 3. Converti ExtractCard in PersistentSelection (per retrocompatibilità con UI esistente)
        const pageNumber = rect.pageIndex + 1 // ✅ Converti a 1-based
        const percentCoords = rect.bbox || {
          x0Pct: 0,
          y0Pct: 0,
          x1Pct: 1,
          y1Pct: 1
        }

        // ✅ Converti imageSnippet (Blob) in imageDataUrl (string) per PersistentSelection
        let imageDataUrl: string | undefined
        if (content.imageSnippet) {
          try {
            imageDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(content.imageSnippet!)
            })
          } catch (error) {
            console.warn('[PdfShellState] Errore conversione Blob in data URL:', error)
          }
        }

        const persistentSelection: PersistentSelection = {
          id: card.id,
          page: pageNumber,
          x0Pct: percentCoords.x0Pct,
          y0Pct: percentCoords.y0Pct,
          x1Pct: percentCoords.x1Pct,
          y1Pct: percentCoords.y1Pct,
          text: content.text || '',
          viewportBox: {
            x: rect.rect.x,
            y: rect.rect.y,
            w: rect.rect.width,
            h: rect.rect.height
          },
          source: docId || 'Documento',
          imageDataUrl
        }

        // ✅ 4. Salva lastSelection per ExtractBlockOverlay
        viewerState.setLastSelection({
          pdfPageNumber: pageNumber,
          viewportBox: persistentSelection.viewportBox,
          text: content.text || '',
          imageDataUrl
        })

        // ✅ 5. Aggiungi alla lista di persistent selections
        viewerState.setPersistentSelections(prev => [...prev, persistentSelection])

        // ✅ 6. Dispatch evento per ExtractCard (opzionale, per integrazione futura)
        // window.dispatchEvent(new CustomEvent('app:extract-card-created', { detail: { card } }))

      } catch (error) {
        console.error('[PdfShellState] Errore in onSelection:', error)
      }
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

    // Overlay management
    ensureOverlayRootForPage,

    // Persistent selections
    persistentSelections: viewerState.persistentSelections,
    setPersistentSelections: viewerState.setPersistentSelections
  }
}
