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


type VLine = { x: number; x1: number; y: number; y1: number; text: string }

type Tool = 'none' | 'highlight' | 'underline' | 'strike' | 'comment'

type Annotation = {
	id: string
	page: number
	type: 'highlight' | 'underline' | 'strike' | 'comment'
	color: string
	x0Pct: number
	y0Pct: number
	x1Pct: number
	y1Pct: number
	text?: string
}

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

// Simple token classifier for demo; replace with pseudonymizer
function classifyToken(str: string): 'safe' | 'pseudo' | 'suspect' {
	const raw = (str || '').trim()
	if (!raw) return 'safe'
	// Pseudonym tokens (already replaced): TL[...] or PREFIX_xxxx
	if (/^TL\[[A-Z]+\]:\s*[A-Z_0-9-]+$/.test(raw) || /^[A-Z]{2,}_[0-9a-f]{4,}$/i.test(raw)) return 'pseudo'
	// Pure punctuation or numbers
	if (/^[\p{P}\p{S}]+$/u.test(raw)) return 'safe'
	if (/^\d+[\d\s\.\-\/]*$/.test(raw)) return 'safe'
	// Normalize accents/case
	const norm = raw
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
	// Short tokens are rarely informative PII
	if (norm.length <= 2) return 'safe'
	// Italian stopwords + connectors (expanded)
	const STOP = new Set<string>([
		'il','lo','la','l','i','gli','le',
		'un','una','uno',
		'di','del','dello','della','dei','degli','delle',"dell'",
		'a','al','allo','alla','ai','agli','alle',"all'",
		'da','dal','dallo','dalla','dai','dagli','dalle',"dall'",
		'in','nel','nello','nella','nei','negli','nelle',"nell'",
		'con','col','coi',
		'su','sul','sullo','sulla','sui','sugli','sulle',"sull'",
		'per','tra','fra','e','ed','o','oppure',
		'che','non','come','anche','sono','era','furono',
		'presso'
	])
	if (STOP.has(norm)) return 'safe'
	// Common legal/admin nouns to be greyed (not PII)
	const LEGAL = new Set<string>([
		'cortese','attenzione','dottor','dottore','dottoressa','avvocato','avv','procura','procuratore','aggiunto','sostituto','repubblica','direzione','distrettuale','antimafia','ufficio','sezione','sez','proc','procedimento','penale','numero','n','rg','rgnr','registro','generale','atti','fascicolo','tribunale','corte','giudice','pm','pubblico','ministero'
	])
	if (LEGAL.has(norm)) return 'safe'
	// Months and days
	const MONTHS = new Set<string>(['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre','lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica'])
	if (MONTHS.has(norm)) return 'safe'
	// Default: flag as suspect (to be reviewed)
	return 'suspect'
}

function ensureAuditStyles() {
	const id = 'audit-token-styles'
	if (document.getElementById(id)) return
	const style = document.createElement('style')
	style.id = id
	style.textContent = `
	.tok-safe{ color:#bdbdbd !important; font-weight:400; }
	.tok-pseudo{ color:#6f6f6f !important; background:rgba(0,0,0,.08); padding:0 .08em; border-radius:.16em; }
	.tok-suspect{ background:#fff2b2; color:#111 !important; font-weight:600; border-radius:.16em; }
	`
	document.head.appendChild(style)
}

function ensureNativeSelectStyles() {
    const id = 'native-select-tweaks'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
    /* Attivo solo quando ON */
    .ai-native-select .rpv-core__page-layer,
    .ai-native-select .rpv-core__canvas-layer,
    .ai-native-select .rpv-core__annotation-layer,
    .ai-native-select canvas {
      pointer-events: none !important;
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .ai-native-select .rpv-core__text-layer {
      pointer-events: auto !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      cursor: text;
      background: transparent;
      /* REMOVED: will-change: contents; */
      /* REMOVED: transform: translateZ(0); */
    }
    .ai-native-select .rpv-core__text-layer * {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    /* Nasconde selezione blu durante drag - mostra solo overlay custom */
    .ai-native-select.is-dragging ::selection {
      background: transparent !important;
      color: inherit !important;
    }
    /* Evita flicker blu fuori dalla text-layer */
    .ai-native-select ::selection { background: rgba(147,197,253,.35); }
    `
    document.head.appendChild(style)
    try { console.log('[NATIVE][css][inject]', { id, appended: true }) } catch {}
}

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
	const pdfDocRef = useRef<any>(null)
	
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
	
	// ✅ Estrai stato dal hook
	const viewerState = usePdfViewerState()
	const { contextMenu, setContextMenu, lastSelection, setLastSelection, extractPos, setExtractPos, extractPage, setExtractPage, extractOpen, setExtractOpen, ocrInspectOpen, setOcrInspectOpen, pageElsRef } = viewerState
	
	// ✅ Hook per la search logic
	const { matches, setMatches, searchCacheRef, runSearch } = usePdfSearch(docId, fileUrl, pdfDocRef)
	
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
	const [tool, setTool] = useState<Tool>('none')
	
	// ✅ Visual scale reset ora gestito da useCleanPdfZoom hook
	const colorH = '#ffeb3b80'
	const colorU = '#0ea5e9'
	const colorS = '#ef4444'
const [annots, setAnnots] = useState<Annotation[]>([])
const [draft, setDraft] = useState<Annotation | null>(null)
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
const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
const selectRootsRef = useRef<Map<number, HTMLElement>>(new Map())
const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
const [selectMode, setSelectMode] = useState<boolean>(true) // ✅ SEMPRE ATTIVA
const mouseDownPageRef = useRef<number | null>(null)
const mouseDownPosRef = useRef<{ xPct:number; yPct:number } | null>(null)
const [selectKind, setSelectKind] = useState<'NATIVE'|'OCR'>('NATIVE')
const [selectTick, setSelectTick] = useState<number>(0)
const [_selBox, setSelBox] = useState<{ x:number; y:number; w:number; h:number }|null>(null)
	const [extractType, setExtractType] = useState<string>('verbale')
const [extractNotes, setExtractNotes] = useState<string>('')
const [showNotes, setShowNotes] = useState<boolean>(false)
const [extractTitle, setExtractTitle] = useState<string>('')
const drawingRef = useRef<{ page:number; startX:number; startY:number; x:number; y:number }|null>(null)
const openedAtRef = useRef<number>(0)
const selectionHandledRef = useRef<boolean>(false)
const isSelectingRef = useRef<boolean>(false)
const lastNativeRangeRef = useRef<Range | null>(null)
const lastDraftBoxRef = useRef<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } | null>(null)
const suppressClearRef = useRef<boolean>(false)
// Note: no custom anchoring; let the browser handle selection during drag
// Global selection overlay (fallback, robust across pages)
// legacy globals removed (use per-page overlay)

    // Deskew toggle + angles (per-page) loaded da localStorage
    const [autoDeskew, setAutoDeskew] = useState<boolean>(false)
    const [skewAngles, setSkewAngles] = useState<Record<number, number>>({})
    const appliedSkewRef = useRef<Record<number, number>>({})
    useEffect(() => {
        try {
            const keyA = `ocr_skew_${docId || 'current'}`
            const keyB = `skew_angles_${docId || 'current'}`
            const raw = localStorage.getItem(keyA) || localStorage.getItem(keyB) || '{}'
            const parsed = JSON.parse(raw || '{}')
            if (parsed && typeof parsed === 'object') setSkewAngles(parsed)
        } catch { setSkewAngles({}) }
    }, [docId])
    const persistSkew = (next: Record<number, number>) => {
        try {
            const key = `ocr_skew_${docId || 'current'}`
            localStorage.setItem(key, JSON.stringify(next))
        } catch {}
    }
    const estimateSkewForPage = async (pageNum: number): Promise<number> => {
        try {
            const doc = pdfDocRef.current
            if (!doc) return 0
            const page = await doc.getPage(pageNum)
            const base = page.getViewport({ scale: 1 })
            const targetW = 800
            const scale = Math.max(0.2, Math.min(2.5, targetW / Math.max(1, base.width)))
            const vp = page.getViewport({ scale })
            const off = document.createElement('canvas')
            off.width = Math.ceil(vp.width)
            off.height = Math.ceil(vp.height)
            const offCtx = off.getContext('2d')!
            await page.render({ canvasContext: offCtx as any, viewport: vp } as any).promise
            const testAngles: number[] = []
            for (let a = -5; a <= 5; a += 0.5) testAngles.push(Number(a.toFixed(2)))
            let best = 0
            let bestScore = -Infinity
            const tmp = document.createElement('canvas')
            const tmpCtx = tmp.getContext('2d')!
            for (const ang of testAngles) {
                const rad = ang * Math.PI / 180
                const w = off.width, h = off.height
                const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
                const bw = Math.ceil(w * cos + h * sin)
                const bh = Math.ceil(w * sin + h * cos)
                tmp.width = bw; tmp.height = bh
                tmpCtx.save()
                tmpCtx.clearRect(0,0,bw,bh)
                tmpCtx.translate(bw/2, bh/2)
                tmpCtx.rotate(rad)
                tmpCtx.drawImage(off, -w/2, -h/2)
                tmpCtx.restore()
                const data = tmpCtx.getImageData(0,0,bw,bh).data
                // metric: row contrast derivative
                let prev = 0
                let score = 0
                for (let y = 0; y < bh; y += 2) {
                    let row = 0
                    for (let x = 0; x < bw; x += 2) {
                        const idx = (y * bw + x) * 4
                        // simple luma
                        const r = data[idx], g = data[idx+1], b = data[idx+2]
                        row += (r*0.2126 + g*0.7152 + b*0.0722)
                    }
                    if (y > 0) score += Math.abs(row - prev)
                    prev = row
                }
                if (score > bestScore) { bestScore = score; best = ang }
            }
            return best
        } catch { return 0 }
    }
    useEffect(() => {
        const host = hostRef.current
        if (!host) return
        const apply = () => {
            // ✅ Usa data-virtual-index invece di data-page-number
            const pageLayers = Array.from(host.querySelectorAll('[data-virtual-index]')) as HTMLElement[]
            for (const pageLayer of pageLayers) {
                const virtualIdx = parseInt(pageLayer.getAttribute('data-virtual-index') || '0', 10)
                const pn = virtualIdx + 1 // Converti da zero-based a 1-based
                const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
                const canvasEl = pageLayer.querySelector('canvas') as HTMLCanvasElement | null
                const target = canvasLayer || canvasEl || pageLayer
                const angle = autoDeskew ? (skewAngles?.[pn] || 0) : 0
                if (angle && Math.abs(angle) >= 0.5) {
                    target.style.transform = `rotate(${angle}deg)`
                    target.style.transformOrigin = 'center center'
                    ;(target.style as any).willChange = 'transform'
                    const parent = (target.parentElement || pageLayer) as HTMLElement
                    try { parent.style.overflow = 'visible' } catch {}
                    if (appliedSkewRef.current[pn] !== angle) {
                        try { console.log('[DESKEW][apply]', { page: pn, angle }) } catch {}
                        appliedSkewRef.current[pn] = angle
                    }
                } else {
                    target.style.removeProperty('transform')
                    target.style.removeProperty('transform-origin')
                    ;(target.style as any).willChange = ''
                    try { (pageLayer as HTMLElement).style.removeProperty('overflow') } catch {}
                    if (appliedSkewRef.current[pn]) {
                        try { console.log('[DESKEW][clear]', { page: pn }) } catch {}
                        delete appliedSkewRef.current[pn]
                    }
                }
            }
        }
        // expose for external triggers (e.g., onZoom)
        ;(window as any).__deskewApply = apply
        // run once
        apply()
        // throttle re-applies to next frame to avoid layout thrash during zoom
        let queued = false
        const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; apply() }) }
        const mo = new MutationObserver(() => schedule())
        mo.observe(host, { subtree: true, childList: true, attributes: true })
        return () => mo.disconnect()
    }, [autoDeskew, skewAngles, docId])

    // Helper per applicare subito alla pagina corrente, chiamato al click
    const applyImmediateToPage = useCallback((pageNum: number, angle: number) => {
        const host = hostRef.current
        if (!host) return
        // ✅ Usa data-virtual-index (zero-based: page 1 = index 0)
        const zeroBasedIdx = pageNum - 1
        const pageLayer = (host.querySelector(`[data-virtual-index="${zeroBasedIdx}"]`) as HTMLElement) || null
        if (!pageLayer) { try { console.warn('[DESKEW][immediate] pageLayer not found', { pageNum, zeroBasedIdx }) } catch {}; return }
        const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
        const canvasEl = pageLayer.querySelector('canvas') as HTMLCanvasElement | null
        const target = canvasLayer || canvasEl || pageLayer
        if (angle && Math.abs(angle) >= 0.5) {
            target.style.transform = `rotate(${angle}deg)`
            target.style.transformOrigin = 'center center'
            ;(target.style as any).willChange = 'transform'
            ;(pageLayer.style as any).overflow = 'visible'
            try { console.log('[DESKEW][immediate][apply]', { page: pageNum, angle, target: target.className || target.tagName }) } catch {}
        } else {
            target.style.removeProperty('transform')
            target.style.removeProperty('transform-origin')
            ;(target.style as any).willChange = ''
            try { pageLayer.style.removeProperty('overflow') } catch {}
            try { console.log('[DESKEW][immediate][clear]', { page: pageNum }) } catch {}
        }
    }, [])

	// Audit mode (digital text only)
	const [audit, setAudit] = useState<boolean>(false)

	// Search panel state
	const [panelW, setPanelW] = useState<number>(320)
	const [searchQ, setSearchQ] = useState<string>('')
	// matches e searchCacheRef ora gestiti dal hook usePdfSearch
	const resizingRef = useRef<boolean>(false)
	const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
	const [selectedAnnot, setSelectedAnnot] = useState<Annotation | null>(null)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				logger.debug('PDF[getDocument][start]', { fileUrl })
				const loadingTask = (pdfjsLib as any).getDocument({ url: fileUrl, disableWorker: true })
				const doc = await loadingTask.promise
				logger.debug('PDF[getDocument][done]', { pages: doc?.numPages || 0 })
				if (!cancelled) pdfDocRef.current = doc
			} catch {}
		})()
		return () => { cancelled = true }
	}, [fileUrl])

	// Apply/clear audit style on text layers (digital text) and add page dim overlays + canvas filter
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const apply = () => {
			// 1) Text layer (when present): color spans per token class
			const layers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
			if (audit) ensureAuditStyles()
			for (const layer of layers) {
				if (audit) {
					layer.setAttribute('data-audit', 'on')
					layer.style.opacity = '1'
					layer.style.mixBlendMode = 'normal'
					// keep audit visuals; pointer-events handled by native-selection effect
					layer.style.pointerEvents = 'none'
					// classify each span
					const spans = Array.from(layer.querySelectorAll('span')) as HTMLSpanElement[]
					for (const sp of spans) {
						const txt = sp.textContent || ''
						const cls = classifyToken(txt)
						sp.classList.remove('tok-safe','tok-pseudo','tok-suspect')
						sp.classList.add(cls==='safe'?'tok-safe':cls==='pseudo'?'tok-pseudo':'tok-suspect')
					}
				} else {
					layer.removeAttribute('data-audit')
					layer.style.removeProperty('opacity')
					layer.style.removeProperty('mix-blend-mode')
					layer.style.removeProperty('pointer-events')
					const spans = Array.from(layer.querySelectorAll('span')) as HTMLSpanElement[]
					for (const sp of spans) { sp.classList.remove('tok-safe','tok-pseudo','tok-suspect') }
				}
			}
			// 2) Canvas: fade so text layer colors are visible
			const canvases = Array.from(host.querySelectorAll('.rpv-core__page-layer canvas')) as HTMLCanvasElement[]
			for (const cv of canvases) {
				if (audit) { (cv.style as any).opacity = '0.06' } else { cv.style.removeProperty('opacity') }
			}
		}
		apply()
		const mo = new MutationObserver(() => apply())
		mo.observe(host, { subtree: true, childList: true })
		return () => mo.disconnect()
	}, [audit])

    // Ensure native selection works: enable selection on text-layer only (avoid wrapper selection flicker)
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
        ensureNativeSelectStyles()
    if (selectMode && selectKind==='NATIVE') host.classList.add('ai-native-select')
    else host.classList.remove('ai-native-select')
    try { console.log('[NATIVE][enable][toggle-class]', { applied: host.classList.contains('ai-native-select'), selectMode, selectKind }) } catch {}
		const textLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
		const pageLayers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
		try { console.log('[NATIVE][enable] applying mode', { selectMode, selectKind, textLayers: textLayers.length, pageLayers: pageLayers.length }) } catch {}
		for (const tl of textLayers) {
			if (selectMode && selectKind === 'NATIVE') {
				tl.style.pointerEvents = 'auto'
				tl.style.userSelect = 'text'
				;(tl.style as any).webkitUserSelect = 'text'
				try { console.log('[NATIVE][enable] text-layer enabled') } catch {}
			} else {
				tl.style.removeProperty('pointer-events')
				tl.style.removeProperty('user-select')
				;(tl.style as any).webkitUserSelect = ''
			}
		}
		for (const pl of pageLayers) {
			if (selectMode && selectKind === 'NATIVE') {
            // IMPORTANT: non catturare gli eventi sul page-layer, altrimenti la selezione cade nel vuoto
            pl.style.pointerEvents = 'none'
				pl.style.userSelect = 'none'
				;(pl.style as any).webkitUserSelect = 'none'
			} else {
				pl.style.removeProperty('pointer-events')
				pl.style.removeProperty('user-select')
				;(pl.style as any).webkitUserSelect = ''
			}
		}
    return () => { host.classList.remove('ai-native-select') }
	}, [selectMode, selectKind])

	// Track page layers and ensure overlay/select roots
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const ensureRoots = () => {
            let added = 0
				// Primary: holders with data-page-number
				let holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
				// Fallback: if none, infer pages from page-layer order
				if (holders.length === 0) {
					const layers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
					holders = layers.map((layer, idx) => {
						// Try extract absolute page number from nearest attributes
						let pageNum = 0
						const hA = layer.closest('[data-page-number]') as HTMLElement | null
						if (hA) {
							const parsed = parseInt(hA.getAttribute('data-page-number') || '', 10)
							if (Number.isFinite(parsed) && parsed > 0) pageNum = parsed
						}
						if (!pageNum) {
							let p: HTMLElement | null = layer
							for (let i = 0; i < 5 && p; i++) {
								const aria = p.getAttribute('aria-label') || ''
								const m = aria.match(/\bP(?:age|agina)\s+(\d+)/i)
								if (m) { pageNum = parseInt(m[1], 10); break }
								p = p.parentElement as HTMLElement | null
							}
						}
						const fake = document.createElement('div')
						fake.setAttribute('data-page-number', String(pageNum || (idx + 1)))
						Object.defineProperty(fake, 'querySelector', { value: (sel: string) => (sel === '.rpv-core__page-layer' ? layer : null) })
						return fake as any
					})
				}
            for (const holder of holders) {
                const parsed = parseInt(holder.getAttribute('data-page-number') || '', 10)
                if (!Number.isFinite(parsed) || parsed <= 0) continue
                const pageNum = parsed
					const pageLayer = (holder as any).querySelector('.rpv-core__page-layer') as HTMLElement | null
                if (!pageLayer) continue
                pageElsRef.current.set(pageNum, pageLayer)
                elToPageRef.current.set(pageLayer, pageNum)
                const textLayer = (pageLayer.querySelector('.rpv-core__text-layer') as HTMLElement) || pageLayer
                if (!textLayer.style.position) textLayer.style.position = 'relative'
                let over = overlayRootsRef.current.get(pageNum)
                if (!over) {
                    over = document.createElement('div')
                    over.className = 'ai-overlay-root'
                    Object.assign(over.style, { position:'absolute', inset:'0', pointerEvents:'none', zIndex:'100' })
                    textLayer.appendChild(over)
                    overlayRootsRef.current.set(pageNum, over)
                    console.log('[OVERLAY-ROOT][CREATE]', { pageNum, hasOver: !!over })
                    added++
                }
                let sel = selectRootsRef.current.get(pageNum)
                if (!sel) {
                    sel = document.createElement('div')
                    sel.className = 'ai-select-root'
                    if (!pageLayer.style.position) pageLayer.style.position = 'relative'
                    pageLayer.appendChild(sel)
                    selectRootsRef.current.set(pageNum, sel)
                    added++
                }
					Object.assign(sel.style, {
						position:'absolute', inset:'0', zIndex:'2000', userSelect:'none',
					cursor: (selectMode && selectKind==='OCR') ? 'crosshair' : '',
					pointerEvents: (selectMode && selectKind==='OCR') ? 'auto' : 'none',
					touchAction: (selectMode && selectKind==='OCR') ? ('none' as any) : ''
                } as any)
            }
            if (added > 0) setSelectTick(t => t + 1)
        }
            ensureRoots()
				const mo = new MutationObserver(() => ensureRoots())
                mo.observe(host, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class'] })
                // Aggiorna i roots anche su scroll/zoom e su resize
                const onAny = () => ensureRoots()
                // attach to inner scroll containers if present
                const scs = [
                  host.querySelector('.rpv-core__inner') as HTMLElement | null,
                  host.querySelector('.rpv-core__pages') as HTMLElement | null,
                  host.querySelector('.rpv-core__viewer') as HTMLElement | null,
                ].filter(Boolean) as HTMLElement[]
                scs.forEach(sc => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
                window.addEventListener('resize', onAny)
                return () => { mo.disconnect(); scs.forEach(sc => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
	}, [selectMode, selectKind])



// Search logic ora gestita dal hook usePdfSearch

// removed unused snippet renderer

	const goToMatch = async (m: MatchItem) => {
		console.log('[GOTO] start', m)
		setSelectedAnnot(null)
		try { (pageNav as any).jumpToPage?.(m.page - 1); console.log('[GOTO] jumpToPage', m.page - 1) } catch (e) { console.warn('[GOTO] jumpToPage error', e) }
		const waitFor = async (cond: () => HTMLElement | null, ms = 3000) => {
			const start = Date.now()
			return new Promise<HTMLElement | null>((resolve) => {
				const tick = () => {
					const el = cond()
					if (el) return resolve(el)
					if (Date.now() - start > ms) return resolve(null)
					requestAnimationFrame(tick)
				}
				tick()
			})
		}
		const viewer = hostRef.current
		if (!viewer) { console.warn('[GOTO] host missing'); return }
		const pageEl = await waitFor(() => (viewer.querySelectorAll('.rpv-core__page-layer')?.[m.page-1] as HTMLElement) || null)
		if (!pageEl) { console.warn('[GOTO] page el missing'); return }
		// ensure text-layer too
		const textLayer = await waitFor(() => (pageEl.querySelector('.rpv-core__text-layer') as HTMLElement) || pageEl)
		if (!textLayer) { console.warn('[GOTO] text layer missing'); return }
		// one extra RAF to let layout settle
		await new Promise(r => requestAnimationFrame(() => r(null as any)))
        // Container scroll deterministico
        const sc = viewer.querySelector('.rpv-core__viewer') as HTMLElement | null
        if (!sc) { console.warn('[GOTO] .rpv-core__viewer missing'); return }
		const pr0 = pageEl.getBoundingClientRect(); const scr0 = sc.getBoundingClientRect()
		const pageTop = sc.scrollTop + (pr0.top - scr0.top) - 20
		console.log('[GOTO] preScroll pageTop', { pageTop, pr0Top: pr0.top, scr0Top: scr0.top })
		sc.scrollTo({ top: Math.max(0, pageTop), behavior: 'auto' })
		const pr = pageEl.getBoundingClientRect()
		const scr = sc.getBoundingClientRect()
		const yAbs = pr.top + (m.y0Pct ?? 0) * pr.height
		const yAbsBottom = pr.top + (m.y1Pct ?? 0) * pr.height
		const xAbs = pr.left + (m.x0Pct ?? 0) * pr.width
		const xAbsRight = pr.left + (m.x1Pct ?? 0) * pr.width
		let newTop = sc.scrollTop
		let newLeft = sc.scrollLeft
		if (yAbs < scr.top + 24 || yAbsBottom > scr.bottom - 24) {
			const desiredTop = sc.scrollTop + (yAbs - scr.top) - Math.floor(sc.clientHeight * 0.3)
			newTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, desiredTop))
		}
		if (xAbs < scr.left + 24 || xAbsRight > scr.right - 24) {
			const desiredLeft = sc.scrollLeft + (xAbs - scr.left) - Math.floor(sc.clientWidth * 0.4)
			newLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, desiredLeft))
		}
		console.log('[GOTO] scrollTo', { top: newTop, left: newLeft })
		sc.scrollTo({ top: newTop, left: newLeft, behavior: 'smooth' })

		// Disegna il bbox ricevuto (diagnostica) e prova a raffinarlo alla parola usando le highlight native
		try {
			const x0Pct = Math.max(0, Math.min(1, m.x0Pct ?? 0))
			const y0Pct = Math.max(0, Math.min(1, m.y0Pct ?? 0))
			const x1Pct = Math.max(0, Math.min(1, m.x1Pct ?? 1))
			const y1Pct = Math.max(0, Math.min(1, m.y1Pct ?? 1))
			console.log('[GOTO][bbox-in]', { page: m.page, x0Pct, y0Pct, x1Pct, y1Pct, prW: pr.width, prH: pr.height })
			// drawOcrRects([{ page: m.page, x0Pct, y0Pct, x1Pct, y1Pct }], 'rgba(59,130,246,1)') // Ora gestito dal componente OcrInspector
			// Trova highlight native nella pagina corrente
			const nodes = Array.from(document.querySelectorAll('.rpv-search__highlight')) as HTMLElement[]
			const onPage = nodes
				.map((n) => ({ el: n, r: n.getBoundingClientRect() }))
				.filter(({ r }) => r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right)
			console.log('[GOTO][hi][count]', { total: nodes.length, onPage: onPage.length })
			if (onPage.length) {
				const cx = pr.left + ((x0Pct + x1Pct) / 2) * pr.width
				const cy = pr.top + ((y0Pct + y1Pct) / 2) * pr.height
				let best = onPage[0]
				let bestD = Infinity
				for (const h of onPage) {
					const hx = (h.r.left + h.r.right) / 2
					const hy = (h.r.top + h.r.bottom) / 2
					const d = Math.hypot(hx - cx, hy - cy)
					if (d < bestD) { best = h; bestD = d }
				}
				const hr = best.r
				const nx0 = Math.max(0, (hr.left - pr.left) / pr.width)
				const ny0 = Math.max(0, (hr.top - pr.top) / pr.height)
				const nx1 = Math.min(1, (hr.right - pr.left) / pr.width)
				const ny1 = Math.min(1, (hr.bottom - pr.top) / pr.height)
				console.log('[GOTO][hi][nearest]', { page: m.page, nx0, ny0, nx1, ny1, bestD })
				// drawOcrRects([{ page: m.page, x0Pct: nx0, y0Pct: ny0, x1Pct: nx1, y1Pct: ny1 }], 'rgba(16,185,129,1)') // Ora gestito dal componente OcrInspector
			}
		} catch (e) { console.warn('[GOTO][bbox-refine][err]', e) }
		let root = overlayRootsRef.current.get(m.page)
		if (!root) {
			root = document.createElement('div')
			root.className = 'ai-overlay-root'
			Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10' })
			if (!textLayer.style.position || textLayer.style.position === '') textLayer.style.position = 'relative'
			textLayer.appendChild(root)
			overlayRootsRef.current.set(m.page, root)
		}
		setSelectedAnnot({ id: 'sel', page: m.page, type: 'highlight', color: '#fbbf2480', x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct })
	}

	// Pointer drawing handlers with live draft
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const onDown = (ev: PointerEvent) => {
			if (tool === 'none') return
			const target = (ev.target as HTMLElement).closest('.rpv-core__page-layer') as HTMLElement | null
			if (!target) return
			const pageNum = elToPageRef.current.get(target) || 0
			if (pageNum <= 0) return
			mouseDownPageRef.current = pageNum
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
			mouseDownPosRef.current = { xPct: x, yPct: y }
			if (tool === 'comment') {
				const text = prompt('Commento:') || ''
				if (text) setAnnots(a => [...a, { id: cryptoRandom(), page: pageNum, type: 'comment', color: '#f59e0b', x0Pct: x, y0Pct: y, x1Pct: x, y1Pct: y, text }])
				return
			}
			drawingRef.current = { page: pageNum, startX: x, startY: y, x, y }
			setDraft(null)
			;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
		}
		const onMove = (ev: PointerEvent) => {
			if (!drawingRef.current) return
			const target = pageElsRef.current.get(drawingRef.current.page)
			if (!target) return
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
			drawingRef.current.x = x
			drawingRef.current.y = y
			const d = drawingRef.current
			const x0 = Math.min(d.startX, d.x)
			const x1 = Math.max(d.startX, d.x)
			const y0 = Math.min(d.startY, d.y)
			const y1 = Math.max(d.startY, d.y)
			if (tool === 'highlight') setDraft({ id: 'draft', page: d.page, type: 'highlight', color: colorH, x0Pct: x0, y0Pct: y0, x1Pct: x1, y1Pct: y1 })
			if (tool === 'underline') setDraft({ id: 'draft', page: d.page, type: 'underline', color: colorU, x0Pct: x0, y0Pct: y1, x1Pct: x1, y1Pct: y1 })
			if (tool === 'strike') setDraft({ id: 'draft', page: d.page, type: 'strike', color: colorS, x0Pct: x0, y0Pct: (y0 + y1) / 2, x1Pct: x1, y1Pct: (y0 + y1) / 2 })
		}
		const onUp = () => {
			const d = drawingRef.current
			if (!d) return
			drawingRef.current = null
			if (draft) { setAnnots(a => [...a, { ...draft, id: cryptoRandom() }]); setDraft(null) }
		}
		host.addEventListener('pointerdown', onDown)
		document.addEventListener('pointermove', onMove)
		document.addEventListener('pointerup', onUp)
		return () => {
			host.removeEventListener('pointerdown', onDown)
			document.removeEventListener('pointermove', onMove)
			document.removeEventListener('pointerup', onUp)
		}
	}, [tool])

	// Resizer events
	useEffect(() => {
		const onMove = (e: MouseEvent) => { if (!resizingRef.current) return; setPanelW(w => Math.max(220, Math.min(560, w - e.movementX))) }
		const onUp = () => { resizingRef.current = false; document.body.style.cursor = '' }
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
		return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
	}, [])

	// Native selection capture (digital text)
	useEffect(() => {
		if (!(selectMode && selectKind === 'NATIVE')) return
		const host = hostRef.current
		if (!host) return
		let timer: number | null = null
		const handleSelection = async () => {
			try {
				if (selectionHandledRef.current) { try { console.log('[NATIVE][guard] already handled') } catch {}; return }
				const sel = window.getSelection()
				let raw = String(sel || '')
				console.log('[NATIVE][sel][CRITICAL]', { 
					hasSel: !!sel, 
					rangeCount: sel?.rangeCount,
					rawText: raw,
					rawLength: raw.length,
					isEmpty: !raw.trim(),
					extractOpen: extractOpen // ✅ DEBUG: controlla se il form è aperto
				})
				if (!sel || sel.rangeCount === 0) { 
					console.warn('[NATIVE][sel] no selection or rangeCount=0')
					return 
				}
				if (!raw || !raw.trim()) { 
					// ✅ FIX: Se la selezione esiste ma è vuota, ripristina dal range salvato
					if (lastNativeRangeRef.current && extractOpen) {
						console.log('[NATIVE][sel][RESTORE] Ripristinando selezione dal range salvato')
						try {
							sel.removeAllRanges()
							sel.addRange(lastNativeRangeRef.current)
							const restoredText = sel.toString()
							console.log('[NATIVE][sel][RESTORED]', { restoredText: restoredText.substring(0, 80) })
							// Aggiorna raw con il testo ripristinato
							raw = restoredText
							if (raw && raw.trim()) {
								console.log('[NATIVE][sel][SUCCESS] Selezione ripristinata con successo')
								// Continua con la logica normale usando il testo ripristinato
							} else {
								console.warn('[NATIVE][sel][FAIL] Impossibile ripristinare la selezione')
								return
							}
						} catch (e) {
							console.error('[NATIVE][sel][RESTORE-ERROR]', e)
							return
						}
					} else {
						console.warn('[NATIVE][sel] empty text - selection exists but no text captured')
						return 
					}
				}
                const range = sel.getRangeAt(0)
                lastNativeRangeRef.current = range.cloneRange()
				const rects = Array.from(range.getClientRects()) as DOMRect[]
				try { console.log('[NATIVE][sel] rects', rects.length, rects[0]) } catch {}
				if (!rects.length) { try { console.warn('[NATIVE][sel] no rects') } catch {}; return }
				// Individua la pagina usando la mappa pageElsRef (più affidabile di data-page-number)
				let pageEntries = Array.from(pageElsRef.current.entries()) as Array<[number, HTMLElement]>
				if (pageEntries.length === 0) {
					// Fallback A: holders dentro host
					const holdersA = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
					const pairsA: Array<[number, HTMLElement]> = []
					for (const h of holdersA) {
						const pn = parseInt(h.getAttribute('data-page-number') || '', 10)
						const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
						if (Number.isFinite(pn) && pn > 0 && layer) pairsA.push([pn, layer])
					}
					pageEntries = pairsA
					try { console.warn('[NATIVE][page] pageElsRef empty, fallback holders(host)', { count: pageEntries.length, pages: pageEntries.map(p=>p[0]) }) } catch {}
				}
				if (pageEntries.length === 0) {
					// Fallback B: holders globali nel documento (alcuni layout wrappano)
					const holdersB = Array.from(document.querySelectorAll('[data-page-number]')) as HTMLElement[]
					const pairsB: Array<[number, HTMLElement]> = []
					for (const h of holdersB) {
						const pn = parseInt(h.getAttribute('data-page-number') || '', 10)
						const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
						if (Number.isFinite(pn) && pn > 0 && layer) pairsB.push([pn, layer])
					}
					pageEntries = pairsB
					try { console.warn('[NATIVE][page] fallback holders(document)', { count: pageEntries.length, pages: pageEntries.map(p=>p[0]) }) } catch {}
				}
				if (pageEntries.length === 0) {
					// Fallback C: ordina semplicemente i layer per DOM order (meno preciso, ma non blocca il flow)
					const layers = Array.from((document || host).querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
					pageEntries = layers.map((el, idx) => [idx + 1, el]) as Array<[number, HTMLElement]>
					try { console.warn('[NATIVE][page] fallback layers(order)', { count: pageEntries.length }) } catch {}
				}
				const cx = (rects[0].left + rects[0].right) / 2
				const cy = (rects[0].top + rects[0].bottom) / 2
				let best: { page: number; el: HTMLElement; score: number } | null = null
				for (const [pn, el] of pageEntries) {
					const r = el.getBoundingClientRect()
					const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
					let score = inside ? 1 : 0
					if (!inside) {
						// usa overlap area come score
						const l = Math.max(r.left, rects[0].left), t = Math.max(r.top, rects[0].top)
						const rr = Math.min(r.right, rects[0].right), bb = Math.min(r.bottom, rects[0].bottom)
						const w = Math.max(0, rr - l), h = Math.max(0, bb - t)
						score = w * h
					}
					if (!best || score > best.score) best = { page: pn, el, score }
				}
				if (!best) { try { console.warn('[NATIVE][page] no pages in map') } catch {}; return }
                const pageNum = mouseDownPageRef.current || best.page
				const pageLayer = best.el
                try { console.log('[NATIVE][page] chosen', { pageNum, from: mouseDownPageRef.current ? 'mousedown' : 'best-overlap' }) } catch {}
				const pr = pageLayer.getBoundingClientRect()
				// unisci i rects che cadono in questa pagina
				const pageRects = rects.filter(rc => !(rc.right < pr.left || rc.left > pr.right || rc.bottom < pr.top || rc.top > pr.bottom))
				if (!pageRects.length) { try { console.warn('[NATIVE][bbox] no rects in page') } catch {}; return }
				// bbox normalizzato al layer pagina
				let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
				for (const rc of pageRects) { l = Math.min(l, rc.left); t = Math.min(t, rc.top); r = Math.max(r, rc.right); b = Math.max(b, rc.bottom) }
				const viewportBox = { x: l - pr.left, y: t - pr.top, w: Math.max(1, r - l), h: Math.max(1, b - t) }
				try { console.log('[NATIVE][bbox] viewportBox', viewportBox, 'pageNum', pageNum) } catch {}
				// posizione pannello
				const panelW = 460, panelH = 260
				let px = pr.left + viewportBox.x + (viewportBox.w - panelW) / 2
				let py = pr.top + viewportBox.y + (viewportBox.h - panelH) / 2
				px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
				py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
				setExtractPos({ x: px, y: py })
				setExtractPage(pageNum)
				const text = raw
				console.log('[NATIVE][TEXT][EXTRACTED]', { 
					textLength: text.length, 
					textPreview: text.substring(0, 100),
					pageNum,
					viewportBox
				})
				// mappa a pdf box se possibile
				try {
					if (pdfDocRef.current) {
						const page = await pdfDocRef.current.getPage(pageNum)
						const base = page.getViewport({ scale: 1 })
						const domW = pr.width
						const scale = Math.max(0.1, domW / base.width)
						const vp = page.getViewport({ scale })
						const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
						const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
						try { console.log('[NATIVE][pdfbox]', { x0, y0, x1, y1, scale, domW, baseW: base.width }) } catch {}
						const selection = { pdfPageNumber: pageNum, bboxPdf: { x0, y0, x1, y1 }, viewportBox, text }
						console.log('[NATIVE][LAST-SELECTION][SET]', { hasText: !!selection.text, textLen: selection.text?.length })
						setLastSelection(selection)
					} else {
						const selection = { pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text }
						console.log('[NATIVE][LAST-SELECTION][SET]', { hasText: !!selection.text, textLen: selection.text?.length })
						setLastSelection(selection)
					}
				} catch (e) {
					try { console.warn('[NATIVE][pdfbox][err]', e) } catch {}
					setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
				}
                try { console.log('[NATIVE][OPEN] form', { pageNum, textLen: text.length }) } catch {}
                // Use viewer highlight plugin for persistent visual instead of native selection
                try {
                  (highlight as any).jumpToHighlight?.(0)
                  const createArea = (highlight as any).createAreaHighlight
                  if (createArea) {
                    const x0 = viewportBox.x / pr.width
                    const y0 = viewportBox.y / pr.height
                    const x1 = (viewportBox.x + viewportBox.w) / pr.width
                    const y1 = (viewportBox.y + viewportBox.h) / pr.height
                    createArea(pageNum - 1, { left: x0, top: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }, { color: 'rgba(99,102,241,0.35)' })
                  }
                } catch {}
                selectionHandledRef.current = true
                setExtractOpen(true)
                try {
                  // Save start/end range in metadata refs for later save
                  const start = mouseDownPageRef.current || pageNum
                  const startPos = mouseDownPosRef.current || { xPct: viewportBox.x / pr.width, yPct: viewportBox.y / pr.height }
                  const end = pageNum
                  const endPos = { xPct: (viewportBox.x + viewportBox.w) / pr.width, yPct: (viewportBox.y + viewportBox.h) / pr.height }
                  ;(lastSelection as any).range = { startPage: start, endPage: end, startPos, endPos }
                  console.log('[EXTRACT][RANGE]', (lastSelection as any).range)
                                                } catch {}
                finally { mouseDownPageRef.current = null; mouseDownPosRef.current = null }
			} catch {}
		}
        const onMouseDown = (ev: MouseEvent) => {
			const hostR = host.getBoundingClientRect()
			if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
			if (extractOpen) { try { console.log('[NATIVE][mdown] ignored: extractOpen') } catch {}; return }
			isSelectingRef.current = true
			selectionHandledRef.current = false
			host.classList.add('is-dragging') // Add is-dragging class
			console.log('[DRAG][START]', { 
				hasDraggingClass: host.classList.contains('is-dragging'),
				hasNativeClass: host.classList.contains('ai-native-select')
			})
			try {
				const x = ev.clientX
				const y = ev.clientY
				let pn = 0
				// Prefer precise hit-test over DOM ancestry
				const holders = Array.from((host.querySelectorAll('[data-page-number]') as NodeListOf<HTMLElement>))
				try { console.log('[NATIVE][mdown][holders@host]', { count: holders.length, pages: holders.map(h=>h.getAttribute('data-page-number')) }) } catch {}
				for (const h of holders) {
					const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
					if (!layer) continue
					const r = layer.getBoundingClientRect()
					const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
					if (inside) { const parsed = parseInt(h.getAttribute('data-page-number') || '', 10); if (Number.isFinite(parsed) && parsed > 0) { pn = parsed; break } }
				}
				if (!pn) {
					// fallback to closest
					const t = ev.target as HTMLElement
					const pageLayer = t.closest('.rpv-core__page-layer') as HTMLElement | null
					if (pageLayer) pn = elToPageRef.current.get(pageLayer) || 0
				}
				if (!pn) {
					const holdersDoc = Array.from((document.querySelectorAll('[data-page-number]') as NodeListOf<HTMLElement>))
					try { console.log('[NATIVE][mdown][holders@doc]', { count: holdersDoc.length, pages: holdersDoc.map(h=>h.getAttribute('data-page-number')) }) } catch {}
					for (const h of holdersDoc) {
						const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
						if (!layer) continue
						const r = layer.getBoundingClientRect()
						const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
						if (inside) { const parsed = parseInt(h.getAttribute('data-page-number') || '', 10); if (Number.isFinite(parsed) && parsed > 0) { pn = parsed; break } }
					}
				}
				if (pn > 0) mouseDownPageRef.current = pn
                // seed a zero-area draft to keep visual highlight persistent from the first pixel
                try {
                    const layer = pageElsRef.current.get(mouseDownPageRef.current || 0)
                    if (layer) {
                        const r = layer.getBoundingClientRect()
                        const ax = (x - r.left) / r.width
                        const ay = (y - r.top) / r.height
                        mouseDownPosRef.current = { xPct: ax, yPct: ay }
                                                    }
                                                } catch {}
                                        } catch {}
			try { console.log('[NATIVE][event] mousedown start selecting', { mouseDownPage: mouseDownPageRef.current }) } catch {}
            // Non sopprimere più il ::selection: lasciamo la selezione nativa visibile e non tocchiamo gli span
		}
		const onMouseUp = async (ev: MouseEvent) => {
			// ignora click su UI esterne
			const hostR = host.getBoundingClientRect()
			if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
			if (extractOpen) { try { console.log('[NATIVE][mouseup] ignored: extractOpen') } catch {}; return }
			if (timer) window.clearTimeout(timer)
			
			console.log('[NATIVE][event] mouseup within viewer', { x: ev.clientX, y: ev.clientY, wasSelecting: isSelectingRef.current })
			
			isSelectingRef.current = false
			host.classList.remove('is-dragging')
			
			// ✅ NUOVA LOGICA: Usa le coordinate del draft box invece di window.getSelection()
			const draftBox = lastDraftBoxRef.current
			console.log('[DRAG][END]', { 
				hasDraftBox: !!draftBox,
				draftBox
			})
			
			if (!draftBox) {
				console.warn('[DRAG][END] No draft box saved, skipping extraction')
				try { setDraft(null) } catch {}
				return
			}
			
			try {
				const pageNum = draftBox.page
				const pageLayer = pageElsRef.current.get(pageNum)
				
				if (!pageLayer) {
					console.warn('[DRAG][END] No page layer found for page', pageNum)
					try { setDraft(null) } catch {}
					return
				}
				
				const textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
				if (!textLayer) {
					console.warn('[DRAG][END] No text layer found for page', pageNum)
					try { setDraft(null) } catch {}
					return
				}
				
				const pr = pageLayer.getBoundingClientRect()
				
				// Converti percentuali in coordinate pixel
				const viewportBox = {
					x: draftBox.x0Pct * pr.width,
					y: draftBox.y0Pct * pr.height,
					w: (draftBox.x1Pct - draftBox.x0Pct) * pr.width,
					h: (draftBox.y1Pct - draftBox.y0Pct) * pr.height
				}
				
				console.log('[DRAG][EXTRACT][START]', { pageNum, viewportBox, draftBox })
				
				// Estrai il testo usando le coordinate del rettangolo
				const { text } = await getSelectedTextInRect(textLayer, viewportBox)
				
				console.log('[DRAG][EXTRACT][TEXT]', { 
					textLength: text.length, 
					textPreview: text.substring(0, 100)
				})
				
				// ✅ NUOVO: Crea selezione nativa programmaticamente dalle coordinate del rettangolo
				try {
					const textLayerRect = textLayer.getBoundingClientRect()
					const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
					
					const spansInBox: HTMLElement[] = []
					for (const span of spans) {
						const r = span.getBoundingClientRect()
						const yTop = r.top - textLayerRect.top
						const yBot = r.bottom - textLayerRect.top
						const xLeft = r.left - textLayerRect.left
						const xRight = r.right - textLayerRect.left
						
						// Controlla se lo span interseca il rettangolo
						const overlap = !(xRight < viewportBox.x || xLeft > (viewportBox.x + viewportBox.w) || 
										 yBot < viewportBox.y || yTop > (viewportBox.y + viewportBox.h))
						
						if (overlap) spansInBox.push(span)
					}
					
					console.log('[NATIVE-SEL][CREATE]', { 
						spansFound: spansInBox.length,
						boxCoords: viewportBox
					})
					
					if (spansInBox.length > 0) {
						// Ordina gli span per posizione (top -> bottom, left -> right)
						spansInBox.sort((a, b) => {
							const ra = a.getBoundingClientRect()
							const rb = b.getBoundingClientRect()
							const diffY = (ra.top - textLayerRect.top) - (rb.top - textLayerRect.top)
							if (Math.abs(diffY) > 5) return diffY // Diversa riga
							return (ra.left - textLayerRect.left) - (rb.left - textLayerRect.left) // Stessa riga, ordina per x
						})
						
						// Crea Range dal primo all'ultimo span
						const range = document.createRange()
						const firstSpan = spansInBox[0]
						const lastSpan = spansInBox[spansInBox.length - 1]
						
						// Seleziona dall'inizio del primo span alla fine dell'ultimo
						const firstNode = firstSpan.firstChild || firstSpan
						const lastNode = lastSpan.lastChild || lastSpan
						
						range.setStart(firstNode, 0)
						range.setEnd(lastNode, lastNode.textContent?.length || 0)
						
						// Applica la selezione
						const sel = window.getSelection()
						if (sel) {
							sel.removeAllRanges()
							sel.addRange(range)
							console.log('[NATIVE-SEL][APPLIED]', { 
								selectedText: sel.toString().substring(0, 80),
								rangeText: range.toString().substring(0, 80)
							})
						}
					} else {
						console.warn('[NATIVE-SEL] No spans found in box')
					}
				} catch (err) {
					console.error('[NATIVE-SEL][ERROR]', err)
				}
				
				// Calcola posizione pannello
				const panelW = 460, panelH = 260
				let px = pr.left + viewportBox.x + (viewportBox.w - panelW) / 2
				let py = pr.top + viewportBox.y + (viewportBox.h - panelH) / 2
				px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
				py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
				
				setExtractPos({ x: px, y: py })
				setExtractPage(pageNum)
				
				// Calcola PDF coordinates
				try {
					if (pdfDocRef.current) {
						const page = await pdfDocRef.current.getPage(pageNum)
						const base = page.getViewport({ scale: 1 })
						const domW = pr.width
						const scale = Math.max(0.1, domW / base.width)
						const vp = page.getViewport({ scale })
						const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
						const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
						
						const selection = { 
							pdfPageNumber: pageNum, 
							bboxPdf: { x0, y0, x1, y1 }, 
							viewportBox, 
							text 
						}
						
						console.log('[DRAG][EXTRACT][SET-SELECTION]', { hasText: !!text, textLen: text.length })
						setLastSelection(selection)
					} else {
						setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
					}
				} catch (e) {
					console.warn('[DRAG][EXTRACT][pdfbox][err]', e)
					setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
				}
				
				// Apri il context menu invece del dialog
				selectionHandledRef.current = true
				setContextMenu({ x: ev.clientX, y: ev.clientY, visible: true })
				
			} catch (error) {
				console.error('[DRAG][EXTRACT][ERROR]', error)
			} finally {
				// ✅ NATIVE: rimuovi il rettangolo (c'è la selezione nativa del browser)
				try { setDraft(null) } catch {}
				console.log('[DRAG][EXTRACT][NATIVE] Rimosso rettangolo, mantenendo selezione nativa')
				
				// Pulisci sempre i refs
				lastDraftBoxRef.current = null
				mouseDownPageRef.current = null
				mouseDownPosRef.current = null
			}
		}
		const onSelChange = () => {
			if (timer) window.clearTimeout(timer)
			// ignora gli update mentre si trascina, apri solo su mouseup
            if (!isSelectingRef.current) {
				try { console.log('[NATIVE][event] selectionchange (idle)') } catch {}
				timer = window.setTimeout(handleSelection, 30)
			} else {
				try { console.log('[NATIVE][event] selectionchange (drag)') } catch {}
                // Ignore while dragging to avoid flicker; we'll handle on mouseup
			}
		}

		// During drag across lines, show a stable draft box so the native selection disappearing doesn't cause flicker
		const onDragMove = (ev: MouseEvent) => {
			if (!isSelectingRef.current || !mouseDownPageRef.current || !mouseDownPosRef.current) {
				// console.log('[DRAG][MOVE][SKIP]', { isSelecting: isSelectingRef.current, page: mouseDownPageRef.current, hasPos: !!mouseDownPosRef.current })
				return
			}
			
			try {
				const layer = pageElsRef.current.get(mouseDownPageRef.current)
				if (!layer) {
					console.warn('[DRAG][MOVE][NO-LAYER]', { page: mouseDownPageRef.current })
					return
				}
				
				const r = layer.getBoundingClientRect()
				const x = Math.max(0, Math.min((ev.clientX - r.left) / r.width, 1))
				const y = Math.max(0, Math.min((ev.clientY - r.top) / r.height, 1))
				
				const draftBox = {
					id: 'draft', 
					page: mouseDownPageRef.current, 
					type: 'highlight' as const,
					color: 'rgba(59,130,246,0.3)',
					x0Pct: Math.min(mouseDownPosRef.current.xPct, x),
					y0Pct: Math.min(mouseDownPosRef.current.yPct, y),
					x1Pct: Math.max(mouseDownPosRef.current.xPct, x),
					y1Pct: Math.max(mouseDownPosRef.current.yPct, y)
				}
				
				// ✅ NUOVO: Se copre più righe, estendi fino alla fine del testo (non fino al bordo pagina)
				const boxHeightPx = (draftBox.y1Pct - draftBox.y0Pct) * r.height
				const typicalLineHeight = 20 // pixel (altezza tipica di una riga)
				const isMultiLine = boxHeightPx > (typicalLineHeight * 1.5)
				
				if (isMultiLine) {
					// Trova gli span nelle righe coperte per calcolare bounds reali del testo
					try {
						const textLayer = layer.querySelector('.rpv-core__text-layer') as HTMLElement | null
						if (textLayer) {
							const textLayerRect = textLayer.getBoundingClientRect()
							const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
							
							let minX = Infinity
							let maxX = -Infinity
							
							const y0Px = draftBox.y0Pct * r.height
							const y1Px = draftBox.y1Pct * r.height
							
							for (const span of spans) {
								const spanRect = span.getBoundingClientRect()
								const spanY = spanRect.top - textLayerRect.top
								
								// Controlla se lo span è nelle righe coperte (solo Y, ignora X)
								const inYRange = spanY >= (y0Px - 5) && spanY <= (y1Px + 5)
								
								if (inYRange && span.textContent?.trim()) {
									const spanLeft = spanRect.left - textLayerRect.left
									const spanRight = spanRect.right - textLayerRect.left
									minX = Math.min(minX, spanLeft)
									maxX = Math.max(maxX, spanRight)
								}
							}
							
							// Se abbiamo trovato span, usa i loro bounds
							if (minX !== Infinity && maxX !== -Infinity) {
								draftBox.x0Pct = Math.max(0, minX / r.width)
								draftBox.x1Pct = Math.min(1, maxX / r.width)
								console.log('[DRAG][MULTI-LINE] Extended to text bounds', { 
									minX: minX.toFixed(1), 
									maxX: maxX.toFixed(1), 
									x0Pct: draftBox.x0Pct.toFixed(3), 
									x1Pct: draftBox.x1Pct.toFixed(3) 
								})
							} else {
								// Fallback: estendi a tutta la larghezza
								draftBox.x0Pct = 0
								draftBox.x1Pct = 1
								console.log('[DRAG][MULTI-LINE] No spans found, using full width')
							}
						}
					} catch (err) {
						console.error('[DRAG][MULTI-LINE] Error finding text bounds', err)
						// Fallback: estendi a tutta la larghezza
						draftBox.x0Pct = 0
						draftBox.x1Pct = 1
					}
				}
				
				console.log('[DRAG][MOVE][SET-DRAFT]', {
					page: draftBox.page,
					box: { x0: draftBox.x0Pct.toFixed(3), y0: draftBox.y0Pct.toFixed(3), x1: draftBox.x1Pct.toFixed(3), y1: draftBox.y1Pct.toFixed(3) },
					hasRoot: !!overlayRootsRef.current.get(draftBox.page),
					boxHeightPx: boxHeightPx.toFixed(1),
					isMultiLine
				})
				
				// Salva le coordinate del draft per l'estrazione testo
				lastDraftBoxRef.current = {
					page: draftBox.page,
					x0Pct: draftBox.x0Pct,
					y0Pct: draftBox.y0Pct,
					x1Pct: draftBox.x1Pct,
					y1Pct: draftBox.y1Pct
				}
				
				// Mostra box stabile durante drag
				setDraft(draftBox)
			} catch (err) {
				console.error('[DRAG][MOVE][ERROR]', err)
			}
		}
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { try { const s = window.getSelection(); s && s.removeAllRanges() } catch {}; setSelectMode(false) } }
		document.addEventListener('mousedown', onMouseDown, true)
		document.addEventListener('mouseup', onMouseUp, true)
		document.addEventListener('selectionchange', onSelChange, true)
        document.addEventListener('mousemove', onDragMove, true)
		document.addEventListener('keydown', onKey, true)
		try { console.log('[NATIVE][bind] listeners attached') } catch {}
        return () => { if (timer) window.clearTimeout(timer); document.removeEventListener('mousedown', onMouseDown, true); document.removeEventListener('mouseup', onMouseUp, true); document.removeEventListener('selectionchange', onSelChange, true); document.removeEventListener('mousemove', onDragMove, true); document.removeEventListener('keydown', onKey, true) }
	}, [selectMode, selectKind, extractOpen, setDraft])

	useEffect(() => {
		const handler = async (ev: any) => {
			const detail = ev?.detail || {}
			// Jump-to handler from outside (drawer/tmpdoc). Scroll to box if provided and add area highlight.
			if (!detail || (detail.docId && detail.docId !== (docId || 'current'))) { console.log('[GOTO][event] skip other doc'); return }
			try {
				const m = detail.match || {}
				if (typeof m.page === 'number') {
					try { console.log('[GOTO-MATCH][recv]', m); } catch {}
					try { (pageNav as any).jumpToPage?.(Math.max(0, m.page - 1)) } catch {}
				}
				// If we have a viewport box (normalized), scroll precisely to it and draw highlight
				if (m && m.x0Pct != null && m.y0Pct != null && m.x1Pct != null && m.y1Pct != null) {
					const waitFor = async (cond: () => HTMLElement | null, ms = 1200) => {
				const start = Date.now()
						return new Promise<HTMLElement | null>((resolve) => {
				const tick = () => {
								const el = cond()
								if (el) return resolve(el)
					if (Date.now() - start > ms) return resolve(null)
					requestAnimationFrame(tick)
				}
				tick()
			})
					}
					const viewer = hostRef.current
					if (viewer) {
						const pageEl = await waitFor(() => (viewer.querySelectorAll('.rpv-core__page-layer')?.[Math.max(0,(m.page||1)-1)] as HTMLElement) || null)
                        if (pageEl) {
							const pr = pageEl.getBoundingClientRect()
							const scCandidates = [ viewer.querySelector('.rpv-core__inner') as HTMLElement | null, viewer.querySelector('.rpv-core__pages') as HTMLElement | null, viewer.querySelector('.rpv-core__viewer') as HTMLElement | null, viewer as HTMLElement ]
							const sc = scCandidates.find(el => el && el.scrollHeight > (el.clientHeight + 10)) || null
							if (sc) {
								const topPx = pr.top + (m.y0Pct * pr.height)
								const targetTop = sc.scrollTop + (topPx - sc.getBoundingClientRect().top) - 24
								sc.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
							}
                            // draw area via native highlight plugin (renderHighlights)
                            try {
                              const pageIndex = Math.max(0, (m.page || 1) - 1)
                              const left = m.x0Pct, top = m.y0Pct, width = Math.max(0, m.x1Pct - m.x0Pct), height = Math.max(0, m.y1Pct - m.y0Pct)
                              setAreas(prev => { const next = prev.filter(a => a.id !== 'goto-match'); next.push({ id:'goto-match', pageIndex, left, top, width, height }); return next })
                              console.log('[HIGHLIGHT][native]', { pageIndex, left, top, width, height })
                                                } catch {}
		}
					}
                                                    }
				// If we received a range (startPage-endPage), log it for debugging
				try { if (detail?.match?.range) console.log('[GOTO-MATCH][range]', detail.match.range) } catch {}
                                        } catch {}
            try {
                (searchPluginInstance as any).clearHighlights?.()
                ;(searchPluginInstance as any).highlight?.({ keyword: detail.q })
            } catch (e) { console.warn('[GOTO][event] highlight error', e) }
            // Disegna subito il rettangolo OCR esatto (se ho il bbox)
            try {
                const m = detail?.match
                if (m && m.page && m.x0Pct != null && m.y0Pct != null && m.x1Pct != null && m.y1Pct != null) {
                    // drawOcrRects([{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }], 'rgba(16,185,129,1)') // Ora gestito dal componente OcrInspector
                    requestAnimationFrame(() => {
                        // try { drawOcrRects([{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }], 'rgba(16,185,129,1)') } catch {} // Ora gestito dal componente OcrInspector
                    })
                }
            } catch {}
            // Attendi un attimo per consentire agli highlight nativi (keyword) di comparire
			await new Promise(r => setTimeout(r, 120))
			const waitForHighlights = async (ms=1200) => new Promise<HTMLElement[] | null>((resolve) => {
				const start = Date.now()
				const tick = () => {
					const nodes = Array.from(document.querySelectorAll('.rpv-search__highlight')) as HTMLElement[]
					if (nodes.length > 0) return resolve(nodes)
					if (Date.now() - start > ms) return resolve(null)
					requestAnimationFrame(tick)
				}
				tick()
			})
			const nodes = await waitForHighlights()
			if (nodes && nodes.length) {
				// Map bbox → nearest highlight
				const m = detail.match
				if (m && m.x0Pct != null) {
					const viewer = hostRef.current
					const layers = viewer?.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement> | null
					const pageLayer = layers ? layers[m.page-1] : null
					if (pageLayer) {
						const pr = pageLayer.getBoundingClientRect()
						const targetX = pr.left + ((m.x0Pct + m.x1Pct)/2) * pr.width
						const targetY = pr.top + ((m.y0Pct + m.y1Pct)/2) * pr.height
						let bestIdx = -1; let bestD = Infinity
						nodes.forEach((n, idx) => {
							const r = n.getBoundingClientRect(); const cx = (r.left + r.right)/2; const cy = (r.top + r.bottom)/2
							const d = Math.hypot(cx - targetX, cy - targetY)
							if (d < bestD) { bestD = d; bestIdx = idx }
						})
						if (bestIdx >= 0) {
							console.log('[GOTO][event] jumpToMatch mapped idx', { bestIdx, bestD, total:nodes.length })
							try { (searchPluginInstance as any).jumpToMatch?.(bestIdx); return } catch {}
						}
					}
				}
				// If ord exists and within range, use it
				if (detail?.match?.ord != null && detail.match.ord < nodes.length) {
					console.log('[GOTO][event] jumpToMatch ord', detail.match.ord, 'total', nodes.length)
					try { (searchPluginInstance as any).jumpToMatch?.(detail.match.ord); return } catch {}
				}
				// Fallback: first idx containing query
				const idx = Math.max(0, nodes.findIndex(n => (n.textContent || '').toLowerCase().includes(String(detail.q).toLowerCase())))
				console.log('[GOTO][event] jumpToMatch idx', idx, 'total', nodes.length)
				try { (searchPluginInstance as any).jumpToMatch?.(idx); return } catch {}
			}
			// ultimate fallback
			const mi = detail.match ? { id: detail.match.id, page: detail.match.page, snippet: detail.match.snippet, x0Pct: detail.match.x0Pct, x1Pct: detail.match.x1Pct, y0Pct: detail.match.y0Pct, y1Pct: detail.match.y1Pct, charIdx: detail.match.charIdx, qLen: detail.match.qLength } : null
			if (mi) { console.log('[GOTO][event] goToMatch fallback', mi); await (goToMatch as any)(mi) } else console.warn('[GOTO][event] missing match payload')
		}
		window.addEventListener('app:goto-match', handler as any)
		return () => window.removeEventListener('app:goto-match', handler as any)
	}, [docId])

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
