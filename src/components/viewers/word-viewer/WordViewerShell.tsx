/**
 * Word Viewer Shell - Componente principale per visualizzare documenti Word
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { WordViewerCore, WordViewerHandle } from './components/WordViewerCore'
import { useWordRectSelection } from './hooks/useWordRectSelection'
import { ViewerShellProps } from '../common/types/viewer.types'
import { PdfUnifiedToolbar } from '../pdf-viewer/components/PdfUnifiedToolbar'
import { DocumentSearchPanel } from '../../search/DocumentSearchPanel'
import { useDocumentSearchPanel } from '../../search/useDocumentSearchPanel'
import { useDocumentSearchPanelResizer } from '../../search/useDocumentSearchPanelResizer'
import type { PersistentSelection } from '../pdf-viewer/types'
import { ExtractBlockOverlay } from '../pdf-viewer/components/ExtractBlockOverlay'
import { useViewerOverlays } from '../common/hooks/useViewerOverlays'
import { DraftOverlay } from './components/DraftOverlay'
import type { DraftBox } from '../common/hooks/useRectSelection'
import type { RectSelection, ExtractedContent, ExtractCard } from '../common/types/viewer.types'
import { extractContentFromRect } from './utils/extractContentFromRect'
import { resolveExtractImageDataUrl } from '../common/utils/resolveExtractImageDataUrl'
import { useCleanPdfZoom } from '../../../hooks/useCleanPdfZoom'
import { createWordSearchAdapter } from './wordSearchAdapter'
import { useOptionalViewerSearchNavigatorRegistry } from '../../search/ViewerSearchNavigatorProvider'

export const WordViewerShell: React.FC<ViewerShellProps> = ({
  fileUrl,
  page,
  onPageChange,
  hideToolbar = false,
  docId,
  praticaId,
  docName,
  hasNativeText = true,
  panelApi
}) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<WordViewerHandle>(null)

  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(page || 1)
  const [pageInput, setPageInput] = useState(String(page || 1))
  const [zoomPct, setZoomPct] = useState(100)
  const scaleRef = useRef<number>(1)
  const zoomDebounceRef = useRef<number | null>(null)

  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = useDocumentSearchPanel()

  useDocumentSearchPanelResizer({
    resizingRef,
    setPanelW
  })

  const zoomTo = useCallback((scale: number) => {
    scaleRef.current = scale
    viewerRef.current?.zoomTo(scale)

    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current)
    }
    zoomDebounceRef.current = window.setTimeout(() => {
      setZoomPct(Math.round(scale * 100))
    }, 100)
  }, [])

  const { containerRef: zoomContainerRef } = useCleanPdfZoom({
    zoomToPlugin: zoomTo,
    getCurrentScale: () => scaleRef.current || 1
  })

  const [persistentSelections, setPersistentSelections] = useState<PersistentSelection[]>([])
  const [lastSelection, setLastSelection] = useState<any | null>(null)
  const [selectKind, setSelectKind] = useState<'NATIVE' | 'OCR'>('OCR')
  const [draft, setDraft] = useState<DraftBox | null>(null)

  const { pageElsRef, overlayRootsRef } = useViewerOverlays({
    hostRef,
    pageSelector: '[data-page]',
    getPageNumber: (el) => {
      const pageAttr = el.getAttribute('data-page')
      if (!pageAttr) return null
      const parsed = parseInt(pageAttr, 10)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
  })

  const extractContentFromRectImpl = useCallback(async (rect: RectSelection): Promise<ExtractedContent> => {
    return extractContentFromRect(rect, {
      hostRef,
      pageElsRef,
      hasNativeText: hasNativeText ?? true
    })
  }, [hostRef, pageElsRef, hasNativeText])

  useWordRectSelection({
    viewerId: docId || 'word-viewer',
    enabled: true,
    hostRef,
    onDraftChange: setDraft,
    pageElsRef,
    onSelection: (rect: RectSelection) => {
      const card: ExtractCard = {
        id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        rect: rect.rect,
        pageIndex: rect.pageIndex,
        viewerId: rect.viewerId,
        viewerType: 'word',
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

      // Optimistic UI: mount ExtractBlockOverlay immediately with geometry only.
      const persistentSelection: PersistentSelection = {
        id: card.id,
        page: pageNumber,
        x0Pct: percentCoords.x0Pct,
        y0Pct: percentCoords.y0Pct,
        x1Pct: percentCoords.x1Pct,
        y1Pct: percentCoords.y1Pct,
        text: '',
        viewportBox,
        source: docName || 'Documento Word',
        contentReady: false
      }

      setLastSelection({
        pdfPageNumber: pageNumber,
        viewportBox,
        text: '',
        imageDataUrl: undefined
      })
      setPersistentSelections(prev => [...prev, persistentSelection])

      void (async () => {
        try {
          const content = await extractContentFromRectImpl(rect)
          const imageDataUrl = resolveExtractImageDataUrl(content)
          const text = content.text || ''

          setLastSelection({
            pdfPageNumber: pageNumber,
            viewportBox,
            text,
            imageDataUrl
          })
          setPersistentSelections(prev =>
            prev.map(selection =>
              selection.id === card.id
                ? { ...selection, text, imageDataUrl, contentReady: true }
                : selection
            )
          )
        } catch (error) {
          console.error('[WordViewerShell] Errore estrazione contenuto:', error)
          setPersistentSelections(prev =>
            prev.map(selection =>
              selection.id === card.id
                ? { ...selection, contentReady: true }
                : selection
            )
          )
        }
      })()
    }
  })

  const handleDocumentLoad = useCallback((pages: number) => {
    setTotalPages(pages)
    setPageInput('1')
    setCurrentPage(1)
  }, [])

  const handleJumpToPage = useCallback((pageNum: number) => {
    const page = Math.max(1, Math.min(pageNum, totalPages))
    setCurrentPage(page)
    setPageInput(String(page))
    viewerRef.current?.jumpToPage(page)
    onPageChange?.(page)
  }, [totalPages, onPageChange])

  const handleZoom = useCallback((scale: number) => {
    scaleRef.current = scale
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current)
    }
    zoomDebounceRef.current = window.setTimeout(() => {
      setZoomPct(Math.round(scale * 100))
    }, 100)
  }, [])

  const [tool, setTool] = useState<any>('select')
  const [audit, setAudit] = useState(false)
  const [autoDeskew, setAutoDeskew] = useState(false)
  const [skewAngles, setSkewAngles] = useState<Record<number, number>>({})
  const searchAdapter = useMemo(
    () => createWordSearchAdapter({
      docId: docId || `word:${fileUrl}`,
      docName: docName || 'Documento Word',
      totalPages,
      hostRef,
      viewerRef
    }),
    [docId, docName, fileUrl, totalPages]
  )
  const viewerNavigatorRegistry = useOptionalViewerSearchNavigatorRegistry()

  useEffect(() => {
    if (!viewerNavigatorRegistry || !docId?.trim()) return
    return viewerNavigatorRegistry.register({
      documentId: docId,
      kind: 'word',
      goToMatch: async (match) => {
        const localMatches = await searchAdapter.search(match.q, 'current')
        const ordinal = match.ord ?? 0
        const localMatch = localMatches[ordinal]
        if (!localMatch) {
          throw new Error(
            `Occorrenza Word ${ordinal + 1} non disponibile per "${match.q}"`
          )
        }
        await searchAdapter.goToMatch(localMatch)
      }
    })
  }, [viewerNavigatorRegistry, docId, searchAdapter])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar - riutilizza PdfUnifiedToolbar (nasconde funzionalità PDF-specific) */}
      {!hideToolbar && (
        <PdfUnifiedToolbar
          totalPages={totalPages}
          pageInput={pageInput}
          onPageInputChange={setPageInput}
          onJump={handleJumpToPage}
          searchQ={searchQ}
          onSearchQChange={setSearchQ}
          onOpenSearchPanel={() => setShowAdvanced(true)}
          showAdvanced={showAdvanced}
          onCloseSearchPanel={() => setShowAdvanced(false)}
          tool={tool}
          setTool={setTool}
          audit={audit}
          setAudit={setAudit}
          autoDeskew={autoDeskew}
          setAutoDeskew={setAutoDeskew}
          skewAngles={skewAngles}
          setSkewAngles={setSkewAngles}
          selectKind={selectKind}
          setSelectKind={setSelectKind}
          zoomPct={zoomPct}
          setZoomPct={setZoomPct}
          scaleRef={scaleRef}
          zoomDebounceRef={zoomDebounceRef}
          hostRef={hostRef}
          estimateSkewForPage={async () => 0}
          persistSkew={() => {}}
          applyImmediateToPage={() => {}}
          zoomTo={zoomTo}
          setShowAdvanced={setShowAdvanced}
          panelApi={panelApi}
        />
      )}

      {/* Content area: Word viewer + Search panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Word Viewer */}
        <div
          ref={(el) => {
            hostRef.current = el
            if (zoomContainerRef) {
              (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            }
          }}
          className="flex-1 overflow-auto relative min-h-0 bg-background"
        >
          <WordViewerCore
            ref={viewerRef}
            fileUrl={fileUrl}
            page={currentPage}
            onPageChange={(page) => {
              setCurrentPage(page)
              setPageInput(String(page))
              onPageChange?.(page)
            }}
            docId={docId}
            hostRef={hostRef}
            onDocumentLoad={handleDocumentLoad}
            onZoom={handleZoom}
          />

          {draft && (
            <DraftOverlay
              draft={draft}
              pageElsRef={pageElsRef}
              overlayRootsRef={overlayRootsRef}
              hostRef={hostRef}
            />
          )}

          {persistentSelections.length > 0 && (
            <ExtractBlockOverlay
              selection={persistentSelections[persistentSelections.length - 1]}
              pageElsRef={pageElsRef}
              overlayRootsRef={overlayRootsRef}
              lastSelection={lastSelection}
              onClose={() => {
                setPersistentSelections(prev => prev.slice(0, -1))
              }}
              setPersistentSelections={setPersistentSelections}
              docName={docName}
              hasNativeText={hasNativeText ?? true}
              praticaId={praticaId}
            />
          )}
        </div>

        <DocumentSearchPanel
          adapter={searchAdapter}
          isOpen={showAdvanced}
          onOpenChange={setShowAdvanced}
          width={panelW}
          resizingRef={resizingRef}
          query={searchQ}
          onQueryChange={setSearchQ}
          enableExpandedContext={false}
          copyPageTextOnNavigate={false}
        />
      </div>

    </div>
  )
}
