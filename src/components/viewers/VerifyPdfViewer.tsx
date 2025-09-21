import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Worker, Viewer, SpecialZoomLevel, ScrollMode } from '@react-pdf-viewer/core'
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

import { Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, Search, GripVertical, PanelRightOpen } from 'lucide-react'
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

export const VerifyPdfViewer: React.FC<VerifyPdfViewerProps> = ({ fileUrl, page, lines: _lines, onPageChange, hideToolbar: _hideToolbar, docId }) => {
	const hostRef = useRef<HTMLDivElement | null>(null)
	const scrollMode = scrollModePlugin()
	const zoomPluginInstance = zoomPlugin()
	const pageNav = pageNavigationPlugin()
	const searchPluginInstance = searchPlugin()
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
	const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
	const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
	const drawingRef = useRef<{ page: number; startX: number; startY: number; x: number; y: number } | null>(null)

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

	const renderHighlightedSnippet = (text: string) => {
		const q = (searchQ || '').trim()
		if (!q) return text
		const idx = text.toLowerCase().indexOf(q.toLowerCase())
		if (idx < 0) return text
		const before = text.slice(0, idx)
		const match = text.slice(idx, idx + q.length)
		const after = text.slice(idx + q.length)
		return (
			<span className="truncate">
				<span>{before}</span>
				<span className="font-semibold">{match}</span>
				<span>{after}</span>
			</span>
		)
	}

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
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
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

	useEffect(() => {
		const handler = async (ev: any) => {
			const detail = ev?.detail || {}
			console.log('[GOTO][event]', { viewerDocId: docId || 'current', detail })
			if (!detail || (detail.docId && detail.docId !== (docId || 'current'))) { console.log('[GOTO][event] skip other doc'); return }
			try {
				(searchPluginInstance as any).clearHighlights?.()
				;(searchPluginInstance as any).highlight?.({ keyword: detail.q })
				console.log('[GOTO][event] highlight keyword', detail.q)
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
		<div className="flex h-full w-full">
			{/* Left: toolbar + viewer */}
			<div className="flex flex-col flex-1 min-w-0">
				<div className="flex items-center gap-3 border-b px-2 py-1 text-sm bg-white">
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
						<button className={`px-2 py-1 rounded border ${tool==='comment'?'bg-amber-100 border-amber-400':''}`} title="Commento" onClick={()=>setTool(tool==='comment'?'none':'comment')}>
							<MessageSquare size={16} />
						</button>
					</div>
					<div className="ml-auto flex items-center gap-2">
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

				<div ref={hostRef} className="flex-1 overflow-hidden" style={{ ['--scale-factor' as any]: String(scaleRef.current || 1) }}>
					<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
						<Viewer
							fileUrl={fileUrl}
							defaultScale={SpecialZoomLevel.PageWidth}
							plugins={[scrollMode, zoomPluginInstance, pageNav, searchPluginInstance]}
							scrollMode={ScrollMode.Vertical}
							initialPage={Math.max(0, (page || 1) - 1)}
							onPageChange={(e) => { const cp = e.currentPage + 1; setPageInput(String(cp)); onPageChange?.(cp) }}
							onDocumentLoad={(e) => { const total = (e as any).doc?.numPages || (e as any).document?.numPages || 0; if (total) { setTotalPages(total); setPageInput('1') } const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined; if (viewer) viewer.style.setProperty('--scale-factor', String(scaleRef.current || 1)) }}
							onZoom={(e: any) => { const s = (e?.scale || e?.zoom) as number; if (typeof s === 'number') { scaleRef.current = s; setZoomPct(Math.round(s*100)); (window as any).__rpvLastZoomScale = s; const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined; if (viewer) viewer.style.setProperty('--scale-factor', String(s)) } }}
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
			</div>

			{/* Resizer + Right search panel (conditional) */}
			{showAdvanced && (
				<>
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
				</>
			)}
		</div>
	)
}

function cryptoRandom() {
	return Math.random().toString(36).slice(2) + Date.now().toString(36)
}


