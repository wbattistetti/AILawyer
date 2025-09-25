import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Worker, Viewer, SpecialZoomLevel, ScrollMode } from '@react-pdf-viewer/core'
import { highlightPlugin } from '@react-pdf-viewer/highlight'
import '@react-pdf-viewer/highlight/lib/styles/index.css'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { searchPlugin } from '@react-pdf-viewer/search'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/zoom/lib/styles/index.css'
import '@react-pdf-viewer/page-navigation/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist'

import { Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, Search, GripVertical, PanelRightOpen, Save as SaveIcon } from 'lucide-react'
import { PdfSelectionOverlay, getPdfCoords, getSelectedTextInRect } from '../../features/pdf/PdfSelectionOverlay'
// Replaced per-page overlay with SVG layer via renderPage
import { SvgSelectLayer } from '../../features/pdf/SvgSelectLayer'
import { getTextInViewportBox } from '../../features/pdf/getTextInViewportBox'
import { getTextInPdfBox } from '../../features/pdf/getTextInPdfBox'
// import { PerPageSelectionManager } from './PerPageSelectionManager'
import { cryptoRandom, formatDocTitle } from '../../utils/misc'
import { SearchProvider } from '../search/SearchProvider'
import { SearchPanelTree } from '../search/SearchPanelTree'


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

type MatchItem = {
	id: string
	page: number
	snippet: string
	x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number
	spanIdx?: number
	charIdx?: number
	qLen?: number
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
    .ai-native-select .rpv-core__page-layer { user-select: none; -webkit-user-select: none; pointer-events: none; }
    .ai-native-select .rpv-core__text-layer { user-select: none; -webkit-user-select: none; pointer-events: none; }
    .ai-native-select .rpv-core__text-layer span { user-select: text; -webkit-user-select: text; pointer-events: auto; display:inline-block; padding:0 2px; margin-right:2px; }
    `
    document.head.appendChild(style)
    try { console.log('[NATIVE][css][inject]', { id, appended: true }) } catch {}
}

// legacy style helper no longer used (SvgSelectLayer handles styles per page)

export const VerifyPdfViewer: React.FC<VerifyPdfViewerProps> = ({ fileUrl, page, lines: _lines, onPageChange, hideToolbar: _hideToolbar, docId }) => {
	const hostRef = useRef<HTMLDivElement | null>(null)
	const scrollMode = scrollModePlugin()
	const zoomPluginInstance = zoomPlugin()
	const pageNav = pageNavigationPlugin()
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
	const scaleRef = useRef<number>(1)
	const zoomDebounceRef = useRef<number | null>(null)

	const [totalPages, setTotalPages] = useState<number>(0)
	const [pageInput, setPageInput] = useState<string>('1')
	const [zoomPct, setZoomPct] = useState<number>(100)
	const [tool, setTool] = useState<Tool>('none')
	const colorH = '#ffeb3b80'
	const colorU = '#0ea5e9'
	const colorS = '#ef4444'
const [annots, setAnnots] = useState<Annotation[]>([])
const [draft, setDraft] = useState<Annotation | null>(null)
type Area = { id: string; pageIndex: number; left: number; top: number; width: number; height: number }
const [areas, setAreas] = useState<Area[]>([])
const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
const selectRootsRef = useRef<Map<number, HTMLElement>>(new Map())
const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
const [selectMode, setSelectMode] = useState<boolean>(false)
const mouseDownPageRef = useRef<number | null>(null)
const mouseDownPosRef = useRef<{ xPct:number; yPct:number } | null>(null)
const [selectKind, setSelectKind] = useState<'NATIVE'|'OCR'>('NATIVE')
const [selectTick, setSelectTick] = useState<number>(0)
const [_selBox, setSelBox] = useState<{ x:number; y:number; w:number; h:number }|null>(null)
const [extractOpen, setExtractOpen] = useState<boolean>(false)
const [extractType, setExtractType] = useState<'CONTESTAZIONE'|'NOTIZIA_REATO'|'VERBALE_SEQUESTRO'|'VERBALE_ARRESTO'>('CONTESTAZIONE')
const [extractNotes, setExtractNotes] = useState<string>('')
const [extractPage, setExtractPage] = useState<number>(1)
const [extractPos, setExtractPos] = useState<{ x:number; y:number }>({ x: 100, y: 100 })
const [lastSelection, setLastSelection] = useState<any|null>(null)
const [extractTitle, setExtractTitle] = useState<string>('')
const drawingRef = useRef<{ page:number; startX:number; startY:number; x:number; y:number }|null>(null)
const openedAtRef = useRef<number>(0)
const selectionHandledRef = useRef<boolean>(false)
const isSelectingRef = useRef<boolean>(false)
const lastNativeRangeRef = useRef<Range | null>(null)
const suppressClearRef = useRef<boolean>(false)
// Note: no custom anchoring; let the browser handle selection during drag
// Global selection overlay (fallback, robust across pages)
// legacy globals removed (use per-page overlay)

	// Audit mode (digital text only)
	const [audit, setAudit] = useState<boolean>(false)

	// Search panel state
	const [panelW, setPanelW] = useState<number>(320)
	const [searchQ, setSearchQ] = useState<string>('')
	const [matches, setMatches] = useState<MatchItem[]>([])
	const resizingRef = useRef<boolean>(false)
	const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
	const [selectedAnnot, setSelectedAnnot] = useState<Annotation | null>(null)
	const pdfDocRef = useRef<any>(null)
	const searchCacheRef = useRef<Map<string, MatchItem[]>>(new Map())

	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const loadingTask = (pdfjsLib as any).getDocument({ url: fileUrl, disableWorker: true })
				const doc = await loadingTask.promise
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
    host.classList.toggle('ai-native-select', !!(selectMode && selectKind==='NATIVE'))
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
    let rafId: number | null = null
    const reapply = () => {
        if (rafId != null) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
            const textLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
            const pageLayers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
            const annotationLayers = Array.from(host.querySelectorAll('.rpv-core__annotation-layer')) as HTMLElement[]
            const canvasLayers = Array.from(host.querySelectorAll('.rpv-core__canvas-layer')) as HTMLElement[]
            try { console.log('[NATIVE][reapply]', { textLayers: textLayers.length, pageLayers: pageLayers.length, annotationLayers: annotationLayers.length, canvasLayers: canvasLayers.length, isNative }) } catch {}
            const isNative = !!(selectMode && selectKind === 'NATIVE')
            // text layers
            for (const tl of textLayers) {
                if (isNative) {
                    tl.style.pointerEvents = 'auto'; tl.style.userSelect = 'text'; (tl.style as any).webkitUserSelect = 'text'; tl.style.position = 'relative'; tl.style.zIndex = '2'
                } else {
                    tl.style.removeProperty('pointer-events'); tl.style.removeProperty('user-select'); (tl.style as any).webkitUserSelect = ''; tl.style.removeProperty('position'); tl.style.removeProperty('z-index')
                }
            }
            // page layers
            for (const pl of pageLayers) {
                if (isNative) {
                    pl.style.pointerEvents = 'none'; pl.style.userSelect = 'none'; (pl.style as any).webkitUserSelect = 'none'; pl.style.position = 'relative'; pl.style.zIndex = '1'
                } else {
                    pl.style.removeProperty('pointer-events'); pl.style.removeProperty('user-select'); (pl.style as any).webkitUserSelect = ''; pl.style.removeProperty('position'); pl.style.removeProperty('z-index')
                }
            }
            // other layers
            for (const l of [...annotationLayers, ...canvasLayers]) {
                if (isNative) { l.style.pointerEvents = 'none'; l.style.zIndex = '0' } else { l.style.removeProperty('pointer-events'); l.style.removeProperty('z-index') }
            }
        })
    }
    const mo = new MutationObserver((muts) => {
        let relevant = false
        for (const m of muts) {
            if (m.type === 'childList') { relevant = true; break }
        }
        if (relevant) reapply()
    })
    mo.observe(host, { subtree: true, childList: true, attributes: false })
    return () => { mo.disconnect(); if (rafId != null) cancelAnimationFrame(rafId) }
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



	const searchMainThread = async (qRaw: string) => {
		try {
			const doc = pdfDocRef.current
			if (!doc) return
			const total = doc.numPages || 0
			const out: MatchItem[] = []
			for (let p = 1; p <= total; p++) {
				const page = await doc.getPage(p)
				const content = await page.getTextContent()
				const items = content.items as any[]
				let buffer = ''
				const boxes: { x: number; y: number; w: number; h: number }[] = []
				for (const it of items) {
					const s = (it.str || '') as string
					const tx = it.transform
					const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0
					const cw = ((it.width as number) || 0) / Math.max(1, s.length)
					for (let i = 0; i < s.length; i++) {
						const x = (tx[4] as number) + (cw * i)
						const y = (tx[5] as number) - h
						boxes.push({ x, y, w: cw, h })
					}
					buffer += s + ' '
				}
				const hay = buffer.toLowerCase()
				const needle = qRaw.toLowerCase()
				let pos = 0
				while (true) {
					const idx = hay.indexOf(needle, pos)
					if (idx < 0) break
					const start = idx, end = idx + needle.length
					let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
					for (let i = start; i < end && i < boxes.length; i++) {
						const c = boxes[i]
						l = Math.min(l, c.x); t = Math.min(t, c.y)
						r = Math.max(r, c.x + c.w); b = Math.max(b, c.y + c.h)
					}
					if (isFinite(l) && isFinite(t) && isFinite(r) && isFinite(b)) {
						const vp = page.getViewport({ scale: 1 })
						const x0Pct = l / vp.width
						const x1Pct = r / vp.width
						const yTop = vp.height - b
						const yBottom = vp.height - t
						const y0Pct = yTop / vp.height
						const y1Pct = yBottom / vp.height
						out.push({ id: cryptoRandom(), page: p, snippet: buffer.slice(Math.max(0, start-40), Math.min(buffer.length, end+40)).trim(), x0Pct, x1Pct, y0Pct, y1Pct, qLen: qRaw.length, charIdx: start })
					}
					pos = end
				}
			}
			setMatches(out)
		} catch {}
	}

	const runSearch = async () => {
		const qRaw = (searchQ || '').trim()
		if (!qRaw) { setMatches([]); try{ (searchPluginInstance as any).clearHighlights?.() } catch{}; return }
		const cacheKey = `${fileUrl}::${qRaw.toLowerCase()}`
		if (searchCacheRef.current.has(cacheKey)) {
			setMatches(searchCacheRef.current.get(cacheKey) || [])
			try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: qRaw }) } catch {}
			return
		}
		try {
			const res = await fetch(fileUrl)
			await res.arrayBuffer()
			await searchMainThread(qRaw)
			searchCacheRef.current.set(cacheKey, matches)
			try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: qRaw }) } catch {}
		} catch {}
	}

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
		const findScroll = () => {
			const cands = [
				viewer.querySelector('.rpv-core__inner') as HTMLElement | null,
				viewer.querySelector('.rpv-core__pages') as HTMLElement | null,
				viewer.querySelector('.rpv-core__viewer') as HTMLElement | null,
				viewer as HTMLElement,
			]
			return cands.find(el => el && el.scrollHeight > (el.clientHeight + 10)) || null
		}
		const sc = findScroll()
		if (!sc) { console.warn('[GOTO] scroll container missing'); return }
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
				try { console.log('[NATIVE][sel] selectionchanged', { hasSel: !!sel, rangeCount: sel?.rangeCount, text: String(sel||'') }) } catch {}
				if (!sel || sel.rangeCount === 0) { try { console.warn('[NATIVE][sel] no selection or rangeCount=0') } catch {}; return }
				const raw = String(sel)
				try { console.log('[NATIVE][sel_text]', raw) } catch {}
				if (!raw || !raw.trim()) { try { console.warn('[NATIVE][sel] empty text') } catch {}; return }
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
						setLastSelection({ pdfPageNumber: pageNum, bboxPdf: { x0, y0, x1, y1 }, viewportBox, text })
					} else {
						setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
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
        const onMouseUp = (ev: MouseEvent) => {
			// ignora click su UI esterne
			const hostR = host.getBoundingClientRect()
			if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
			if (extractOpen) { try { console.log('[NATIVE][mouseup] ignored: extractOpen') } catch {}; return }
			if (timer) window.clearTimeout(timer)
			// chiamata solo su mouseup per evitare apertura anticipata
			try { console.log('[NATIVE][event] mouseup within viewer', { x: ev.clientX, y: ev.clientY, wasSelecting: isSelectingRef.current }) } catch {}
			isSelectingRef.current = false
			void handleSelection()
            // niente classe dragging: manteniamo la selezione nativa visibile
            try { setDraft(null) } catch {}
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
                // remove custom drag overlay in native mode to keep browser selection continuous
                const onDragMove = (_ev: MouseEvent) => { /* no-op in NATIVE */ }
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { try { const s = window.getSelection(); s && s.removeAllRanges() } catch {}; setSelectMode(false) } }
		document.addEventListener('mousedown', onMouseDown, true)
		document.addEventListener('mouseup', onMouseUp, true)
		document.addEventListener('selectionchange', onSelChange, true)
        document.addEventListener('mousemove', onDragMove, true)
		document.addEventListener('keydown', onKey, true)
		try { console.log('[NATIVE][bind] listeners attached') } catch {}
        return () => { if (timer) window.clearTimeout(timer); document.removeEventListener('mousedown', onMouseDown, true); document.removeEventListener('mouseup', onMouseUp, true); document.removeEventListener('selectionchange', onSelChange, true); document.removeEventListener('mousemove', onDragMove, true); document.removeEventListener('keydown', onKey, true) }
	}, [selectMode, selectKind])

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
				// optional keyword highlight
			} catch (e) { console.warn('[GOTO][event] highlight error', e) }
			// Wait a tick for native highlights to render
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

					{/* Quick search bar */}
					<div className="flex items-center gap-1 ml-2">
						<Search size={16} className="text-gray-500" />
						<input value={searchQ} onChange={(e)=>setSearchQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ runSearch() } }} placeholder="Cerca nel documento" className="w-72 border rounded px-2 py-1" />
						<button className="px-2 py-1 border rounded" title="Ricerca avanzata" onClick={()=>setShowAdvanced(s=>!s)}>
							<PanelRightOpen size={16} />
						</button>
					</div>
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
                    <button
                      aria-pressed={selectMode}
                      className={`px-2 py-1 rounded border ${selectMode ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : ''}`}
                      title={selectMode ? 'Selezione estratto: ON' : 'Selezione estratto: OFF'}
                      onClick={(ev)=>{
                        ev.preventDefault()
                        const next = !selectMode
                        try { console.log('[NATIVE][UI] toggle Estratto', { next, selectKind }) } catch {}
                        setSelectMode(next)
                        if (!next) { setSelBox(null); setExtractOpen(false); setLastSelection(null); selectionHandledRef.current = false; try { const s = window.getSelection(); s && s.removeAllRanges() } catch {} }
                      }}
                    >Estratto</button>
						<button className={`px-2 py-1 rounded border ${tool==='comment'?'bg-amber-100 border-amber-400':''}`} title="Commento" onClick={()=>setTool(tool==='comment'?'none':'comment')}>
							<MessageSquare size={16} />
						</button>
					{/* Toolbar Save (selection native or OCR) */}
					<button
					  className="px-2 py-1 rounded border"
					  title="Salva estratto"
					  onClick={()=>{
					    const title = (extractTitle || '').trim() || 'Estratto'
					    if (!lastSelection || !(lastSelection.text||'').trim()) { console.warn('[EXTRACT][SAVE][toolbar] no selection'); return }
                        const payload = {
					      kind: 'EXTRACT',
					      type: extractType,
					      title,
                          notes: extractNotes || '',
                          source: { docId: docId || 'current', fileUrl, page: extractPage, range: (lastSelection as any)?.range || null },
					      viewportBox: lastSelection?.viewportBox || null,
					      bboxPdf: lastSelection?.bboxPdf || null,
					      text: lastSelection?.text || '',
					      createdAt: new Date().toISOString(),
					    }
                        // remove debug log
					    const safe = (s: string) => (s || 'estratto').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64)
					    const fileName = `${safe(title)}_p${extractPage}.json`
                        try { console.log('[EXTRACT][SAVE][toolbar]', { extractPage, payload }) } catch {}
					    try {
					      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
					      const file = new File([blob], fileName, { type: 'application/json' })
					      let drawerTitle = ''
					      if (extractType === 'VERBALE_SEQUESTRO') drawerTitle = 'Verbale di sequestro'
					      else if (extractType === 'VERBALE_ARRESTO') drawerTitle = 'Verbale di arresto'
					      else if (extractType === 'CONTESTAZIONE') drawerTitle = 'Elenco verbali redatti'
					      else if (extractType === 'NOTIZIA_REATO') drawerTitle = 'Elenco verbali redatti'
					      const target = drawerTitle ? { type: 'drawer', title: drawerTitle } : { type: 'archive' }
					      const ev = new CustomEvent('app:upload-files', { detail: { files: [file], target } })
					      window.dispatchEvent(ev)
					      try { window.dispatchEvent(new Event('ai-select-clear')) } catch {}
					    } catch (e) { console.warn('[EXTRACT][SAVE][toolbar][err]', e) }
					  }}
					>
					  <SaveIcon size={16} />
					</button>
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
									try { (zoomPluginInstance as any).zoomTo(s) } catch {}
									const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
									if (viewer) viewer.style.setProperty('--scale-factor', String(s))
								}, 80)
							}}
						/>
					</div>
				</div>

                <div ref={hostRef} className="flex-1 overflow-hidden relative" style={{ ['--scale-factor' as any]: String(scaleRef.current || 1) }}>
					<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
						<Viewer
							fileUrl={fileUrl}
							defaultScale={SpecialZoomLevel.PageWidth}
							plugins={[scrollMode, zoomPluginInstance, pageNav, searchPluginInstance, highlight]}
							scrollMode={ScrollMode.Vertical}
							initialPage={Math.max(0, (page || 1) - 1)}
							onPageChange={(e) => { const cp = e.currentPage + 1; setPageInput(String(cp)); onPageChange?.(cp) }}
                            onDocumentLoad={(e) => { const total = (e as any).doc?.numPages || (e as any).document?.numPages || 0; if (total) { setTotalPages(total); setPageInput('1') } const container = hostRef.current as HTMLElement | null; if (container) container.style.setProperty('--scale-factor', String(scaleRef.current || 1)); const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined; if (viewer) viewer.style.setProperty('--scale-factor', String(scaleRef.current || 1)); try { window.dispatchEvent(new CustomEvent('app:viewer-ready', { detail: { docId: docId || 'current' } })) } catch {}; try { console.log('[VIEWER][ready]', { docId: docId || 'current', total }) } catch {} }}
							onZoom={(e: any) => { const s = (e?.scale || e?.zoom) as number; if (typeof s === 'number') { scaleRef.current = s; setZoomPct(Math.round(s*100)); (window as any).__rpvLastZoomScale = s; const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined; if (viewer) viewer.style.setProperty('--scale-factor', String(s)) } }}
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

                {/* Overlays */}
				{[...(selectedAnnot ? [selectedAnnot] : []), ...annots, ...(draft ? [draft] : [])].map(a => {
					const root = overlayRootsRef.current.get(a.page)
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
            
{extractOpen && (
            <React.Fragment>
      <div className="fixed inset-0 z-[999]" onClick={()=>{ if (!suppressClearRef.current) { setExtractOpen(false); setSelBox(null) } }} />
                    <div className="fixed z-[1000] bg-white rounded-lg shadow-2xl" style={{ left: extractPos.x, top: extractPos.y, width: 460, minHeight: 260, maxHeight: Math.min(540, (window.innerHeight||800) - 32), border:'1px solid rgba(0,0,0,.1)' }}>
                            <div className="p-4 max-h-full flex flex-col" onMouseDown={(e)=>{ e.stopPropagation(); suppressClearRef.current = true }} onMouseUp={()=>{ suppressClearRef.current = false }}>
                            <div className="text-base font-semibold mb-1">Aggiungi estratto</div>
                            <div className="text-sm text-gray-600 mb-3">Estratto da <span className="font-medium">{formatDocTitle(fileUrl)}</span>, pag. {extractPage}</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-sm block mb-1">Titolo dell'estratto</label>
                                    <input className="w-full border rounded px-2 py-1 text-[15px]" placeholder="Scrivi un titolo per l'estratto… (obbligatorio)" value={extractTitle} onChange={(e)=>setExtractTitle(e.target.value)} />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm block mb-1">Aggiungi estratto al cassetto:</label>
                                    <select className="w-full border rounded px-2 py-1" value={extractType} onChange={(e)=>setExtractType(e.target.value as any)}>
                                        <option value="CONTESTAZIONE">Contestazione</option>
                                        <option value="NOTIZIA_REATO">Notizia di reato</option>
                                        <option value="VERBALE_SEQUESTRO">Verbale di sequestro</option>
                                        <option value="VERBALE_ARRESTO">Verbale di arresto</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm block mb-1">Note</label>
                                    <textarea className="w-full border rounded px-2 py-1 min-h-[90px] max-h-[260px] resize-y overflow-auto text-[15px]" value={extractNotes} onChange={(e)=>setExtractNotes(e.target.value)} />
                                </div>
                            </div>
                            <div className="mt-3 pt-3 flex justify-end gap-2 sticky bottom-0 bg-white">
                                <button className="px-3 py-1 border rounded text-[15px]" onClick={()=>{ try { window.dispatchEvent(new Event('ai-select-clear')) } catch {}; /* non toccare la selezione nativa */ selectionHandledRef.current = false; setExtractOpen(false) }}>Annulla</button>
                                <button className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50 text-[15px]" disabled={!extractTitle.trim()} onClick={()=>{
                                    const payload = {
                                        kind: 'EXTRACT',
                                        type: extractType,
                                        title: extractTitle.trim(),
                                        notes: extractNotes || '',
                                        source: { docId: docId || 'current', fileUrl, page: extractPage, range: (lastSelection as any)?.range || null },
                                        viewportBox: lastSelection?.viewportBox || null,
                                        bboxPdf: lastSelection?.bboxPdf || null,
                                        text: lastSelection?.text || '',
                                        createdAt: new Date().toISOString(),
                                    }
                                    const safe = (s: string) => (s || 'estratto').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64)
                                    const fileName = `${safe(extractTitle || 'estratto') || 'estratto'}_p${extractPage}.json`
                                    try { console.log('[EXTRACT][SAVE][modal]', { extractPage, payload }) } catch {}
                                    try {
                                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                                        const file = new File([blob], fileName, { type: 'application/json' })
                                        // Map combo choice to explicit tags so drawers will match regardless of title wording
                                        let tags: string[] = []
                                        if (extractType === 'VERBALE_SEQUESTRO') tags = ['verbale_sequestro','verbale']
                                        else if (extractType === 'VERBALE_ARRESTO') tags = ['verbale_arresto','verbale']
                                        else if (extractType === 'CONTESTAZIONE' || extractType === 'NOTIZIA_REATO') tags = ['verbale']
                                        // Add as in-memory pending extract first (visualize immediately), persistence will happen on Save pratica
                                        try {
                                          const pending = ((window as any).__pendingExtracts || []) as Array<any>
                                          const pickColor = () => {
                                            if (tags.includes('verbale_sequestro') || tags.includes('verbale')) return '#fbbf24'
                                            if (tags.includes('intercettazioni')) return '#ec4899'
                                            if (tags.includes('reati')) return '#64748b'
                                            return '#94a3b8'
                                          }
                                          const bg = pickColor()
                                          const label = (fileName || 'Estratto').slice(0, 24)
                                          const svg = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
                                            <svg xmlns='http://www.w3.org/2000/svg' width='256' height='360'>
                                              <rect width='100%' height='100%' rx='12' ry='12' fill='white' stroke='${bg}' stroke-width='3'/>
                                              <rect x='24' y='24' width='208' height='36' rx='6' fill='${bg}'/>
                                              <text x='128' y='48' text-anchor='middle' font-family='Inter, Arial, sans-serif' font-size='16' fill='white'>Estratto</text>
                                              <text x='24' y='100' font-family='Inter, Arial, sans-serif' font-size='14' fill='#111'>${label}</text>
                                              <text x='24' y='330' font-family='Inter, Arial, sans-serif' font-size='12' fill='#6b7280'>JSON</text>
                                            </svg>`
                                          const thumb = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
                                            const pageForMeta = extractPage
                                            const pageLayerEl = (hostRef.current?.querySelectorAll('.rpv-core__page-layer')?.[pageForMeta-1] as HTMLElement | null)
                                            const pr = pageLayerEl?.getBoundingClientRect()
                                            const vb = lastSelection?.viewportBox
                                            const x0Pct = (vb && pr) ? (vb.x / pr.width) : undefined
                                            const x1Pct = (vb && pr) ? ((vb.x + vb.w) / pr.width) : undefined
                                            const y0Pct = (vb && pr) ? (vb.y / pr.height) : undefined
                                            const y1Pct = (vb && pr) ? ((vb.y + vb.h) / pr.height) : undefined
                                            const virt = { id: `tmp:${Date.now()}`, filename: fileName, s3Key: file.name, mime: file.type, thumb, tags, meta: { title: payload.title || 'Estratto', text: payload.text || '', source: { docId: (docId||'current'), title: formatDocTitle(fileUrl), page: pageForMeta, fileUrl, x0Pct, x1Pct, y0Pct, y1Pct, range: (lastSelection as any)?.range || null } } }
                                            try { console.log('[EXTRACT][PENDING][virt]', { pageForMeta, virtSource: virt.meta?.source }) } catch {}
                                          const next = [virt, ...pending]
                                          ;(window as any).__pendingExtracts = next
                                          // Push immediate update to open drawers
                                          try { window.dispatchEvent(new CustomEvent('app:documents', { detail: { items: next } })) } catch {}
                                          // And ask page to rebroadcast full list (persisted + pending)
                                          window.dispatchEvent(new CustomEvent('app:request-documents'))
                                        } catch {}
                                        // Optionally skip immediate upload; if you want immediate persistence, re-dispatch upload-files
                                    } catch (e) { console.warn('[EXTRACT][SAVE][err]', e) }
                                    try { window.dispatchEvent(new Event('ai-select-clear')) } catch {}
                                    try { const s = window.getSelection(); s && s.removeAllRanges() } catch {}
                                    selectionHandledRef.current = false
                                    setExtractOpen(false)
                                }}>Salva</button>
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            )}

            </div>

            {showAdvanced && (
			<React.Fragment>
					<div onMouseDown={()=>{ resizingRef.current = true; document.body.style.cursor = 'ew-resize' }} className="w-1.5 cursor-col-resize bg-transparent hover:bg-blue-300" title="Ridimensiona">
						<GripVertical size={12} className="mx-auto text-gray-400" />
					</div>
					<div className="h-full border-l bg-white flex flex-col" style={{ width: panelW }}>
						<SearchProvider defaultScope={'current'} onSearch={async(q, _scope)=>{
							(setSearchQ as any)(q)
							await runSearch()
							const docTitle = (fileUrl?.split('/')?.pop() || 'Documento') as string
							const groups = [{ doc: { id: 'current', title: docTitle, hash: '', pages: totalPages, kind: 'pdf' as const }, matches: (matches || []).map((m)=>({
								id: m.id,
								docId: 'current',
								docTitle,
								kind: 'pdf' as const,
								page: m.page,
								q: q,
								x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct,
								charIdx: m.charIdx, qLength: m.qLen,
								snippet: m.snippet,
								score: 0,
							})) }]
							return { id: cryptoRandom(), query: q, scope: 'current' as any, total: (matches || []).length, groups } as any
						}} adapterFactory={() => ({
							goToMatch: async (m: any) => {
								try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: m.q }) } catch {}
								const mi = { id: m.id, page: m.page, snippet: m.snippet, x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct, charIdx: m.charIdx, qLen: m.qLength } as any
								await (goToMatch as any)(mi)
							}
						})}>
							<SearchPanelTree showInput={true} />
						</SearchProvider>
					</div>
			</React.Fragment>
			)}
		</div>
        {/* global overlay rimosso: usiamo solo overlay per-pagina */}
		</React.Fragment>
	)
}
