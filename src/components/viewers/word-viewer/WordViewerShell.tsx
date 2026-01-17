/**
 * ✅ Word Viewer Shell - Componente principale per visualizzare documenti Word
 * Riutilizza logica comune dal PDF viewer dove possibile
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
import { captureSelectionScreenshot } from '../common/utils/screenshot'
import { viewportBoxToPercent } from '../common/utils/coordinateUtils'
import { useViewerOverlays } from '../common/hooks/useViewerOverlays'
import { DraftOverlay } from './components/DraftOverlay'
import type { DraftBox } from '../common/hooks/useRectSelection'

export const WordViewerShell: React.FC<ViewerShellProps> = ({
  fileUrl,
  page,
  onPageChange,
  hideToolbar = false,
  docId,
  praticaId,
  docName,
  hasNativeText = true, // Word ha sempre testo nativo
  isActive = false // ✅ Default false per sicurezza
}) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<WordViewerHandle>(null)

  // ✅ State management
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(page || 1)
  const [pageInput, setPageInput] = useState(String(page || 1))
  const [zoomPct, setZoomPct] = useState(100)
  const scaleRef = useRef<number>(1)
  const zoomDebounceRef = useRef<number | null>(null)

  // ✅ Search panel state
  const { searchQ, setSearchQ, showAdvanced, setShowAdvanced, panelW, setPanelW, resizingRef } = usePdfSearchPanel()

  // ✅ Panel resizer
  usePdfPanelResizer({
    resizingRef,
    setPanelW
  })

  // ✅ State per persistent selections (come PDF viewer)
  const [persistentSelections, setPersistentSelections] = useState<PersistentSelection[]>([])
  const [lastSelection, setLastSelection] = useState<any | null>(null)
  const [selectKind, setSelectKind] = useState<'NATIVE' | 'OCR'>('OCR') // ✅ Sempre OCR-style (solo drag rettangolo)
  const [draft, setDraft] = useState<DraftBox | null>(null) // ✅ Rettangolo draft durante drag

  // ✅ Helper per convertire viewportBox in coordinate percentuali (usa utility comune)
  const convertToPercent = useCallback((viewportBox: { x: number; y: number; w: number; h: number }) => {
    const host = hostRef.current
    if (!host) {
      return { x0Pct: 0, y0Pct: 0, x1Pct: 0, y1Pct: 0 }
    }
    return viewportBoxToPercent(viewportBox, host)
  }, [])

  // ✅ Gestione overlay roots (usa hook comune)
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

  // ✅ Selection hook (solo drag rettangolo)
  useWordRectSelection({
    viewerId: docId || 'word-viewer', // ✅ ID univoco per isolamento
    enabled: true,
    isActive, // ✅ Passa isActive per isolamento
    hostRef,
    onDraftChange: setDraft, // ✅ Aggiorna draft durante drag
    pageElsRef, // ✅ PASSATO: per calcolare coordinate rispetto alla pagina
    onSelection: async (selection) => {
      // ✅ Se abbiamo pageElsRef, calcola coordinate percentuali rispetto alla pagina
      let percentCoords: { x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }

      const pageEl = pageElsRef.current.get(selection.pageNumber)
      if (pageEl) {
        // ✅ Calcola rispetto alla pagina (come PDF viewer)
        const pageRect = pageEl.getBoundingClientRect()
        const hostRect = hostRef.current?.getBoundingClientRect()

        if (hostRect) {
          // ✅ Converti viewportBox (host) in coordinate pagina
          const offsetX = pageRect.left - hostRect.left
          const offsetY = pageRect.top - hostRect.top

          const x0Page = selection.viewportBox.x - offsetX
          const y0Page = selection.viewportBox.y - offsetY
          const x1Page = x0Page + selection.viewportBox.w
          const y1Page = y0Page + selection.viewportBox.h

          percentCoords = {
            x0Pct: x0Page / pageRect.width,
            y0Pct: y0Page / pageRect.height,
            x1Pct: x1Page / pageRect.width,
            y1Pct: y1Page / pageRect.height
          }
        } else {
          // ✅ Fallback: usa convertToPercent
          percentCoords = convertToPercent(selection.viewportBox)
        }
      } else {
        // ✅ Fallback: usa convertToPercent
        percentCoords = convertToPercent(selection.viewportBox)
      }

      // ✅ Cattura screenshot (sempre, come richiesto)
      let imageDataUrl: string | undefined
      try {
        if (hostRef.current) {
          imageDataUrl = await captureSelectionScreenshot(hostRef.current, selection.viewportBox)
        }
      } catch (error) {
        console.warn('[WordViewerShell] Errore durante cattura screenshot:', error)
      }

      const persistentSelection: PersistentSelection = {
        id: `word-persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        page: selection.pageNumber,
        x0Pct: percentCoords.x0Pct,
        y0Pct: percentCoords.y0Pct,
        x1Pct: percentCoords.x1Pct,
        y1Pct: percentCoords.y1Pct,
        text: '', // ✅ Sempre vuoto - solo screenshot
        viewportBox: selection.viewportBox,
        source: docName || 'Documento Word',
        imageDataUrl // ✅ Screenshot già catturato
      }

      // ✅ Salva lastSelection per ExtractBlockOverlay
      setLastSelection({
        pdfPageNumber: selection.pageNumber,
        viewportBox: selection.viewportBox,
        text: '',
        imageDataUrl
      })

      // ✅ Aggiungi alla lista di persistent selections
      setPersistentSelections(prev => [...prev, persistentSelection])
    }
  })

  // ✅ Handlers
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
    setZoomPct(Math.round(scale * 100))
  }, [])

  const zoomTo = useCallback((scale: number) => {
    scaleRef.current = scale
    viewerRef.current?.zoomTo(scale)
    setZoomPct(Math.round(scale * 100))
  }, [])

  // ✅ Toolbar state (semplificato per Word - no deskew, audit, etc.)
  const [tool, setTool] = useState<any>('select')
  const [audit, setAudit] = useState(false)
  const [autoDeskew, setAutoDeskew] = useState(false)
  const [skewAngles, setSkewAngles] = useState<Record<number, number>>({})

  // ✅ Extract dialog handlers - gestiti direttamente da ExtractDialog
  // Il dialog gestisce il salvataggio tramite l'evento 'app:extract-add'

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
          ref={hostRef}
          className="flex-1 overflow-auto relative min-h-0 bg-white"
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

          {/* ✅ Rettangolo draft durante drag */}
          {draft && (
            <DraftOverlay
              draft={draft}
              pageElsRef={pageElsRef}
              overlayRootsRef={overlayRootsRef}
              hostRef={hostRef} // ✅ AGGIUNTO: per conversione host→pagina se coordSpace === 'host'
            />
          )}

          {/* ✅ ExtractBlockOverlay per l'ultima selezione (riutilizza quello del PDF viewer) */}
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
              hasNativeText={false} // ✅ Word sempre OCR-style (solo screenshot)
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
            // ✅ Per Word, la ricerca è semplice text search nell'HTML
            onSearch={async (query) => {
              // TODO: Implementare ricerca nel contenuto Word
              console.log('[WordViewerShell] Search:', query)
            }}
          />
        )}
      </div>

    </div>
  )
}
