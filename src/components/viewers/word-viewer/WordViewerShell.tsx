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
import { captureSelectionScreenshotWithFallback } from '../common/utils/screenshot'
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
      const host = hostRef.current
      const hostRect = host?.getBoundingClientRect()

      if (pageEl && hostRect && host) {
        // ✅ Calcola rispetto alla pagina (come PDF viewer)
        const pageRect = pageEl.getBoundingClientRect()

        // ✅ IMPORTANTE: selection.viewportBox è relativo al host (considerando scroll)
        // Per convertirlo in coordinate relative alla pagina:
        // 1. Converti da host (con scroll) a coordinate assolute (viewport)
        // 2. Converti da coordinate assolute a coordinate relative alla pagina

        // ✅ IMPORTANTE: viewportBox è relativo al viewport del host
        // Per ottenere coordinate assolute (viewport), devo aggiungere hostRect.left/top
        // getBoundingClientRect() già considera lo scroll automaticamente
        const x0Absolute = selection.viewportBox.x + hostRect.left
        const y0Absolute = selection.viewportBox.y + hostRect.top
        const x1Absolute = x0Absolute + selection.viewportBox.w
        const y1Absolute = y0Absolute + selection.viewportBox.h

        // Coordinate relative alla pagina (in pixel)
        const x0Page = x0Absolute - pageRect.left
        const y0Page = y0Absolute - pageRect.top
        const x1Page = x1Absolute - pageRect.left
        const y1Page = y1Absolute - pageRect.top

        // ✅ Converti in percentuali (clamp tra 0 e 1)
        // IMPORTANTE: usa pageRect.width/height per le percentuali
        percentCoords = {
          x0Pct: Math.max(0, Math.min(1, x0Page / pageRect.width)),
          y0Pct: Math.max(0, Math.min(1, y0Page / pageRect.height)),
          x1Pct: Math.max(0, Math.min(1, x1Page / pageRect.width)),
          y1Pct: Math.max(0, Math.min(1, y1Page / pageRect.height))
        }
      } else {
        // ✅ Fallback: usa convertToPercent (coordinate relative al host)
        percentCoords = convertToPercent(selection.viewportBox)
        console.warn('[WordViewerShell][onSelection] Fallback a convertToPercent:', {
          hasPageEl: !!pageEl,
          hasHostRect: !!hostRect,
          pageNumber: selection.pageNumber
        })
      }

      // ✅ Crea persistentSelection IMMEDIATAMENTE (senza screenshot)
      const selectionId = `word-persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const persistentSelection: PersistentSelection = {
        id: selectionId,
        page: selection.pageNumber,
        x0Pct: percentCoords.x0Pct,
        y0Pct: percentCoords.y0Pct,
        x1Pct: percentCoords.x1Pct,
        y1Pct: percentCoords.y1Pct,
        text: '', // ✅ Sempre vuoto - solo screenshot
        viewportBox: selection.viewportBox,
        source: docName || 'Documento Word',
        imageDataUrl: undefined // ✅ Sarà aggiornato quando lo screenshot è pronto
      }

      // ✅ Salva lastSelection per ExtractBlockOverlay (IMMEDIATAMENTE)
      setLastSelection({
        pdfPageNumber: selection.pageNumber,
        viewportBox: selection.viewportBox,
        text: '',
        imageDataUrl: undefined // ✅ Sarà aggiornato quando lo screenshot è pronto
      })

      // ✅ Aggiungi alla lista di persistent selections (IMMEDIATAMENTE)
      setPersistentSelections(prev => [...prev, persistentSelection])

      // ✅ Cattura screenshot VELOCE immediato + ad alta risoluzione in background
      if (hostRef.current) {
        captureSelectionScreenshotWithFallback(hostRef.current, selection.viewportBox)
          .then(({ fast, highQuality }) => {
            // ✅ Mostra subito screenshot veloce (scale: 1) - ~0.5-1 sec invece di ~2 sec
            setPersistentSelections(prev =>
              prev.map(ps =>
                ps.id === selectionId
                  ? { ...ps, imageDataUrl: fast }
                  : ps
              )
            )

            setLastSelection(prev =>
              prev ? { ...prev, imageDataUrl: fast } : prev
            )

            // ✅ Sostituisci con screenshot ad alta risoluzione quando pronto (scale: 2)
            // Non blocca l'UI - l'utente vede già qualcosa
            highQuality
              .then((highResImage) => {
                // ✅ Verifica che la selezione esista ancora (evita race conditions)
                setPersistentSelections(prev => {
                  const exists = prev.some(ps => ps.id === selectionId)
                  if (!exists) return prev

                  return prev.map(ps =>
                    ps.id === selectionId
                      ? { ...ps, imageDataUrl: highResImage }
                      : ps
                  )
                })

                setLastSelection(prev => {
                  if (!prev) return prev
                  // ✅ Verifica che sia ancora la stessa selezione
                  return { ...prev, imageDataUrl: highResImage }
                })
              })
              .catch((error) => {
                console.warn('[WordViewerShell] Errore durante cattura screenshot ad alta risoluzione:', error)
                // ✅ Non è critico - l'utente ha già lo screenshot veloce
              })
          })
          .catch((error) => {
            console.warn('[WordViewerShell] Errore durante cattura screenshot:', error)
          })
      }
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
