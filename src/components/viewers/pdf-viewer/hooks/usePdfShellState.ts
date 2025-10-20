import { useRef } from 'react'
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

interface UsePdfShellStateProps {
  hostRef: React.MutableRefObject<HTMLDivElement | null>
  fileUrl: string
  docId?: string
  pageNav: any
  search: any
  zoom: any
}

export function usePdfShellState({ hostRef, fileUrl, docId, pageNav, search, zoom }: UsePdfShellStateProps) {
  // Core state hooks
  const viewerState = usePdfViewerState()
  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = usePdfSearchPanel()
  const { totalPages, setTotalPages, pageInput, setPageInput, zoomPct, setZoomPct, searchCacheRef, matches, setMatches, runSearch } = usePdfSearch(docId, fileUrl)
  const lastOcrMatchesRef = useRef<Array<{ page:number; x0Pct:number; y0Pct:number; x1Pct:number; y1Pct:number }>>([])
  
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
    if (typeof zoom.zoomTo === 'function') {
      zoom.zoomTo(scale)
    }
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
    pageNav, 
    searchPluginInstance: search,
    overlayRootsRef,
    setSelectedAnnot: viewerState.setSelectedAnnot,
    areas,
    setAreas,
    searchCacheRef,
    fileUrl
  })
  
  const selectionHandledRef = useRef(false)
  
  // Native selection (simplified interface)
  const nativeSelection = useNativeSelection({
    selectMode: true,
    selectKind: 'NATIVE',
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
    selectionHandledRef
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
      try { pageNav.jumpToPage?.(page - 1) } catch {}
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
    suppressClearRef
  }
}
