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
  hasNativeText = true, // Word ha sempre testo nativo
  panelApi,
  isActive: isActiveProp // ✅ Mantenuto per retrocompatibilità
}) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<WordViewerHandle>(null)

  // ✅ State interno per gestire l'attivazione via panelApi.onDidActiveChange
  const [isActive, setIsActive] = React.useState<boolean>(() => {
    // ✅ Inizializza con panelApi.isActive se disponibile, altrimenti usa prop legacy
    if (panelApi && typeof panelApi.isActive === 'boolean') {
      return panelApi.isActive
    }
    return isActiveProp ?? false
  })

  // ✅ Registra listener per onDidActiveChange se panelApi è disponibile
  React.useEffect(() => {
    if (!panelApi) {
      // ✅ Se non c'è panelApi, usa prop legacy
      console.log('[WORD-VIEWER] panelApi non disponibile, uso prop legacy:', { docId, isActiveProp })
      setIsActive(isActiveProp ?? false)
      return
    }

    console.log('[WORD-VIEWER] panelApi disponibile:', { docId, hasOnDidActiveChange: typeof panelApi.onDidActiveChange === 'function', isActive: panelApi.isActive })

    // ✅ Verifica se onDidActiveChange esiste
    if (typeof panelApi.onDidActiveChange === 'function') {
      const disposable = panelApi.onDidActiveChange((event: any) => {
        // ✅ event.isActive è boolean che indica se il pannello è attivo
        console.log('[WORD-VIEWER] onDidActiveChange chiamato:', { docId, isActive: event.isActive, event })
        setIsActive(event.isActive ?? false)
      })

      // ✅ Controlla anche lo stato iniziale
      if (typeof panelApi.isActive === 'boolean') {
        console.log('[WORD-VIEWER] Stato iniziale da panelApi.isActive:', { docId, isActive: panelApi.isActive })
        setIsActive(panelApi.isActive)
      }

      return () => {
        disposable.dispose()
      }
    } else {
      // ✅ Fallback: usa proprietà diretta se disponibile
      console.warn('[WORD-VIEWER] onDidActiveChange non disponibile, uso fallback:', { docId, isActive: panelApi.isActive })
      if (typeof panelApi.isActive === 'boolean') {
        setIsActive(panelApi.isActive)
      }
    }
  }, [panelApi, isActiveProp, docId])

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

  // ✅ zoomTo deve essere definito PRIMA di useCleanPdfZoom
  const zoomTo = useCallback((scale: number) => {
    const prevScale = scaleRef.current
    scaleRef.current = scale

    console.log('🔵 [WORD-ZOOM][zoomTo-Shell] ===== ZOOM WORD VIEWER CHIAMATO =====', {
      timestamp: Date.now(),
      prevScale: prevScale.toFixed(3),
      newScale: scale.toFixed(3),
      delta: Math.abs(scale - prevScale).toFixed(3),
      hasViewerRef: !!viewerRef.current,
      caller: new Error().stack?.split('\n')[2]
    })

    // ✅ Fix: Salva beforeRect PRIMA del requestAnimationFrame (fuori dall'if)
    const beforeRect = hostRef.current?.getBoundingClientRect()

    if (hostRef.current && beforeRect) {
      console.log('[WORD-ZOOM][zoomTo-Shell] Prima di chiamare viewerRef.zoomTo', {
        hostRect: {
          width: beforeRect.width.toFixed(2),
          height: beforeRect.height.toFixed(2)
        },
        currentScaleFactor: hostRef.current.style.getPropertyValue('--scale-factor')
      })
    }

    viewerRef.current?.zoomTo(scale)

    requestAnimationFrame(() => {
      if (hostRef.current && beforeRect) {
        const afterRect = hostRef.current.getBoundingClientRect()
        console.log('[WORD-ZOOM][zoomTo-Shell] Dopo viewerRef.zoomTo', {
          hostRect: {
            width: afterRect.width.toFixed(2),
            height: afterRect.height.toFixed(2)
          },
          newScaleFactor: hostRef.current.style.getPropertyValue('--scale-factor'),
          widthChanged: Math.abs(afterRect.width - beforeRect.width) > 0.1,
          heightChanged: Math.abs(afterRect.height - beforeRect.height) > 0.1
        })
      }
    })

    // ✅ Debounce setZoomPct per evitare re-render durante lo zoom continuo
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current)
    }
    zoomDebounceRef.current = window.setTimeout(() => {
      console.log('[WORD-ZOOM][zoomTo-Shell] Aggiornamento zoomPct dopo debounce', {
        scale: scale.toFixed(3),
        zoomPct: Math.round(scale * 100)
      })
      setZoomPct(Math.round(scale * 100))
    }, 100) // Aggiorna solo dopo 100ms di inattività
  }, [])

  // ✅ Zoom hook per Ctrl+rotella (stesso del PDF viewer)
  // ✅ IMPORTANTE: Questo intercetta Ctrl+rotella e chiama zoomTo del Word viewer
  const { containerRef: zoomContainerRef } = useCleanPdfZoom({
    zoomToPlugin: (scale: number) => {
      // ✅ Chiama zoomTo del Word viewer invece del PDF viewer
      zoomTo(scale)
    },
    getCurrentScale: () => scaleRef.current || 1
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

  // ✅ Funzione per estrarre contenuto da rettangolo (specifica del viewer)
  const extractContentFromRectImpl = useCallback(async (rect: RectSelection): Promise<ExtractedContent> => {
    return extractContentFromRect(rect, {
      hostRef,
      pageElsRef,
      hasNativeText: hasNativeText ?? true // Word ha sempre testo nativo
    })
  }, [hostRef, pageElsRef, hasNativeText])

  // ✅ Selection hook (solo drag rettangolo)
  useWordRectSelection({
    viewerId: docId || 'word-viewer', // ✅ ID univoco per isolamento
    enabled: true,
    hostRef,
    onDraftChange: setDraft, // ✅ Aggiorna draft durante drag
    pageElsRef, // ✅ PASSATO: per calcolare coordinate rispetto alla pagina
    onSelection: async (rect: RectSelection) => {
      try {
        // ✅ 1. Crea ExtractCard viewer-agnostica (SOLO rettangolo, senza contenuto)
        const card: ExtractCard = {
          id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          rect: rect.rect,
          pageIndex: rect.pageIndex,
          viewerId: rect.viewerId,
          viewerType: 'word',
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

        // ✅ 4. Salva lastSelection per ExtractBlockOverlay
        setLastSelection({
          pdfPageNumber: pageNumber,
          viewportBox: persistentSelection.viewportBox,
          text: content.text || '',
          imageDataUrl
        })

        // ✅ 5. Aggiungi alla lista di persistent selections
        setPersistentSelections(prev => [...prev, persistentSelection])

        // ✅ 6. Dispatch evento per ExtractCard (opzionale, per integrazione futura)
        // window.dispatchEvent(new CustomEvent('app:extract-card-created', { detail: { card } }))

      } catch (error) {
        console.error('[WordViewerShell] Errore in onSelection:', error)
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
    const prevScale = scaleRef.current
    scaleRef.current = scale

    console.log('[WORD-ZOOM][handleZoom] Chiamato', {
      timestamp: Date.now(),
      prevScale: prevScale.toFixed(3),
      newScale: scale.toFixed(3),
      delta: Math.abs(scale - prevScale).toFixed(3)
    })

    // ✅ Debounce setZoomPct per evitare re-render durante lo zoom continuo
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current)
    }
    zoomDebounceRef.current = window.setTimeout(() => {
      console.log('[WORD-ZOOM][handleZoom] Aggiornamento zoomPct dopo debounce', {
        scale: scale.toFixed(3),
        zoomPct: Math.round(scale * 100)
      })
      setZoomPct(Math.round(scale * 100))
    }, 100) // Aggiorna solo dopo 100ms di inattività
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
          ref={(el) => {
            hostRef.current = el
            // ✅ Collega anche zoomContainerRef per gestire Ctrl+rotella
            if (zoomContainerRef) {
              (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            }
          }}
          className="flex-1 overflow-auto relative min-h-0 bg-background"
          // ✅ La CSS variable --scale-factor è gestita dal WordViewerCore tramite hostRef
          // ✅ Ctrl+rotella è gestito da useCleanPdfZoom tramite zoomContainerRef
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
              // ✅ Log rimosso per ridurre spam
            }}
          />
        )}
      </div>

    </div>
  )
}
