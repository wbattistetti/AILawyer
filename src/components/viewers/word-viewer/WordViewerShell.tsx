/**
 * Word Viewer Shell - Componente principale per visualizzare documenti Word
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { WordViewerCore, WordViewerHandle } from './components/WordViewerCore'
import { useWordRectSelection } from './hooks/useWordRectSelection'
import { ViewerShellProps, ViewerSelection } from '../common/types/viewer.types'
import { PdfUnifiedToolbar } from '../pdf-viewer/components/PdfUnifiedToolbar'
import { SearchPanel } from '../pdf-viewer/components/SearchPanel'
import { usePdfSearchPanel } from '../pdf-viewer/hooks/usePdfSearchPanel'
import { usePdfPanelResizer } from '../pdf-viewer/hooks/usePdfPanelResizer'
import type { PersistentSelection } from '../pdf-viewer/types'
import { ExtractBlockOverlay } from '../pdf-viewer/components/ExtractBlockOverlay'
import { captureSelectionScreenshotWithFallback } from '../common/utils/screenshot'
import { viewportBoxToPercent } from '../common/utils/coordinateUtils'
import { useViewerOverlays } from '../common/hooks/useViewerOverlays'
import { DraftOverlay } from './components/DraftOverlay'
import type { DraftBox } from '../common/hooks/useRectSelection'
import type { RectSelection, ExtractedContent, ExtractCard } from '../common/types/viewer.types'
import { extractContentFromRect } from './utils/extractContentFromRect'
import { useCleanPdfZoom } from '../../../hooks/useCleanPdfZoom'

export const WordViewerShell: React.FC<ViewerShellProps> = ({
  fileUrl,
  page,
  onPageChange,
  hideToolbar = false,
  docId,
  praticaId,
  docName,
  hasNativeText = true,
  panelApi,
  isActive: isActiveProp
}) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<WordViewerHandle>(null)

  const [isActive, setIsActive] = React.useState<boolean>(() => {
    if (panelApi && typeof panelApi.isActive === 'boolean') {
      return panelApi.isActive
    }
    return isActiveProp ?? false
  })

  React.useEffect(() => {
    if (!panelApi) {
      setIsActive(isActiveProp ?? false)
      return
    }

    if (typeof panelApi.onDidActiveChange === 'function') {
      const disposable = panelApi.onDidActiveChange((event: any) => {
        setIsActive(event.isActive ?? false)
      })

      if (typeof panelApi.isActive === 'boolean') {
        setIsActive(panelApi.isActive)
      }

      return () => {
        disposable.dispose()
      }
    } else {
      if (typeof panelApi.isActive === 'boolean') {
        setIsActive(panelApi.isActive)
      }
    }
  }, [panelApi, isActiveProp, docId])

  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(page || 1)
  const [pageInput, setPageInput] = useState(String(page || 1))
  const [zoomPct, setZoomPct] = useState(100)
  const scaleRef = useRef<number>(1)
  const zoomDebounceRef = useRef<number | null>(null)

  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = usePdfSearchPanel()

  usePdfPanelResizer({
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

  const convertToPercent = useCallback((viewportBox: { x: number; y: number; w: number; h: number }) => {
    const host = hostRef.current
    if (!host) {
      return { x0Pct: 0, y0Pct: 0, x1Pct: 0, y1Pct: 0 }
    }
    return viewportBoxToPercent(viewportBox, host)
  }, [])

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
    onSelection: async (rect: RectSelection) => {
      try {
        const card: ExtractCard = {
          id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          rect: rect.rect,
          pageIndex: rect.pageIndex,
          viewerId: rect.viewerId,
          viewerType: 'word',
          createdAt: new Date()
        }

        const content = await extractContentFromRectImpl(rect)
        const pageNumber = rect.pageIndex + 1
        const percentCoords = rect.bbox || {
          x0Pct: 0,
          y0Pct: 0,
          x1Pct: 1,
          y1Pct: 1
        }

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
            console.warn('[WordViewerShell] Errore conversione Blob in data URL:', error)
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
          source: docName || 'Documento Word',
          imageDataUrl
        }

        setLastSelection({
          pdfPageNumber: pageNumber,
          viewportBox: persistentSelection.viewportBox,
          text: content.text || '',
          imageDataUrl
        })

        setPersistentSelections(prev => [...prev, persistentSelection])
      } catch (error) {
        console.error('[WordViewerShell] Errore in onSelection:', error)
      }
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
              hasNativeText={false}
            />
          )}
        </div>

        {/* Search Panel */}
        {showAdvanced && (
          <SearchPanel
            searchQ={searchQ}
            onSearchQChange={setSearchQ}
            onClose={() => setShowAdvanced(false)}
            panelW={panelW}
            setPanelW={setPanelW}
            resizingRef={resizingRef}
            onSearch={async (query) => {
              // TODO: Implementare ricerca nel contenuto Word
            }}
          />
        )}
      </div>

    </div>
  )
}
