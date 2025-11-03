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

  // ✅ Log diagnostici per scrollbar - analizza la struttura DOM e CSS
  useEffect(() => {
    const analyzeScrollbars = () => {
      // Trova il container usando hostRef (più affidabile del selettore CSS)
      let root = hostRef.current?.parentElement?.parentElement?.parentElement as HTMLElement | null
      if (!root) {
        // Fallback: cerca il container principale
        root = document.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
      }
      if (!root) {
        console.warn('[SCROLLBAR_DEBUG] Root container not found')
        return
      }

      const analyzeElement = (el: HTMLElement, name: string, depth: number = 0) => {
        const style = window.getComputedStyle(el)
        const canScroll = el.scrollHeight > el.clientHeight
        const hasOverflow = style.overflow !== 'visible' && style.overflow !== 'clip'
        const hasOverflowY = style.overflowY !== 'visible' && style.overflowY !== 'clip'

        const info = {
          name,
          depth,
          tagName: el.tagName,
          className: el.className.substring(0, 100),
          id: el.id || '(no id)',
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
          scrollDifference: el.scrollHeight - el.clientHeight,
          offsetHeight: el.offsetHeight,
          overflow: style.overflow,
          overflowY: style.overflowY,
          overflowX: style.overflowX,
          height: style.height,
          maxHeight: style.maxHeight,
          minHeight: style.minHeight,
          position: style.position,
          display: style.display,
          flex: style.flex,
          flexDirection: style.flexDirection,
          canScroll,
          hasOverflow,
          hasOverflowY,
          hasScrollbar: canScroll && hasOverflowY
        }

        console.log(`[SCROLLBAR_DEBUG] ${'  '.repeat(depth)}${name}:`, JSON.stringify(info, null, 2))
        return info
      }

      console.log('[SCROLLBAR_DEBUG] ========== SCROLLBAR ANALYSIS START ==========')

      // Analizza viewport
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Trova flexlayout__tab che contiene questo viewer
      let tabElement: HTMLElement | null = null
      let current: HTMLElement | null = root
      let level = 0
      while (current && level < 10) {
        if (current.classList.contains('flexlayout__tab')) {
          tabElement = current
          break
        }
        current = current.parentElement
        level++
      }

      if (tabElement) {
        const tabStyle = window.getComputedStyle(tabElement)
        const tabInfo = {
          element: 'FLEXLAYOUT__TAB',
          className: tabElement.className,
          id: tabElement.id || '(no id)',
          parentId: tabElement.parentElement?.id || '(no parent id)',
          parentTabsetId: tabElement.closest('.flexlayout__tabset')?.id || '(no tabset id)',
          computedOverflow: tabStyle.overflow,
          computedOverflowY: tabStyle.overflowY,
          scrollHeight: tabElement.scrollHeight,
          clientHeight: tabElement.clientHeight,
          canScroll: tabElement.scrollHeight > tabElement.clientHeight,
          appliedCSS: tabElement.style.cssText || '(no inline styles)'
        }
        console.log('[SCROLLBAR_DEBUG] FLEXLAYOUT__TAB (trovato nella gerarchia):', JSON.stringify(tabInfo, null, 2))

        // ✅ Fix: Se overflow è "auto", forzalo a "hidden" (fallback se CSS non funziona)
        const parentTabset = tabElement.closest('.flexlayout__tabset') as HTMLElement | null
        const isDrawerTab = parentTabset?.id === 'drawerContentTabset'

        if (!isDrawerTab) {
          if (tabStyle.overflow === 'auto') {
            console.warn('[SCROLLBAR_DEBUG] ⚠️ CSS non applicato, forzo overflow:hidden via JavaScript')
            tabElement.style.overflow = 'hidden'
            tabElement.style.overflowX = 'hidden'
            tabElement.style.overflowY = 'hidden'
          }

          // ✅ Fix CRITICO: Limita l'altezza dei container interni al clientHeight del tab
          // Questo forza i container a rispettare l'altezza disponibile invece di espandersi
          const tabClientHeight = tabElement.clientHeight
          if (tabClientHeight > 0 && tabClientHeight < 2000) { // Evita valori anomali
            // Trova flexlayout__tab_content e tutti i suoi discendenti che si espandono
            const tabContent = tabElement.querySelector('.flexlayout__tab_content') as HTMLElement | null
            if (tabContent) {
              // Limita l'altezza del primo child diretto (wrapper PdfViewerManager)
              const firstChild = tabContent.firstElementChild as HTMLElement | null
              if (firstChild) {
                const firstChildHeight = parseInt(window.getComputedStyle(firstChild).height) || 0
                if (firstChildHeight > tabClientHeight * 1.1) { // Se è più grande del 10% del tab, limitalo
                  console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza wrapper a:', tabClientHeight, '(era:', firstChildHeight, ')')
                  firstChild.style.height = `${tabClientHeight}px`
                  firstChild.style.maxHeight = `${tabClientHeight}px`
                  firstChild.style.overflow = 'hidden'
                }

                // Trova MAIN_CONTAINER (quello con "flex flex-1 w-full") e limitane l'altezza
                const mainContainer = firstChild.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
                if (mainContainer) {
                  const mainHeight = parseInt(window.getComputedStyle(mainContainer).height) || 0
                  if (mainHeight > tabClientHeight * 1.1) {
                    console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza MAIN_CONTAINER a:', tabClientHeight, '(era:', mainHeight, ')')
                    mainContainer.style.height = `${tabClientHeight}px`
                    mainContainer.style.maxHeight = `${tabClientHeight}px`
                  }
                }
              }
            }
          }
        }

        // Verifica dopo la correzione
        const finalStyle = window.getComputedStyle(tabElement)
        if (tabElement.scrollHeight > tabElement.clientHeight) {
          console.error('[SCROLLBAR_DEBUG] ❌ FLEXLAYOUT__TAB può ancora scrollare!', {
            scrollHeight: tabElement.scrollHeight,
            clientHeight: tabElement.clientHeight,
            overflow: finalStyle.overflow
          })
        } else {
          console.log('[SCROLLBAR_DEBUG] ✅ FLEXLAYOUT__TAB non può scrollare (corretto)')
        }
      } else {
        console.warn('[SCROLLBAR_DEBUG] flexlayout__tab non trovato nella gerarchia')
      }

      // Analizza MAIN_CONTAINER
      const mainContainer = root
      const mainInfo = analyzeElement(mainContainer, 'MAIN_CONTAINER', 0)
      if (mainInfo.canScroll) {
        console.error('[SCROLLBAR_DEBUG] ❌ MAIN_CONTAINER può scrollare!')
      }

      // Analizza LEFT_CONTAINER
      const leftContainer = mainContainer.querySelector('[class*="flex flex-col flex-1 min-w-0 overflow-hidden"]') as HTMLElement | null
      if (leftContainer) {
        analyzeElement(leftContainer, 'LEFT_CONTAINER', 1)
      }

      // Analizza PDF_HOST (dovrebbe avere scrollbar arancione)
      const pdfHost = hostRef.current
      if (pdfHost) {
        const hostInfo = analyzeElement(pdfHost, 'PDF_HOST (hostRef, dovrebbe avere scrollbar arancione)', 2)
        if (!hostInfo.canScroll && pdfHost.scrollHeight > pdfHost.clientHeight) {
          console.error('[SCROLLBAR_DEBUG] ❌ PDF_HOST NON può scrollare ma ha contenuto maggiore! Dovrebbe avere scrollbar!')
        } else if (hostInfo.canScroll) {
          console.log('[SCROLLBAR_DEBUG] ✅ PDF_HOST può scrollare (scrollbar arancione OK)')
        }
      }

      // Analizza parent chain dal MAIN_CONTAINER verso l'alto
      let parent = root.parentElement
      let parentLevel = 0
      const parents = []
      while (parent && parentLevel < 6) {
        const style = window.getComputedStyle(parent)
        parents.push({
          level: parentLevel,
          tagName: parent.tagName,
          className: parent.className.substring(0, 100),
          id: parent.id || '(no id)',
          height: style.height,
          maxHeight: style.maxHeight,
          clientHeight: parent.clientHeight,
          scrollHeight: parent.scrollHeight,
          overflow: style.overflow,
          overflowY: style.overflowY,
          display: style.display,
          flex: style.flex,
          canScroll: parent.scrollHeight > parent.clientHeight
        })
        parent = parent.parentElement
        parentLevel++
      }

      console.log('[SCROLLBAR_DEBUG] VIEWPORT:', {
        viewportHeight,
        viewportWidth,
        availableHeight: viewportHeight - 100
      })
      console.log('[SCROLLBAR_DEBUG] PARENT CHAIN (dal MAIN_CONTAINER verso l\'alto):')
      parents.forEach((p, idx) => {
        console.log(`[SCROLLBAR_DEBUG]   Parent[${idx}]:`, JSON.stringify(p, null, 2))
        if (p.canScroll) {
          console.error(`[SCROLLBAR_DEBUG]   ❌ Parent[${idx}] può scrollare! Tag: ${p.tagName}, Class: ${p.className.substring(0, 50)}`)
        }
      })

      console.log('[SCROLLBAR_DEBUG] ========== SCROLLBAR ANALYSIS END ==========')
    }

    // ✅ Funzione per applicare fix overflow e limiti altezza
    const applyScrollbarFix = () => {
      const root = hostRef.current?.parentElement?.parentElement?.parentElement as HTMLElement | null
      if (!root) return

      let tabElement: HTMLElement | null = null
      let current: HTMLElement | null = root
      let level = 0
      while (current && level < 10) {
        if (current.classList.contains('flexlayout__tab')) {
          tabElement = current
          break
        }
        current = current.parentElement
        level++
      }

      if (tabElement) {
        const parentTabset = tabElement.closest('.flexlayout__tabset') as HTMLElement | null
        const isDrawerTab = parentTabset?.id === 'drawerContentTabset'

        if (!isDrawerTab) {
          const tabStyle = window.getComputedStyle(tabElement)
          if (tabStyle.overflow === 'auto') {
            tabElement.style.overflow = 'hidden'
            tabElement.style.overflowX = 'hidden'
            tabElement.style.overflowY = 'hidden'
          }

          const tabClientHeight = tabElement.clientHeight
          if (tabClientHeight > 0 && tabClientHeight < 2000) {
            const tabContent = tabElement.querySelector('.flexlayout__tab_content') as HTMLElement | null
            if (tabContent) {
              const firstChild = tabContent.firstElementChild as HTMLElement | null
              if (firstChild) {
                const firstChildHeight = firstChild.clientHeight
                if (firstChildHeight > tabClientHeight * 1.1) {
                  console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza wrapper a:', tabClientHeight, '(era:', firstChildHeight, ')')
                  firstChild.style.height = `${tabClientHeight}px`
                  firstChild.style.maxHeight = `${tabClientHeight}px`
                  firstChild.style.overflow = 'hidden'
                }

                const mainContainer = firstChild.querySelector('[class*="flex flex-1 w-full"]') as HTMLElement | null
                if (mainContainer) {
                  const mainHeight = mainContainer.clientHeight
                  if (mainHeight > tabClientHeight * 1.1) {
                    console.log('[SCROLLBAR_DEBUG] 🔧 Limitando altezza MAIN_CONTAINER a:', tabClientHeight, '(era:', mainHeight, ')')
                    mainContainer.style.height = `${tabClientHeight}px`
                    mainContainer.style.maxHeight = `${tabClientHeight}px`
                  }
                }
              }
            }
          }
        }
      }
    }

    // Analizza dopo che il DOM è renderizzato
    const timeout = setTimeout(() => {
      analyzeScrollbars()
      applyScrollbarFix()
    }, 800)

    // Riapplica fix periodicamente (FlexLayout potrebbe modificare dimensioni dinamicamente)
    // Usa interval più lungo per evitare overhead eccessivo
    const fixInterval = setInterval(() => {
      applyScrollbarFix()
    }, 1000)

    // Rianalizza quando cambiano le dimensioni
    window.addEventListener('resize', () => {
      analyzeScrollbars()
      applyScrollbarFix()
    })

    return () => {
      clearTimeout(timeout)
      clearInterval(fixInterval)
      window.removeEventListener('resize', analyzeScrollbars)
    }
  }, [hostRef])

  // ✅ Struttura semplificata: h-full invece di flex-1, NO wrapper inutili
  return (
    <React.Fragment>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar unificata - 1 sola riga */}
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

        {/* Content area: toolbar + PDF viewer side-by-side */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* PDF Viewer - scrollbar arancione */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
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

            <AnnotationOverlays
              selectedAnnot={shell.selectedAnnot}
              annots={shell.annots}
              draft={shell.draft}
              persistentSelections={shell.persistentSelections}
              setPersistentSelections={shell.setPersistentSelections}
              overlayRootsRef={shell.overlayRootsRef}
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

      <ContextMenu
        contextMenu={shell.contextMenu}
        lastSelection={shell.lastSelection}
        persistentSelections={shell.persistentSelections}
        setPersistentSelections={shell.setPersistentSelections}
        pageElsRef={shell.pageElsRef}
        onContextMenuChange={shell.setContextMenu}
        onOcrInspectOpenChange={shell.setOcrInspectOpen}
        onExtractPosChange={shell.setExtractPos}
        onExtractPageChange={shell.setExtractPage}
        onExtractOpenChange={shell.setExtractOpen}
        docName={docName}
        hasNativeText={hasNativeText}
      />

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
