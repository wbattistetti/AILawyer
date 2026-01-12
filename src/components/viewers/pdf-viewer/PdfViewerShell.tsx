import React, { useRef, useEffect } from 'react'
import { usePdfShellState } from './hooks/usePdfShellState'
import { usePdfPanelResizer } from './hooks/usePdfPanelResizer'
import { usePdfPlugins } from './hooks/usePdfPlugins'
import { PdfViewerCore } from './components/PdfViewerCore'
import { AnnotationOverlays } from './components/AnnotationOverlays'
import { SearchPanel } from './components/SearchPanel'
import { ContextMenu } from './components/ContextMenu'
import { OcrInspector } from './components/OcrInspector'
import { ExtractDialog } from './components/ExtractDialog'
import { PdfUnifiedToolbar } from './components/PdfUnifiedToolbar'
import { OcrLayoutDebug } from './components/OcrLayoutDebug'
import { useCleanPdfZoom } from '../../../hooks/useCleanPdfZoom'

interface PdfViewerShellProps {
  fileUrl: string
  page: number
  lines: any[] | null
  onPageChange?: (page: number) => void
  hideToolbar?: boolean
  docId?: string
  praticaId?: string
  docName?: string
  hasNativeText?: boolean
}

export const PdfViewerShell: React.FC<PdfViewerShellProps> = ({
  fileUrl,
  page,
  lines: _lines,
  onPageChange,
  hideToolbar: _hideToolbar,
  docId,
  praticaId,
  docName,
  hasNativeText
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<any>(null) // PdfViewerHandle ref

  // Plugin management
  const plugins = usePdfPlugins()

  // Unified state management
  const shell = usePdfShellState({
    hostRef,
    fileUrl,
    docId,
    onPageChange,
    viewerRef
  })

  // Zoom hook integration
  const { containerRef: zoomContainerRef } = useCleanPdfZoom({
    zoomToPlugin: (scale: number) => {
      console.log('[ZOOM] Calling plugin with scale', scale.toFixed(3))
      if (typeof shell?.zoomTo === 'function') {
        shell.zoomTo(scale)
      }
    },
    getCurrentScale: () => shell?.scaleRef?.current || 1
  })

  // ✅ Hook per il ridimensionamento del pannello di ricerca
  usePdfPanelResizer({
    resizingRef: shell.resizingRef,
    setPanelW: shell.setPanelW
  })

  // ✅ FIX DEFINITIVO: Forza struttura corretta con altezze limitate
  useEffect(() => {
    const enforceStructure = () => {
      if (!hostRef.current) return

      // 1. Trova flexlayout__tab (container principale del tab)
      let tab: HTMLElement | null = null
      let current: HTMLElement | null = hostRef.current
      for (let i = 0; i < 15 && current; i++) {
        if (current.classList.contains('flexlayout__tab')) {
          tab = current
          break
        }
        current = current.parentElement
      }

      if (!tab) return

      const tabset = tab.closest('.flexlayout__tabset') as HTMLElement | null
      if (tabset?.id === 'drawerContentTabset') return // Skip drawer tabs

      const tabHeight = tab.clientHeight
      if (tabHeight <= 0) return

      // 2. Blocca scrollbar sul tab stesso
      tab.style.overflow = 'hidden'
      tab.style.overflowY = 'hidden'
      tab.style.overflowX = 'hidden'

      // 3. Limita tab_content
      const tabContent = tab.querySelector('.flexlayout__tab_content') as HTMLElement | null
      if (tabContent) {
        tabContent.style.height = `${tabHeight}px`
        tabContent.style.maxHeight = `${tabHeight}px`
        tabContent.style.overflow = 'hidden'
        tabContent.style.display = 'flex'
        tabContent.style.flexDirection = 'column'
      }

      // 4. Trova container principale PdfViewerShell (flex flex-col h-full)
      const mainContainer = hostRef.current.closest('.flex.flex-col.h-full') as HTMLElement | null
      if (!mainContainer || mainContainer === hostRef.current) return

      // Limita altezza container principale
      mainContainer.style.height = `${tabHeight}px`
      mainContainer.style.maxHeight = `${tabHeight}px`
      mainContainer.style.overflow = 'hidden'

      // 5. Calcola altezza toolbar e content area
      const toolbar = mainContainer.querySelector('[class*="flex"][class*="items-center"][class*="border-b"]') as HTMLElement | null
      const toolbarHeight = toolbar?.offsetHeight || 50
      const contentAreaHeight = tabHeight - toolbarHeight

      if (contentAreaHeight <= 0) return

      // 6. Limita content area (flex flex-1 min-h-0)
      const contentArea = mainContainer.querySelector('.flex.flex-1.min-h-0') as HTMLElement | null
      if (contentArea) {
        contentArea.style.height = `${contentAreaHeight}px`
        contentArea.style.maxHeight = `${contentAreaHeight}px`
        contentArea.style.overflow = 'hidden'
      }

      // 7. PDF_HOST: deve avere altezza limitata e overflow-auto
      if (hostRef.current) {
        hostRef.current.style.height = `${contentAreaHeight}px`
        hostRef.current.style.maxHeight = `${contentAreaHeight}px`
        hostRef.current.style.overflowY = 'auto'
        hostRef.current.style.overflowX = 'hidden'
      }

      // 8. SearchPanel: trova e limita container risultati
      const searchPanel = hostRef.current.parentElement?.querySelector('[class*="h-full"][class*="border-l"]') as HTMLElement | null
      if (searchPanel) {
        // Limita altezza SearchPanel al contentAreaHeight
        searchPanel.style.height = `${contentAreaHeight}px`
        searchPanel.style.maxHeight = `${contentAreaHeight}px`
        searchPanel.style.overflow = 'hidden'

        const searchHeader = searchPanel.querySelector('[class*="border-b"][class*="bg-gray-50"]') as HTMLElement | null
        const headerHeight = searchHeader?.offsetHeight || 45
        const resultsHeight = contentAreaHeight - headerHeight

        if (resultsHeight > 50) {
          // Cerca il container che contiene SearchProvider (quello che contiene SearchPanelTree)
          // Dovrebbe essere un div flex-1 o simile dentro SearchPanel
          const searchProviderContainer = searchPanel.querySelector('[class*="flex"][class*="flex-col"], [class*="flex-1"]') as HTMLElement | null

          if (searchProviderContainer) {
            // Verifica che sia effettivamente il container dei risultati
            const hasResultsList = searchProviderContainer.querySelector('ul') !== null

            if (hasResultsList) {
              searchProviderContainer.style.height = `${resultsHeight}px`
              searchProviderContainer.style.maxHeight = `${resultsHeight}px`
              searchProviderContainer.style.overflowY = 'auto'
              searchProviderContainer.style.overflowX = 'hidden'
            }
          } else {
            // Fallback: cerca qualsiasi div con overflow che contiene una ul
            const allDivs = searchPanel.querySelectorAll('div')
            for (let i = 0; i < allDivs.length; i++) {
              const el = allDivs[i] as HTMLElement
              const hasUl = el.querySelector('ul') !== null
              const rect = el.getBoundingClientRect()
              const searchHeaderRect = searchHeader?.getBoundingClientRect()

              if (hasUl && searchHeaderRect && rect.top > searchHeaderRect.bottom) {
                el.style.height = `${resultsHeight}px`
                el.style.maxHeight = `${resultsHeight}px`
                el.style.overflowY = 'auto'
                el.style.overflowX = 'hidden'
                break
              }
            }
          }
        }
      }
    }

    // Esegui immediatamente e poi periodicamente
    const timeout1 = setTimeout(enforceStructure, 100)
    const timeout2 = setTimeout(enforceStructure, 500)
    const interval = setInterval(enforceStructure, 2000)
    window.addEventListener('resize', enforceStructure)

    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      clearInterval(interval)
      window.removeEventListener('resize', enforceStructure)
    }
  }, [hostRef])

  // ✅ Struttura MASSIMAMENTE semplificata: NO wrapper inutili, struttura piatta
  return (
    <React.Fragment>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar unificata - 1 sola riga, FISSA */}
        <PdfUnifiedToolbar
          totalPages={shell.totalPages}
          pageInput={shell.pageInput}
          onPageInputChange={shell.setPageInput}
          onJump={shell.jumpToPage}
          searchQ={shell.searchQ}
          onSearchQChange={shell.setSearchQ}
          onOpenSearchPanel={() => shell.setShowAdvanced(true)}
          showAdvanced={shell.showAdvanced}
          onCloseSearchPanel={() => shell.setShowAdvanced(false)}
          tool={shell.tool}
          setTool={shell.setTool}
          audit={shell.audit}
          setAudit={shell.setAudit}
          autoDeskew={shell.autoDeskew}
          setAutoDeskew={shell.setAutoDeskew}
          skewAngles={shell.skewAngles}
          setSkewAngles={shell.setSkewAngles}
          selectKind={shell.selectKind}
          setSelectKind={shell.setSelectKind}
          zoomPct={shell.zoomPct}
          setZoomPct={shell.setZoomPct}
          scaleRef={shell.scaleRef}
          zoomDebounceRef={shell.zoomDebounceRef}
          hostRef={hostRef}
          estimateSkewForPage={shell.estimateSkewForPage}
          persistSkew={shell.persistSkew}
          applyImmediateToPage={shell.applyImmediateToPage}
          zoomTo={shell.zoomTo}
          setShowAdvanced={shell.setShowAdvanced}
        />

        {/* Content area: PDF viewer + Search panel side-by-side */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* PDF Viewer - scrollbar arancione - SEMPLIFICATO: direttamente flex-1 overflow-auto */}
          <div
            ref={(el) => {
              hostRef.current = el
              if (zoomContainerRef) (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            }}
            className="flex-1 overflow-auto relative min-h-0"
            style={{ ['--scale-factor' as any]: String(shell.scaleRef?.current || 1) }}
          >
              <PdfViewerCore
                ref={viewerRef}
                fileUrl={fileUrl}
                page={page}
                onPageChange={onPageChange}
                scrollMode={plugins.scrollMode}
                pageNav={plugins.pageNav}
                searchPluginInstance={plugins.search}
                highlight={plugins.highlight}
                zoomPluginInstance={plugins.zoom}
                selectMode={true}
                selectKind="NATIVE"
                hostRef={hostRef}
                pdfDocRef={shell.pdfDocRef}
                scaleRef={shell.scaleRef}
                setPageInput={shell.setPageInput}
                setTotalPages={shell.setTotalPages}
                setZoomPct={shell.setZoomPct}
                setExtractPos={shell.setExtractPos}
                setExtractPage={shell.setExtractPage}
                setLastSelection={shell.setLastSelection}
                setExtractOpen={shell.setExtractOpen}
                docId={docId}
              />
            </div>

          {/* Search Panel - scrollbar verde */}
          <SearchPanel
            showAdvanced={shell.showAdvanced}
            setShowAdvanced={shell.setShowAdvanced}
            panelW={shell.panelW}
            resizingRef={shell.resizingRef}
            searchQ={shell.searchQ}
            docId={docId}
            fileUrl={fileUrl}
            totalPages={shell.totalPages}
            setMatches={shell.setMatches}
            goToMatch={shell.goToMatch}
            searchCacheRef={shell.searchCacheRef}
          />
        </div>
      </div>

      {/* Overlays - fuori dal layout principale */}
      <AnnotationOverlays
        selectedAnnot={shell.selectedAnnot}
        annots={shell.annots}
        draft={shell.draft}
        persistentSelections={shell.persistentSelections}
        setPersistentSelections={shell.setPersistentSelections}
        overlayRootsRef={shell.overlayRootsRef}
        pageElsRef={shell.pageElsRef}
        lastSelection={shell.lastSelection}
        docName={docName}
        hasNativeText={shell.hasNativeText}
      />

      {/* Debug: mostra prima parola di ogni pagina */}
      <OcrLayoutDebug
        docId={docId}
        overlayRootsRef={shell.overlayRootsRef}
        enabled={true}
      />

      <ExtractDialog
        extractOpen={shell.extractOpen}
        extractPos={shell.extractPos}
        extractTitle={shell.extractTitle}
        extractDate={shell.extractDate}
        extractNotes={shell.extractNotes}
        extractPage={shell.extractPage}
        showNotes={shell.showNotes}
        selectKind={shell.selectKind}
        lastSelection={shell.lastSelection}
        docId={docId}
        praticaId={praticaId}
        fileUrl={fileUrl}
        hostRef={hostRef}
        suppressClearRef={shell.suppressClearRef}
        onExtractTitleChange={shell.setExtractTitle}
        onExtractDateChange={shell.setExtractDate}
        onExtractNotesChange={shell.setExtractNotes}
        onShowNotesChange={shell.setShowNotes}
        onExtractOpenChange={shell.setExtractOpen}
        onDraftChange={shell.setDraft}
        onSelBoxChange={shell.setSelBox}
        onSelectedAnnotChange={shell.setSelectedAnnot}
        onSelectionHandledChange={shell.setSelectionHandled}
      />

      {/* ContextMenu rimosso - ora usiamo FloatingExtractButton che appare automaticamente */}

      <OcrInspector
        docId={docId}
        ocrInspectOpen={shell.ocrInspectOpen}
        onOcrInspectOpenChange={shell.setOcrInspectOpen}
        hostRef={hostRef}
        lastOcrMatchesRef={shell.lastOcrMatchesRef}
      />
    </React.Fragment>
  )
}
