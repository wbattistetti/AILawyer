import React, { useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { searchPlugin } from '@react-pdf-viewer/search'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import { highlightPlugin } from '@react-pdf-viewer/highlight'
import { usePdfShellState } from './hooks/usePdfShellState'
import { TopBar } from './components/TopBar'
import { PdfViewerCore } from './components/PdfViewerCore'
import { AnnotationOverlays } from './components/AnnotationOverlays'
import { SearchPanel } from './components/SearchPanel'
import { ContextMenu } from './components/ContextMenu'
import { OcrInspector } from './components/OcrInspector'
import { ExtractDialog } from './components/ExtractDialog'
import { searchViaOcrBackend } from './services/ocrSearch'
import { PdfToolbarAdvanced } from './components/PdfToolbarAdvanced'

interface PdfViewerShellProps {
  fileUrl: string
  page: number
  lines: any[] | null
  onPageChange?: (page: number) => void
  hideToolbar?: boolean
  docId?: string
}

export const PdfViewerShell: React.FC<PdfViewerShellProps> = ({
  fileUrl,
  page,
  lines: _lines,
  onPageChange,
  hideToolbar: _hideToolbar,
  docId
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  
  console.log('[PdfViewerShell] Rendering with props:', { fileUrl, page, docId })
  
  // Use useRef for plugins instead of useMemo to avoid React Hooks rules violation
  const scrollModeRef = useRef(scrollModePlugin())
  const pageNavRef = useRef(pageNavigationPlugin())
  const searchRef = useRef(searchPlugin())
  const zoomRef = useRef(zoomPlugin())
  const highlightRef = useRef(highlightPlugin({
    renderHighlights: (props) => {
      return React.createElement(React.Fragment)
    }
  }))
  
  // Unified state management
  const shell = usePdfShellState({
    hostRef,
    fileUrl,
    docId,
    pageNav: pageNavRef.current,
    search: searchRef.current,
    zoom: zoomRef.current
  })

  console.log('[PdfViewerShell] Shell state:', shell)

  return (
    <React.Fragment>
      <div className="flex h-full w-full">
        {/* Left: toolbar + viewer */}
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar
            totalPages={shell.totalPages}
            pageInput={shell.pageInput}
            onPageInputChange={shell.setPageInput}
            onJump={shell.jumpToPage}
            searchQ={shell.searchQ}
            onSearchQChange={shell.setSearchQ}
            onOpenSearchPanel={() => shell.setShowAdvanced(true)}
            showAdvanced={shell.showAdvanced}
            onCloseSearchPanel={() => shell.setShowAdvanced(false)}
          />

          {/* Add PdfToolbarAdvanced component */}
          <PdfToolbarAdvanced
            tool={shell.tool}
            setTool={shell.setTool}
            audit={shell.audit}
            setAudit={shell.setAudit}
            autoDeskew={shell.autoDeskew}
            setAutoDeskew={shell.setAutoDeskew}
            skewAngles={shell.skewAngles}
            setSkewAngles={shell.setSkewAngles}
            pageInput={shell.pageInput}
            selectKind={shell.selectKind}
            setSelectKind={shell.setSelectKind}
            zoomPct={shell.zoomPct}
            setZoomPct={shell.setZoomPct}
            scaleRef={shell.scaleRef}
            zoomDebounceRef={shell.zoomDebounceRef}
            hostRef={hostRef}
            showAdvanced={shell.showAdvanced}
            setShowAdvanced={shell.setShowAdvanced}
            estimateSkewForPage={shell.estimateSkewForPage}
            persistSkew={shell.persistSkew}
            applyImmediateToPage={shell.applyImmediateToPage}
            zoomTo={shell.zoomTo}
          />

          <div 
            ref={hostRef} 
            className="flex-1 overflow-hidden relative" 
            style={{ ['--scale-factor' as any]: String(shell.zoomPct / 100) }}
          >
            <PdfViewerCore
              fileUrl={fileUrl}
              page={page}
              onPageChange={onPageChange}
              scrollMode={scrollModeRef.current}
              pageNav={pageNavRef.current}
              searchPluginInstance={searchRef.current}
              highlight={highlightRef.current}
              zoomPluginInstance={zoomRef.current}
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
            overlayRootsRef={shell.overlayRootsRef}
          />

          <ExtractDialog
            extractOpen={shell.extractOpen}
            extractPos={shell.extractPos}
            extractTitle={shell.extractTitle}
            extractType={shell.extractType}
            extractNotes={shell.extractNotes}
            extractPage={shell.extractPage}
            showNotes={shell.showNotes}
            selectKind={shell.selectKind}
            lastSelection={shell.lastSelection}
            docId={docId}
            fileUrl={fileUrl}
            hostRef={hostRef}
            suppressClearRef={shell.suppressClearRef}
            onExtractTitleChange={shell.setExtractTitle}
            onExtractTypeChange={shell.setExtractType}
            onExtractNotesChange={shell.setExtractNotes}
            onShowNotesChange={shell.setShowNotes}
            onExtractOpenChange={shell.setExtractOpen}
            onDraftChange={shell.setDraft}
            onSelBoxChange={shell.setSelBox}
            onSelectedAnnotChange={shell.setSelectedAnnot}
            onSelectionHandledChange={shell.setSelectionHandled}
          />
        </div>

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
          searchPluginInstance={searchRef.current}
         goToMatch={shell.goToMatch}
          searchCacheRef={shell.searchCacheRef}
        />
      </div>

      <ContextMenu
        contextMenu={shell.contextMenu}
        lastSelection={shell.lastSelection}
        pageElsRef={shell.pageElsRef}
        onContextMenuChange={shell.setContextMenu}
        onOcrInspectOpenChange={shell.setOcrInspectOpen}
        onExtractPosChange={shell.setExtractPos}
        onExtractPageChange={shell.setExtractPage}
        onExtractOpenChange={shell.setExtractOpen}
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
