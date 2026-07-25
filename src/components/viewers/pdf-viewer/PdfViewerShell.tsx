import React, { useCallback, useRef, useEffect, useState } from 'react'
import { usePdfShellState } from './hooks/usePdfShellState'
import { useDocumentSearchPanelResizer } from '../../search/useDocumentSearchPanelResizer'
import { usePdfPlugins } from './hooks/usePdfPlugins'
import { PdfViewerCore, type PdfViewerHandle } from './components/PdfViewerCore'
import { AnnotationOverlays } from './components/AnnotationOverlays'
import { SearchPanel } from './components/SearchPanel'
import { ContextMenu } from './components/ContextMenu'
import { OcrInspector } from './components/OcrInspector'
import { ExtractDialog } from './components/ExtractDialog'
import { PdfUnifiedToolbar } from './components/PdfUnifiedToolbar'
import { OcrLayoutDebug } from './components/OcrLayoutDebug'
import { useCleanPdfZoom } from '../../../hooks/useCleanPdfZoom'
import { useViewerPanelLifecycle } from '../common/hooks/useViewerPanelLifecycle'
import type { ViewerPanelApi } from '../common/types/viewer.types'

interface PdfViewerShellProps {
  fileUrl: string
  page: number
  lines: any[] | null
  onPageChange?: (page: number) => void
  hideToolbar?: boolean
  docId?: string
  documentHash?: string
  storageKey?: string
  praticaId?: string
  docName?: string
  hasNativeText?: boolean
  /** Panel lifecycle API used to synchronize activation and dimensions. */
  panelApi?: ViewerPanelApi
  /**
   * @deprecated Usa panelApi invece. Mantenuto per retrocompatibilità.
   */
  isActive?: boolean
}

export const PdfViewerShell: React.FC<PdfViewerShellProps> = ({
  fileUrl,
  page,
  lines: _lines,
  onPageChange,
  hideToolbar: _hideToolbar,
  docId,
  documentHash,
  storageKey,
  praticaId,
  docName,
  hasNativeText,
  panelApi,
  isActive: isActiveProp // ✅ Mantenuto per retrocompatibilità
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scrollHostRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<PdfViewerHandle | null>(null)

  const refreshViewerLayout = useCallback(() => {
    viewerRef.current?.refreshLayout()
  }, [])

  const isActive = useViewerPanelLifecycle({
    panelApi,
    fallbackIsActive: isActiveProp ?? false,
    onLayoutChange: refreshViewerLayout
  })

  // Plugin management
  const plugins = usePdfPlugins()

  const [viewerReadyTick, setViewerReadyTick] = useState(0)

  // ✅ Stato React per tracciare se l'overlay ExtractBlock è aperto
  const [isExtractOverlayOpen, setIsExtractOverlayOpen] = useState(false)

  // Unified state management
  const shell = usePdfShellState({
    hostRef,
    fileUrl,
    docId,
    onPageChange,
    viewerRef,
    isActive, // ✅ Passa isActive (ora gestito internamente)
    viewerReadyTick,
    isExtractOverlayOpen  // ✅ Passa stato React per bloccare drag quando overlay è aperto
  })

  // Zoom hook integration
  const { containerRef: zoomContainerRef } = useCleanPdfZoom({
    zoomToPlugin: (scale: number) => {
      // ✅ Log rimosso per ridurre spam
      if (typeof shell?.zoomTo === 'function') {
        shell.zoomTo(scale)
      }
    },
    getCurrentScale: () => shell?.scaleRef?.current || 1
  })

  // ✅ Hook per il ridimensionamento del pannello di ricerca
  useDocumentSearchPanelResizer({
    resizingRef: shell.resizingRef,
    setPanelW: shell.setPanelW
  })

  // ✅ FIX DEFINITIVO: Forza struttura corretta con altezze limitate
  // ⚠️ TEST: enforceStructure DISATTIVATA per verificare se è ancora necessaria
  // Se il layout funziona senza, possiamo eliminarla completamente
  useEffect(() => {
    const enforceStructure = () => {
      // ⚠️ TEST: enforceStructure DISATTIVATA - early return
      return

      /* COMMENTATO PER TEST - riattivare se necessario
      if (!scrollHostRef.current) return

      // ✅ Salva lo stato del focus PRIMA di manipolare il DOM
      const activeElement = document.activeElement
      const wasSearchInputFocused = activeElement?.tagName === 'INPUT' &&
        activeElement.closest('[class*="border-l"]') !== null // È dentro SearchPanel
      const savedInput = wasSearchInputFocused ? activeElement as HTMLInputElement : null

      if (savedInput) {
        console.log('[ENFORCE][FOCUS] Salvato focus su input di ricerca prima di manipolare DOM', {
          input: savedInput,
          value: (savedInput as HTMLInputElement).value
        })
      }

      // 1. Trova flexlayout__tab (container principale del tab)
      let tab: HTMLElement | null = null
      let current: HTMLElement | null = scrollHostRef.current
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
      const mainContainer = scrollHostRef.current.closest('.flex.flex-col.h-full') as HTMLElement | null
      if (!mainContainer || mainContainer === scrollHostRef.current) return

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
      if (scrollHostRef.current) {
        scrollHostRef.current.style.height = `${contentAreaHeight}px`
        scrollHostRef.current.style.maxHeight = `${contentAreaHeight}px`
        scrollHostRef.current.style.overflowY = 'auto'
        scrollHostRef.current.style.overflowX = 'hidden'
      }

      // 8. SearchPanel: trova e limita container risultati
      const searchPanel = scrollHostRef.current.parentElement?.querySelector('[class*="h-full"][class*="border-l"]') as HTMLElement | null
      if (searchPanel) {
        // Limita altezza SearchPanel al contentAreaHeight
        searchPanel.style.height = `${contentAreaHeight}px`
        searchPanel.style.maxHeight = `${contentAreaHeight}px`
        searchPanel.style.overflow = 'hidden'

      const searchHeader = searchPanel.querySelector('.document-search-header') as HTMLElement | null
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

      // ✅ Ripristina SEMPRE il focus se era sull'input di ricerca
      // Questo è necessario perché la manipolazione del DOM può causare blur temporanei
      if (savedInput && document.contains(savedInput)) {
        // Usa doppio requestAnimationFrame per assicurarsi che il DOM sia completamente pronto
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (document.contains(savedInput)) {
              const currentActive = document.activeElement
              // Ripristina sempre se non è già l'input, o se l'input non ha il focus visibile
              const needsRestore = currentActive !== savedInput ||
                !document.hasFocus() ||
                savedInput !== document.activeElement

              if (needsRestore) {
                console.log('[ENFORCE][FOCUS] Ripristino focus dopo manipolazione DOM', {
                  wasFocused: savedInput,
                  currentActive,
                  hasFocus: document.hasFocus(),
                  needsRestore
                })
                savedInput.focus()
                savedInput.select()
                console.log('[ENFORCE][FOCUS] Focus ripristinato con successo')
              } else {
                console.log('[ENFORCE][FOCUS] Focus già presente e attivo, nessun ripristino necessario')
              }
            }
          })
        })
      }
      FINE COMMENTO PER TEST */
    }

    // ⚠️ TEST: enforceStructure DISATTIVATA - commenta queste righe per il test
    /*
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
    */

    // ⚠️ TEST: Nessun cleanup necessario quando enforceStructure è disattivata
    return () => {}
  }, []) // ✅ Nessuna dipendenza - enforceStructure disattivata

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
          panelApi={panelApi}
        />

        {/* Content area: PDF viewer + Search panel side-by-side */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* PDF Viewer - scrollbar arancione - SEMPLIFICATO: direttamente flex-1 overflow-auto */}
          <div
            ref={(el) => {
              scrollHostRef.current = el
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
                scrollRef={scrollHostRef}
                onViewerReady={() => setViewerReadyTick((tick) => tick + 1)}
              />
            </div>

          {/* Search Panel - scrollbar verde */}
          <SearchPanel
            showAdvanced={shell.showAdvanced}
            setShowAdvanced={shell.setShowAdvanced}
            panelW={shell.panelW}
            resizingRef={shell.resizingRef}
            searchQ={shell.searchQ}
            setSearchQ={shell.setSearchQ}
            docId={docId}
            documentHash={documentHash}
            storageKey={storageKey}
            documentTitle={docName}
            fileUrl={fileUrl}
            totalPages={shell.totalPages}
            setMatches={shell.setMatches}
            goToMatch={shell.goToMatch}
            searchCacheRef={shell.searchCacheRef}
            isActive={isActive}
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
        isExtractOverlayOpen={isExtractOverlayOpen}
        setIsExtractOverlayOpen={setIsExtractOverlayOpen}
        overlayRootsRef={shell.overlayRootsRef}
        pageElsRef={shell.pageElsRef}
        lastSelection={shell.lastSelection}
        docName={docName}
        hasNativeText={shell.hasNativeText}
        ensureOverlayRootForPage={shell.ensureOverlayRootForPage}
        praticaId={praticaId}
      />

      {/* Debug: mostra prima parola di ogni pagina */}
      <OcrLayoutDebug
        docId={docId}
        overlayRootsRef={shell.overlayRootsRef}
        enabled={false} // ✅ Disabilitato di default - abilita solo per debug OCR
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
