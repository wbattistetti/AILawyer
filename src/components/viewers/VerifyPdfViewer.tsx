import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Worker, Viewer, ScrollMode } from '@react-pdf-viewer/core'
import { highlightPlugin } from '@react-pdf-viewer/highlight'
import '@react-pdf-viewer/highlight/lib/styles/index.css'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { searchPlugin } from '@react-pdf-viewer/search'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/zoom/lib/styles/index.css'
import '@react-pdf-viewer/page-navigation/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist'

import { Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, Search, GripVertical, PanelRightOpen, Save as SaveIcon, X } from 'lucide-react'
import { PdfSelectionOverlay, getPdfCoords, getSelectedTextInRect } from '../../features/pdf/PdfSelectionOverlay'
// Replaced per-page overlay with SVG layer via renderPage
import { SvgSelectLayer } from '../../features/pdf/SvgSelectLayer'
import { ExtractClassifierDialog } from '../../features/defense-memory/components/ExtractClassifierDialog'
import { getTextInViewportBox } from '../../features/pdf/getTextInViewportBox'
import { getTextInPdfBox } from '../../features/pdf/getTextInPdfBox'
// import { PerPageSelectionManager } from './PerPageSelectionManager'
import { cryptoRandom, formatDocTitle } from '../../utils/misc'
import { SearchProvider } from '../search/SearchProvider'
import { SearchPanelTree } from '../search/SearchPanelTree'
import { api } from '../../lib/api'
import { logger } from '../../utils/logger'
import { buildReadingText, matchInBuilt } from '../../features/ocr/readingOrder'
import { useCleanPdfZoom } from '../../hooks/useCleanPdfZoom'
import { ContextMenu } from './pdf-viewer/components/ContextMenu'
import { OcrInspector } from './pdf-viewer/components/OcrInspector'
import { ExtractDialog } from './pdf-viewer/components/ExtractDialog'
import { usePdfViewerState } from './pdf-viewer/hooks/usePdfViewerState'
import { usePdfSearch, type MatchItem } from './pdf-viewer/hooks/usePdfSearch'
import { useNativeSelection } from './pdf-viewer/hooks/useNativeSelection'
import { usePdfDeskew } from './pdf-viewer/hooks/usePdfDeskew'
import { usePdfAudit } from './pdf-viewer/hooks/usePdfAudit'
import { usePdfAnnotations, type Tool, type Annotation } from './pdf-viewer/hooks/usePdfAnnotations'
import { usePdfJumpTo } from './pdf-viewer/hooks/usePdfJumpTo'
import { usePdfSearchPanel } from './pdf-viewer/hooks/usePdfSearchPanel'
import { usePdfDocument } from './pdf-viewer/hooks/usePdfDocument'
import { usePdfNativeStyles } from './pdf-viewer/hooks/usePdfNativeStyles'
import { usePdfOverlays } from './pdf-viewer/hooks/usePdfOverlays'
import { usePdfPanelResizer } from './pdf-viewer/hooks/usePdfPanelResizer'
import { usePdfExtract } from './pdf-viewer/hooks/usePdfExtract'
import { PdfToolbarAdvanced } from './pdf-viewer/components/PdfToolbarAdvanced'
import { AnnotationOverlays } from './pdf-viewer/components/AnnotationOverlays'
import { SearchPanel } from './pdf-viewer/components/SearchPanel'
import { PdfViewerCore } from './pdf-viewer/components/PdfViewerCore'
import { searchViaOcrBackend } from './pdf-viewer/utils/searchViaOcrBackend'


type VLine = { x: number; x1: number; y: number; y1: number; text: string }

// ✅ Tool e Annotation ora importati dal hook usePdfAnnotations

// MatchItem ora importato dal hook usePdfSearch


export interface VerifyPdfViewerProps {
	fileUrl: string
	page: number
	lines: VLine[] | null
	onPageChange?: (page: number) => void
	hideToolbar?: boolean
	docId?: string
}

// ✅ Audit logic ora gestita dal hook usePdfAudit

// ✅ ensureNativeSelectStyles ora gestita dal hook usePdfNativeStyles

// legacy style helper no longer used (SvgSelectLayer handles styles per page)

export const VerifyPdfViewer: React.FC<VerifyPdfViewerProps> = ({ fileUrl, page, lines: _lines, onPageChange, hideToolbar: _hideToolbar, docId }) => {
	const hostRef = useRef<HTMLDivElement | null>(null)
	const lastOcrMatchesRef = useRef<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>([])
	const scrollMode = scrollModePlugin()
	const pageNav = pageNavigationPlugin()

	// ✅ Zoom plugin e hook semplificato
	const zoomPluginInstance = zoomPlugin()
	const { zoomTo: zoomToPlugin } = zoomPluginInstance
	const scaleRef = useRef<number>(1)
	const zoomDebounceRef = useRef<number | null>(null)
	// ✅ pdfDocRef ora gestito dal hook usePdfDocument

	// ✅ Hook zoom SEMPLICE - chiama direttamente il plugin
	const { containerRef: zoomContainerRef } = useCleanPdfZoom({
		zoomToPlugin: (scale: number) => {
			console.log('[ZOOM] Calling plugin with scale', scale.toFixed(3))
			scaleRef.current = scale
			if (typeof zoomToPlugin === 'function') {
				zoomToPlugin(scale)
			}
		},
		getCurrentScale: () => scaleRef.current
	})

	// Compatibility: expose zoomTo for existing code
	const zoomTo = (scale: number) => {
		scaleRef.current = scale
		if (typeof zoomToPlugin === 'function') {
			zoomToPlugin(scale)
		}
	}

	// ✅ Hook per il documento PDF
	const { pdfDocRef } = usePdfDocument({ fileUrl })

	// ✅ Estrai stato dal hook
	const viewerState = usePdfViewerState()
	const { contextMenu, setContextMenu, lastSelection, setLastSelection, extractPos, setExtractPos, extractPage, setExtractPage, extractOpen, setExtractOpen, ocrInspectOpen, setOcrInspectOpen } = viewerState

	// ✅ Hook per la search logic
	const { matches, setMatches, searchCacheRef, runSearch } = usePdfSearch(docId, fileUrl, pdfDocRef)

	// ✅ Hook per la native selection logic - spostato dopo le dichiarazioni delle variabili

	const searchPluginInstance = searchPlugin()
	const highlight = highlightPlugin({
		renderHighlights: (props) => {
			const { pageIndex, getCssProperties } = props as any
			const nodes = areas
				.filter(a => a.pageIndex === pageIndex)
				.map(a => (
					<div key={a.id} style={{
						...getCssProperties({ top: a.top, left: a.left, width: a.width, height: a.height }),
						background: 'rgba(107,114,128,0.30)',
						border: '1px solid rgba(31,41,55,0.35)',
						borderRadius: 2,
						pointerEvents: 'none',
					}} />
				))
			return (<React.Fragment>{nodes}</React.Fragment>)
		},
	})

	const [totalPages, setTotalPages] = useState<number>(0)
	const [pageInput, setPageInput] = useState<string>('1')
	const [zoomPct, setZoomPct] = useState<number>(100)

	// ✅ Tool, annots, draft ora gestiti dal hook usePdfAnnotations
	type Area = { id: string; pageIndex: number; left: number; top: number; width: number; height: number }
	const [areas, setAreas] = useState<Area[]>([])
	// ==== OCR INSPECTOR ====
	// Ora gestito dal componente OcrInspector






	// Quick toggle and load current page via hotkey (Ctrl+O)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey && String(e.key).toLowerCase() === 'o') {
				e.preventDefault()
				const p = Math.max(1, parseInt(pageInput || '1', 10))
				// loadOcrPageText(p) // Ora gestito dal componente OcrInspector
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [pageInput, docId])

	// Debug: disegna un rettangolo fisso in alto a sinistra (pagina 1) e un rettangolo sulla prima occorrenza di "oggetto"
	useEffect(() => {
		if (!(window as any).__OCR_DEBUG) return
		const t = window.setTimeout(async () => {
			// try { drawFixedDebugRect(1) } catch {} // Ora gestito dal componente OcrInspector
			try {
				const hits = await runSearch('oggetto', searchPluginInstance, searchViaOcrBackend)
				if (Array.isArray(hits) && hits.length > 0) {
					const h = hits[0]
					// drawOcrRects([{ page: h.page, x0Pct: h.x0Pct!, y0Pct: h.y0Pct!, x1Pct: h.x1Pct!, y1Pct: h.y1Pct! }], 'rgba(16,185,129,1)') // Ora gestito dal componente OcrInspector
				}
			} catch { }
		}, 500)
		return () => window.clearTimeout(t)
	}, [totalPages])
	const [selectMode, setSelectMode] = useState<boolean>(true) // ✅ SEMPRE ATTIVA
	const [selectKind, setSelectKind] = useState<'NATIVE' | 'OCR'>('NATIVE')
	const [_selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
	const selectionHandledRef = useRef<boolean>(false)

	// ✅ Hook per gli overlay e la gestione delle pagine
	const { overlayRootsRef, selectRootsRef, pageElsRef, elToPageRef, selectTick, setSelectTick } = usePdfOverlays({
		hostRef,
		selectMode,
		selectKind
	})

	// ✅ Hook per gli stili di selezione nativa
	usePdfNativeStyles({ hostRef, selectMode, selectKind })

	// ✅ Hook per le annotazioni
	const { tool, setTool, annots, setAnnots, draft, setDraft } = usePdfAnnotations({
		hostRef,
		pageElsRef,
		elToPageRef
	})

	// ✅ Hook per la native selection logic
	const nativeSelectionRefs = useNativeSelection({
		selectMode,
		selectKind,
		extractOpen,
		hostRef,
		pageElsRef,
		elToPageRef,
		overlayRootsRef,
		pdfDocRef,
		setDraft,
		setExtractPos,
		setExtractPage,
		setLastSelection,
		setContextMenu,
		selectionHandledRef
	})

	// ✅ Hook per la deskew logic
	const { autoDeskew, setAutoDeskew, skewAngles, setSkewAngles, persistSkew, estimateSkewForPage, applyImmediateToPage } = usePdfDeskew({
		docId,
		pdfDocRef,
		hostRef
	})

	// ✅ Hook per la audit logic
	const { audit, setAudit } = usePdfAudit({ hostRef })

	// ✅ Hook per lo stato dell'estratto
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

	// ✅ Hook per il jump-to logic
	const { goToMatch } = usePdfJumpTo({
		docId,
		hostRef,
		pageNav,
		searchPluginInstance,
		overlayRootsRef,
		setSelectedAnnot,
		areas,
		setAreas,
		searchCacheRef,
		fileUrl
	})

	// ✅ Hook per il search panel
	const { panelW, setPanelW, searchQ, setSearchQ, showAdvanced, setShowAdvanced, resizingRef } = usePdfSearchPanel()

	// ✅ Panel resizer
	usePdfPanelResizer({ resizingRef, setPanelW })


	return (
		<React.Fragment>
			<div className="flex h-full w-full">
				{/* Left: toolbar + viewer */}
				<div className="flex flex-col flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2 border-b px-2 py-1 text-sm bg-white">
						<div className="flex items-center gap-1">
							<input className="w-16 border rounded px-1 py-0.5 text-center" value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { const p = Math.max(1, Math.min(totalPages || 1, parseInt(pageInput || '1', 10))); try { (pageNav as any).jumpToPage?.(p - 1) } catch { }; onPageChange?.(p) } }} />
							<span className="text-muted-foreground whitespace-nowrap px-1">/ {totalPages || '-'}</span>
						</div>

						{/* Quick search bar - nascosto quando pannello aperto */}
						{!showAdvanced && (
							<div className="flex items-center gap-1 ml-2">
								<Search size={16} className="text-gray-500" />
								<input
									value={searchQ}
									onChange={(e) => setSearchQ(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											runSearch(searchQ, searchPluginInstance, searchViaOcrBackend)
											setShowAdvanced(true)  // ✅ Apri pannello automaticamente
										}
									}}
									placeholder="Cerca nel documento"
									className="w-72 border rounded px-2 py-1"
								/>
								<button className="px-2 py-1 border rounded" title="Apri pannello ricerca" onClick={() => setShowAdvanced(true)}>
									<PanelRightOpen size={16} />
								</button>
							</div>
						)}

						{/* Pulsante per chiudere il pannello quando è aperto */}
						{showAdvanced && (
							<button
								className="px-2 py-1 border rounded bg-blue-100 border-blue-400"
								title="Chiudi pannello ricerca"
								onClick={() => setShowAdvanced(false)}
							>
								<PanelRightOpen size={16} className="rotate-180" />
							</button>
						)}

						<PdfToolbarAdvanced
							tool={tool}
							setTool={setTool}
							audit={audit}
							setAudit={setAudit}
							autoDeskew={autoDeskew}
							setAutoDeskew={setAutoDeskew}
							skewAngles={skewAngles}
							setSkewAngles={setSkewAngles}
							pageInput={pageInput}
							selectKind={selectKind}
							setSelectKind={setSelectKind}
							zoomPct={zoomPct}
							setZoomPct={setZoomPct}
							scaleRef={scaleRef}
							zoomDebounceRef={zoomDebounceRef}
							hostRef={hostRef}
							showAdvanced={showAdvanced}
							setShowAdvanced={setShowAdvanced}
							estimateSkewForPage={estimateSkewForPage}
							persistSkew={persistSkew}
							applyImmediateToPage={applyImmediateToPage}
							zoomTo={zoomTo}
						/>
					</div>

					<div ref={(el) => {
						hostRef.current = el
						if (zoomContainerRef) (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
					}} className="flex-1 overflow-hidden relative" style={{
						['--scale-factor' as any]: String(scaleRef.current || 1)
					}}>
						<PdfViewerCore
							fileUrl={fileUrl}
							page={page}
							onPageChange={onPageChange}
							scrollMode={scrollMode}
							pageNav={pageNav}
							searchPluginInstance={searchPluginInstance}
							highlight={highlight}
							zoomPluginInstance={zoomPluginInstance}
							selectMode={selectMode}
							selectKind={selectKind}
							hostRef={hostRef}
							pdfDocRef={pdfDocRef}
							scaleRef={scaleRef}
							setPageInput={setPageInput}
							setTotalPages={setTotalPages}
							setZoomPct={setZoomPct}
							setExtractPos={setExtractPos}
							setExtractPage={setExtractPage}
							setLastSelection={setLastSelection}
							setExtractOpen={setExtractOpen}
							docId={docId}
						/>
					</div>

					{/* OCR Inspector ora gestito dal componente OcrInspector */}

					{/* Overlays */}
					<AnnotationOverlays
						selectedAnnot={selectedAnnot}
						annots={annots}
						draft={draft}
						overlayRootsRef={overlayRootsRef}
					/>


					{/* Extract Classifier Dialog */}
					<ExtractClassifierDialog
						open={extractOpen}
						praticaId="current-pratica" // TODO: Ottenere dal contesto
						sourceDoc={{
							id: docId || 'current',
							title: 'Documento corrente',
							page: extractPage,
							bbox: lastSelection?.viewportBox ? {
								x: lastSelection.viewportBox.x,
								y: lastSelection.viewportBox.y,
								width: lastSelection.viewportBox.w,
								height: lastSelection.viewportBox.h
							} : undefined
						}}
						extractContent={lastSelection?.selectedText || ''}
						onSuccess={(estratto) => {
							console.log('✅ [VerifyPdfViewer] Estratto creato:', estratto)
							// Pulisci form e chiudi dialog
							setExtractOpen(false)
							setDraft(null)
							setSelBox(null)
							setSelectedAnnot(null)
							selectionHandledRef.current = false

							// Pulisci selezione
							try { window.dispatchEvent(new Event('ai-select-clear')) } catch { }
							try { const s = window.getSelection(); s && s.removeAllRanges() } catch { }
						}}
						onCancel={() => {
							setExtractOpen(false)
							setDraft(null)
							setSelBox(null)
							setSelectedAnnot(null)
							selectionHandledRef.current = false

							// Pulisci selezione
							try { window.dispatchEvent(new Event('ai-select-clear')) } catch { }
							try { const s = window.getSelection(); s && s.removeAllRanges() } catch { }
						}}
					/>

				</div>

				<SearchPanel
					showAdvanced={showAdvanced}
					setShowAdvanced={setShowAdvanced}
					panelW={panelW}
					resizingRef={resizingRef}
					searchQ={searchQ}
					docId={docId}
					fileUrl={fileUrl}
					totalPages={totalPages}
					setMatches={setMatches}
					searchPluginInstance={searchPluginInstance}
					goToMatch={goToMatch}
					searchCacheRef={searchCacheRef}
				/>
			</div>

			{/* Context Menu */}
			<ContextMenu
				contextMenu={contextMenu}
				lastSelection={lastSelection}
				pageElsRef={pageElsRef}
				onContextMenuChange={setContextMenu}
				onOcrInspectOpenChange={setOcrInspectOpen}
				onExtractPosChange={setExtractPos}
				onExtractPageChange={setExtractPage}
				onExtractOpenChange={setExtractOpen}
			/>

			{/* OCR Inspector */}
			<OcrInspector
				docId={docId}
				ocrInspectOpen={ocrInspectOpen}
				onOcrInspectOpenChange={setOcrInspectOpen}
				hostRef={hostRef}
				lastOcrMatchesRef={lastOcrMatchesRef}
			/>
		</React.Fragment>
	)
}
