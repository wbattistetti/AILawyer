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


type VLine = { x: number; x1: number; y: number; y1: number; text: string }

// ✅ Tool e Annotation ora importati dal hook usePdfAnnotations

// MatchItem ora importato dal hook usePdfSearch

// Search using backend OCR text/layout when PDF has no native text
async function searchViaOcrBackend(docId: string, qRaw: string): Promise<MatchItem[]> {
  try {
    const doc: any = await api.getDocumento(docId)
    const layout = Array.isArray(doc?.ocrLayout)
      ? doc.ocrLayout
      : (() => {
          try { return JSON.parse(doc?.ocrLayout || '[]') } catch { return [] }
        })()
    const sep = '\f'
    const pagesText: string[] = String(doc?.ocrText || '').split(sep)
    logger.debug('OCR[data][pages]', { pagesWithText: pagesText.length, pagesWithLayout: Array.isArray(layout) ? layout.length : 0 })
    const out: MatchItem[] = []
    const needle = (qRaw || '').toLowerCase()

    for (let p = 0; p < Math.max(pagesText.length, layout.length); p++) {
      const pageIdx = p
      const pageTextRaw = String(pagesText[p] || '')
      // Normalize accents/case to match common inputs with/without maiuscole e apostrofi
      const normalize = (s: string) => s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[’'`´]/g, "'")
        .toLowerCase()
      const pageText = normalize(pageTextRaw)
      const pageLayout = layout[p] || {}
      let words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }> = pageLayout.words || []
      const width = pageLayout.width || pageLayout.imgW || 0
      const height = pageLayout.height || pageLayout.imgH || 0
      console.log('[OCR][page][raw]', { 
        page: pageIdx + 1, 
        textLen: pageTextRaw.length, 
        wordsLen: words?.length || 0, 
        width, 
        height,
        layoutKeys: Object.keys(pageLayout),
        firstWord: words[0] || null
      })
      logger.debug('OCR[page][stats]', { page: pageIdx + 1, textLen: pageTextRaw.length, words: words?.length || 0, width, height })
      if (!pageText) continue

      // NO FALLBACK: se mancano bbox, skippa la pagina
      if (!words.length || !width || !height) {
        console.error('[OCR][page][SKIP]', { 
          page: pageIdx + 1, 
          reason: !words.length ? 'no words' : !width ? 'no width' : 'no height',
          layoutKeys: Object.keys(pageLayout)
        })
        continue
      }

      // Match "word-level" usando TESTO ESATTO, non posizione geometrica
      // words[] sono in ordine geometrico, pageTextRaw in ordine logico
      // Soluzione: cerca la query nel testo, poi trova le parole esatte che compongono il match
      
      const needle = normalize(qRaw)
      const normalizedPageText = normalize(pageTextRaw)
      let pos = 0
      
      while (true) {
        const idx = normalizedPageText.indexOf(needle, pos)
        if (idx < 0) break
        const start = idx
        const end = idx + needle.length
        
        // Estrai il testo matchato dal testo originale (non normalizzato)
        const matchedText = pageTextRaw.slice(start, end)
        const matchedNorm = normalize(matchedText)
        
        // Cerca in words[] le parole che compongono ESATTAMENTE questo match
        // Strategia: matcha parole il cui testo normalizzato è una sottostringa del match
        const matchWords = words.filter(w => {
          const wText = normalize(w.text || '')
          if (!wText) return false
          // Match solo se la parola è CONTENUTA nel testo matchato (non viceversa!)
          return matchedNorm.includes(wText)
        })
        
        // Calcola bbox union
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const w of matchWords) {
          x0 = Math.min(x0, w.x0)
          y0 = Math.min(y0, w.y0)
          x1 = Math.max(x1, w.x1)
          y1 = Math.max(y1, w.y1)
        }
        
        // NO FALLBACK: se nessuna parola matchata, skippa questo match
        if (matchWords.length === 0 || x0 === Infinity) {
          console.warn('[OCR][match][SKIP]', { page: pageIdx + 1, start, reason: 'no matching words' })
          pos = end
          continue
        }
        
        // Snippet: dall'inizio della riga corrente + max 2-3 righe
        let lineStart = start
        while (lineStart > 0 && pageTextRaw[lineStart - 1] !== '\n') {
          lineStart--
        }
        
        let lineEnd = end
        let linesCount = 0
        for (let i = end; i < pageTextRaw.length && linesCount < 2; i++) {
          lineEnd = i + 1
          if (pageTextRaw[i] === '\n') linesCount++
        }
        
        const snippet = pageTextRaw.slice(lineStart, Math.min(pageTextRaw.length, lineEnd)).trim()
        console.log('[OCR][match][word]', { 
          page: pageIdx + 1, 
          query: qRaw,
          start,
          matchedText,
          matchWords: matchWords.length,
          matchWordsTexts: matchWords.map(w => w.text).join('|'),
          bbox: { x0: x0.toFixed(3), y0: y0.toFixed(3), x1: x1.toFixed(3), y1: y1.toFixed(3), w: (x1-x0).toFixed(3), h: (y1-y0).toFixed(3) },
          snippet: snippet.slice(0, 100)
        })
        out.push({ id: `${p}:${start}`, page: pageIdx + 1, snippet, x0Pct: x0, x1Pct: x1, y0Pct: y0, y1Pct: y1, qLen: needle.length, charIdx: start })
        pos = end
      }
    }
    return out
  } catch { return [] }
}

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
    const lastOcrMatchesRef = useRef<Array<{ page:number; x0Pct:number; y0Pct:number; x1Pct:number; y1Pct:number }>>([])
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
        } catch {}
      }, 500)
      return () => window.clearTimeout(t)
    }, [totalPages])
const [selectMode, setSelectMode] = useState<boolean>(true) // ✅ SEMPRE ATTIVA
const [selectKind, setSelectKind] = useState<'NATIVE'|'OCR'>('NATIVE')
const [_selBox, setSelBox] = useState<{ x:number; y:number; w:number; h:number }|null>(null)
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

const [extractType, setExtractType] = useState<string>('verbale')
const [extractNotes, setExtractNotes] = useState<string>('')
const [showNotes, setShowNotes] = useState<boolean>(false)
const [extractTitle, setExtractTitle] = useState<string>('')
const [selectedAnnot, setSelectedAnnot] = useState<Annotation | null>(null)
// ✅ drawingRef ora gestito dal hook usePdfAnnotations
const openedAtRef = useRef<number>(0)
const isSelectingRef = useRef<boolean>(false)
const lastNativeRangeRef = useRef<Range | null>(null)
const lastDraftBoxRef = useRef<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } | null>(null)
const suppressClearRef = useRef<boolean>(false)

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
// Note: no custom anchoring; let the browser handle selection during drag
// Global selection overlay (fallback, robust across pages)
// legacy globals removed (use per-page overlay)

    // ✅ Deskew logic ora gestita dal hook usePdfDeskew

	// ✅ Audit mode ora gestito dal hook usePdfAudit

	// ✅ Hook per il search panel
	const { panelW, setPanelW, searchQ, setSearchQ, showAdvanced, setShowAdvanced, resizingRef } = usePdfSearchPanel()

	// ✅ PDF document loading ora gestito dal hook usePdfDocument

	// ✅ Audit style logic ora gestita dal hook usePdfAudit

	// ✅ Native selection styles e overlay management ora gestiti dai hook usePdfNativeStyles e usePdfOverlays



// Search logic ora gestita dal hook usePdfSearch

// removed unused snippet renderer

	// ✅ goToMatch ora gestito dal hook usePdfJumpTo

	// ✅ Pointer drawing handlers ora gestiti dal hook usePdfAnnotations

	// ✅ Panel resizer ora gestito dal hook usePdfPanelResizer
	usePdfPanelResizer({ resizingRef, setPanelW })

	

	// ✅ Jump-to handler ora gestito dal hook usePdfJumpTo

	// Log draft state on every render
	React.useEffect(() => {
		if (draft) {
			console.log('[DRAFT][STATE]', { 
				hasDraft: !!draft, 
				page: draft.page, 
				id: draft.id,
				rootExists: !!overlayRootsRef.current.get(draft.page)
			})
		}
	}, [draft])

	return (
		<React.Fragment>
		<div className="flex h-full w-full">
			{/* Left: toolbar + viewer */}
			<div className="flex flex-col flex-1 min-w-0">
				<div className="flex flex-wrap items-center gap-2 border-b px-2 py-1 text-sm bg-white">
					<div className="flex items-center gap-1">
						<input className="w-16 border rounded px-1 py-0.5 text-center" value={pageInput} onChange={(e)=>setPageInput(e.target.value.replace(/[^0-9]/g,''))} onKeyDown={(e)=>{ if(e.key==='Enter'){ const p = Math.max(1, Math.min(totalPages || 1, parseInt(pageInput||'1',10))); try{ (pageNav as any).jumpToPage?.(p-1) } catch {}; onPageChange?.(p) } }} />
						<span className="text-muted-foreground whitespace-nowrap px-1">/ {totalPages || '-'}</span>
					</div>

				{/* Quick search bar - nascosto quando pannello aperto */}
				{!showAdvanced && (
					<div className="flex items-center gap-1 ml-2">
						<Search size={16} className="text-gray-500" />
						<input 
							value={searchQ} 
							onChange={(e)=>setSearchQ(e.target.value)} 
							onKeyDown={(e)=>{ 
								if(e.key==='Enter'){ 
									runSearch(searchQ, searchPluginInstance, searchViaOcrBackend)
									setShowAdvanced(true)  // ✅ Apri pannello automaticamente
								} 
							}} 
							placeholder="Cerca nel documento" 
							className="w-72 border rounded px-2 py-1" 
						/>
						<button className="px-2 py-1 border rounded" title="Apri pannello ricerca" onClick={()=>setShowAdvanced(true)}>
							<PanelRightOpen size={16} />
						</button>
					</div>
				)}
				
				{/* Pulsante per chiudere il pannello quando è aperto */}
				{showAdvanced && (
					<button 
						className="px-2 py-1 border rounded bg-blue-100 border-blue-400" 
						title="Chiudi pannello ricerca" 
						onClick={()=>setShowAdvanced(false)}
					>
						<PanelRightOpen size={16} className="rotate-180" />
					</button>
				)}
					<div className="flex items-center gap-2">
						<button className={`px-2 py-1 rounded border ${tool==='highlight'?'bg-yellow-100 border-yellow-400':''}`} title="Evidenzia" onClick={()=>setTool(tool==='highlight'?'none':'highlight')}>
							<Highlighter size={16} />
						</button>
						<button className={`px-2 py-1 rounded border ${tool==='underline'?'bg-sky-100 border-sky-400':''}`} title="Sottolinea" onClick={()=>setTool(tool==='underline'?'none':'underline')}>
							<UnderlineIcon size={16} />
						</button>
						<button className={`px-2 py-1 rounded border ${tool==='strike'?'bg-red-100 border-red-400':''}`} title="Barra" onClick={()=>setTool(tool==='strike'?'none':'strike')}>
							<StrikethroughIcon size={16} />
						</button>
                    <button className={`px-2 py-1 rounded border ${audit?'bg-gray-100 border-gray-400':''}`} title="Audit mode (testo digitale)" onClick={()=>setAudit(a=>!a)}>Audit</button>
						<button className={`px-2 py-1 rounded border ${tool==='comment'?'bg-amber-100 border-amber-400':''}`} title="Commento" onClick={()=>setTool(tool==='comment'?'none':'comment')}>
							<MessageSquare size={16} />
						</button>
                        <button
                          className={`px-2 py-1 rounded border ${autoDeskew ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : ''}`}
                          title={autoDeskew ? 'Raddrizza: ON' : 'Raddrizza quando serve'}
                          onClick={async()=>{
                            const next = !autoDeskew
                            try { console.log('[DESKEW][toggle]', { next }) } catch {}
                            setAutoDeskew(next)
                            if (next) {
                              const p = Math.max(1, parseInt(pageInput || '1', 10))
                              try { console.log('[DESKEW][estimate][start]', { page: p }) } catch {}
                              if (!skewAngles[p]) {
                                const ang = await estimateSkewForPage(p)
                                try { console.log('[DESKEW][estimate][done]', { page: p, angle: ang }) } catch {}
                                setSkewAngles(prev => { const n = { ...prev, [p]: ang }; persistSkew(n); return n })
                                applyImmediateToPage(p, ang)
                              } else {
                                const ang = skewAngles[p]
                                try { console.log('[DESKEW][cached]', { page: p, angle: ang }) } catch {}
                                applyImmediateToPage(p, ang)
                              }
                            }
                          }}
                        >Raddrizza</button>
					</div>
				<div className="w-full md:w-auto md:ml-auto flex items-center gap-2 justify-start md:justify-end flex-wrap">
					<div className="flex items-center gap-1">
						<label className="text-xs text-gray-600">Selezione</label>
						<select className="border rounded px-1 py-0.5 text-xs" value={selectKind} onChange={(e)=>setSelectKind(e.target.value as any)}>
							<option value="NATIVE">Nativa</option>
							<option value="OCR">OCR</option>
						</select>
					</div>
						<span className="text-xs w-10 text-right">{zoomPct}%</span>
						<input
							type="range"
							min={50}
							max={300}
							step={1}
							value={zoomPct}
							onChange={(e)=>{
								const v = parseInt(e.target.value,10)
								setZoomPct(v)
								const s = v/100
								scaleRef.current = s
								if (zoomDebounceRef.current != null) {
									window.clearTimeout(zoomDebounceRef.current)
								}
								zoomDebounceRef.current = window.setTimeout(() => {
									try { zoomTo(s) } catch {}
									const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
									if (viewer) viewer.style.setProperty('--scale-factor', String(s))
								}, 80)
							}}
						/>
					</div>
				</div>

                <div ref={(el) => {
					hostRef.current = el
					if (zoomContainerRef) (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
				}} className="flex-1 overflow-hidden relative" style={{ 
					['--scale-factor' as any]: String(scaleRef.current || 1)
				}}>
					<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
						<Viewer
							fileUrl={fileUrl}
							defaultScale={0.75}
							plugins={[scrollMode, pageNav, searchPluginInstance, highlight, zoomPluginInstance]}
							scrollMode={ScrollMode.Vertical}
							initialPage={Math.max(0, (page || 1) - 1)}
							onPageChange={(e) => { const cp = e.currentPage + 1; setPageInput(String(cp)); onPageChange?.(cp) }}
                            onDocumentLoad={(e) => { 
								const doc = (e as any).doc || (e as any).document
								const total = doc?.numPages || 0
								if (doc) pdfDocRef.current = doc  // ✅ Salva reference per hook
								if (total) { setTotalPages(total); setPageInput('1') }
								const container = hostRef.current as HTMLElement | null
								if (container) container.style.setProperty('--scale-factor', String(scaleRef.current || 1))
								const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
								if (viewer) viewer.style.setProperty('--scale-factor', String(scaleRef.current || 1))
								try { window.dispatchEvent(new CustomEvent('app:viewer-ready', { detail: { docId: docId || 'current' } })) } catch {}
								try { console.log('[VIEWER][ready]', { docId: docId || 'current', total }) } catch {}
							}}
                            onZoom={(e: any) => { 
								const s = (e?.scale || e?.zoom) as number
								if (typeof s === 'number') { 
									console.log('[ZOOM][viewer-onZoom] FIRED', { 
										scale: s.toFixed(3), 
										pct: Math.round(s*100),
										scaleRefBefore: scaleRef.current.toFixed(3)
									})
									scaleRef.current = s
									setZoomPct(Math.round(s*100))
									;(window as any).__rpvLastZoomScale = s
									const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
									if (viewer) {
										viewer.style.setProperty('--scale-factor', String(s))
										console.log('[ZOOM][viewer-onZoom] CSS var set', { 
											scaleFactor: s.toFixed(3),
											viewerExists: !!viewer
										})
									}
									try { requestAnimationFrame(()=>{ try { (window as any).__deskewApply?.() } catch {} }) } catch {} 
								} 
							}}
                            renderPage={(p: any) => (
                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                    {p.canvasLayer.children}
                                    {p.annotationLayer.children}
                                    {p.textLayer.children}
                                    {selectMode && selectKind==='OCR' && (
                                        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
                                            <SvgSelectLayer
                                                enabled={true}
                                                pageIndex={p.pageIndex}
                                                onSelect={async ({ pageNumber, viewportBox })=>{
                                                const host = hostRef.current as HTMLElement | null; if (!host) return
                                                const r = host.getBoundingClientRect()
                                                const pageRoot = host.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null
                                                const pr = pageRoot?.getBoundingClientRect() || r
                                                const panelW = 460, panelH = 260
                                                const boxLeft = pr.left + viewportBox.x
                                                const boxTop = pr.top + viewportBox.y
                                                const boxRight = boxLeft + viewportBox.w
                                                const boxBottom = boxTop + viewportBox.h
                                                // Posizione centrata rispetto al rettangolo
                                                let px = boxLeft + (viewportBox.w - panelW) / 2
                                                let py = boxTop + (viewportBox.h - panelH) / 2
                                                // Se il pannello ci sta dentro al box, clamp all'interno; altrimenti clamp a viewport
                                                const fitsInside = viewportBox.w >= panelW && viewportBox.h >= panelH
                                                if (fitsInside) {
                                                    px = Math.max(boxLeft, Math.min(px, boxRight - panelW))
                                                    py = Math.max(boxTop, Math.min(py, boxBottom - panelH))
                                                } else {
                                                    px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
                                                    py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
                                                }
                                                setExtractPos({ x: px, y: py })
                                                setExtractPage(pageNumber)
                                                // OCR mode: per ora DOM preview; con OCR useremo i box parola
                                                const { text: preview } = await getTextInViewportBox(host, pageNumber, viewportBox)
                                                let canonical = preview
                                                // PDF-based opzionale
                                                try {
                                                    if (pdfDocRef.current) {
                                                        const page = await pdfDocRef.current.getPage(pageNumber)
                                                        // Viewport coerente con le dimensioni DOM della pagina
                                                        const base = page.getViewport({ scale: 1 })
                                                        const domW = pr.width
                                                        const scale = Math.max(0.1, domW / base.width)
                                                        const vp = page.getViewport({ scale })
                                                        const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
                                                        const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
                                                        const res = await getTextInPdfBox(page, { x0, y0, x1, y1 })
                                                        if (res.text && res.text.trim()) canonical = res.text
                                                        try { console.log('[EXTRACT][PDF_BOX]', { pageNumber, domW, baseW: base.width, scale, pdfBox: { x0, y0, x1, y1 } }) } catch {}
                                                    }
                                                } catch {}
                                                try { console.log('[EXTRACT][TEXT]', { pageNumber, viewportBox, preview, canonical }) } catch {}
                                                setLastSelection({ pdfPageNumber: pageNumber, bboxPdf: undefined, viewportBox, text: canonical })
                                                setExtractOpen(true)
                                            }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
						/>
					</Worker>
				</div>

				{/* OCR Inspector ora gestito dal componente OcrInspector */}

                {/* Overlays */}
				{[...(selectedAnnot ? [selectedAnnot] : []), ...annots, ...(draft ? [draft] : [])].map(a => {
					const root = overlayRootsRef.current.get(a.page)
					if (a.id === 'draft') {
						console.log('[OVERLAY][RENDER][DRAFT]', { 
							page: a.page, 
							type: a.type,
							color: a.color,
							box: { x0: a.x0Pct, y0: a.y0Pct, x1: a.x1Pct, y1: a.y1Pct },
							hasRoot: !!root,
							allRoots: Array.from(overlayRootsRef.current.keys())
						})
					}
					if (!root) return null
					const left = `${a.x0Pct * 100}%`
					const top = `${a.y0Pct * 100}%`
					const width = `${(a.x1Pct - a.x0Pct) * 100}%`
					const height = `${Math.max(0.01, (a.y1Pct - a.y0Pct)) * 100}%`
					const style: React.CSSProperties = { position:'absolute', left, top, width, height, pointerEvents:'none' }
					let node: React.ReactNode = null
					if (a.type==='highlight') node = <div style={{ ...style, background:a.color, borderRadius:2 }} />
					if (a.type==='underline') node = <div style={{ ...style, height:2, background:a.color }} />
					if (a.type==='strike') node = <div style={{ ...style, height:2, background:a.color }} />
					if (a.type==='comment') node = <div style={{ ...style, width:12, height:12, background:'#f59e0b', borderRadius:2 }} title={a.text} />
					return createPortal(node, root)
				})}

				{/* Legacy per-page overlay removed in favor of SvgSelectLayer and native selection */}
				{false && totalPages > 0 && Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1
                  const root = selectRootsRef.current.get(pageNum)
                  if (!root || !selectMode) return null
                  const pageLayer = pageElsRef.current.get(pageNum)
                  const textLayer = pageLayer?.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
                  const onSel = async (sel: any) => {
                    try {
                      const pageR = pageLayer!.getBoundingClientRect()
                      const doc = pdfDocRef.current
                      const page = await doc.getPage(pageNum)
                      const base = page.getViewport({ scale: 1 })
                      const domW = pageR.width
                      const scale = Math.max(0.1, domW / base.width)
                      const vp = page.getViewport({ scale })
                      const { x0, y0, x1, y1 } = getPdfCoords(sel.viewportBox, vp)
                      let text = ''
                      try { if (textLayer) { const r = await getSelectedTextInRect(textLayer, sel.viewportBox); text = r.text } } catch {}
                      // center the panel over selection, clamped to viewport
                      const panelW = 420, panelH = 260
                      let px = pageR.left + sel.viewportBox.x + (sel.viewportBox.w/2) - (panelW/2)
                      let py = pageR.top + sel.viewportBox.y + (sel.viewportBox.h/2) - (panelH/2)
                      const viewportW = window.innerWidth || document.documentElement.clientWidth
                      const viewportH = window.innerHeight || document.documentElement.clientHeight
                      px = Math.max(8, Math.min(px, viewportW - panelW - 8))
                      py = Math.max(8, Math.min(py, viewportH - panelH - 8))
                      setExtractPos({ x: px, y: py })
                      setExtractPage(pageNum)
                      setLastSelection({ pdfPageNumber: pageNum, bboxPdf: { x0,y0,x1,y1 }, viewportBox: sel.viewportBox, text })
                      setExtractOpen(true)
                    } catch (err) {
                      console.warn('[EXTRACT] per-page sel error', err)
                    }
                  }
                  return createPortal(
                    <PdfSelectionOverlay
                      key={`sel-${pageNum}-${selectTick}`}
                      pdfPageNumber={pageNum}
                      viewport={null as any}
                      textLayerDiv={textLayer}
                      onSelection={onSel}
                      enabled={selectMode}
                    />,
                    root
                  )
                })}
            
		{/* Extract Dialog */}
		<ExtractDialog
			extractOpen={extractOpen}
			extractPos={extractPos}
			extractTitle={extractTitle}
			extractType={extractType}
			extractNotes={extractNotes}
			extractPage={extractPage}
			showNotes={showNotes}
			selectKind={selectKind}
			lastSelection={lastSelection}
			docId={docId}
			fileUrl={fileUrl}
			hostRef={hostRef}
			suppressClearRef={suppressClearRef}
			onExtractTitleChange={setExtractTitle}
			onExtractTypeChange={setExtractType}
			onExtractNotesChange={setExtractNotes}
			onShowNotesChange={setShowNotes}
			onExtractOpenChange={setExtractOpen}
			onDraftChange={setDraft}
			onSelBoxChange={setSelBox}
			onSelectedAnnotChange={setSelectedAnnot}
			onSelectionHandledChange={(handled) => { selectionHandledRef.current = handled }}
		/>

            </div>

            {showAdvanced && (
			<React.Fragment>
					<div onMouseDown={()=>{ resizingRef.current = true; document.body.style.cursor = 'ew-resize' }} className="w-1.5 cursor-col-resize bg-transparent hover:bg-blue-300" title="Ridimensiona">
						<GripVertical size={12} className="mx-auto text-gray-400" />
					</div>
					<div className="h-full border-l bg-white flex flex-col" style={{ width: panelW }}>
					{/* Header pannello ricerca con X per chiudere */}
					<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
						<h3 className="font-semibold text-sm">Risultati ricerca</h3>
						<button 
							className="p-1 hover:bg-gray-200 rounded" 
							title="Chiudi pannello"
							onClick={()=>setShowAdvanced(false)}
						>
							<X size={18} />
						</button>
					</div>
						
                        <SearchProvider defaultScope={'current'} initialQuery={searchQ} autoSearch={true} onSearch={async(q, _scope)=>{
                            console.log('[SEARCH][document] Backend search start', { q, docId })
                            
                            try {
                                // ✅ USA LA STESSA API DELL'ARCHIVIO!
                                const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
                                const response = await fetch(`${apiUrl}/search/archive?q=${encodeURIComponent(q)}&docId=${docId}`)
                                
                                if (!response.ok) throw new Error('Search failed')
                                const data = await response.json()
                                
                                console.log('[SEARCH][document] API response', { total: data.total, matches: data.matches?.length })
                                
                                // Converti i risultati nel formato atteso
                                const found = data.matches || []
                                setMatches(found)
                                
                                const docTitle = (fileUrl?.split('/')?.pop() || 'Documento') as string
                                const actualDocId = docId || 'current'
                                console.log('[SEARCH][provider][onSearch]', { docId: actualDocId, q, foundCount: found.length })
                                
                                const groups = [{ doc: { id: actualDocId, title: docTitle, hash: '', pages: totalPages, kind: 'pdf' as const }, matches: found.map((m: any)=>({
                                    id: m.id,
                                    docId: actualDocId,
                                    docTitle,
                                    kind: 'pdf' as const,
                                    page: m.page,
                                    q: q,
                                    x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct,
                                    charIdx: m.charIdx, qLength: m.qLen,
                                    snippet: m.snippet,
                                    score: 0,
                                })) }]
                                
                                return { id: cryptoRandom(), query: q, scope: 'current' as any, total: found.length, groups } as any
                                
                            } catch (error) {
                                console.error('[SEARCH][document] API error', error)
                                return { id: cryptoRandom(), query: q, scope: 'current' as any, total: 0, groups: [] } as any
                            }
                        }} adapterFactory={() => ({
							goToMatch: async (m: any) => {
								try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: m.q }) } catch {}
								const mi = { id: m.id, page: m.page, snippet: m.snippet, x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct, charIdx: m.charIdx, qLen: m.qLength } as any
								await (goToMatch as any)(mi)
                                // disegna rettangoli sugli hit correnti (dalla cache dell'ultima ricerca)
                                try {
                                  const cacheKey = `${fileUrl}::${(m.q||'').toLowerCase()}::${docId || 'no-doc'}`
                                  const cached = searchCacheRef.current.get(cacheKey) || []
                                  const matches = cached.map((mm:any)=>({ page:mm.page, x0Pct:mm.x0Pct, y0Pct:mm.y0Pct, x1Pct:mm.x1Pct, y1Pct:mm.y1Pct }))
                                  // drawOcrRects(matches.filter(Boolean)) // Ora gestito dal componente OcrInspector
                                  const box = [{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }]
                                  const paint = () => { try { /* drawOcrRects(box) */ } catch {} } // Ora gestito dal componente OcrInspector
                                  paint(); setTimeout(paint, 100); setTimeout(paint, 300)
                                } catch {}
							}
						})}>
							<SearchPanelTree showInput={true} showScopeSelector={false} initialQuery={searchQ} />
						</SearchProvider>
					</div>
			</React.Fragment>
			)}
		</div>
        {/* global overlay rimosso: usiamo solo overlay per-pagina */}
		
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
