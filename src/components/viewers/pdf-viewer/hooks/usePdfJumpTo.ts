import { useEffect } from 'react'
import type { MatchItem } from './usePdfSearch'

export interface UsePdfJumpToProps {
	docId?: string
	hostRef: React.MutableRefObject<HTMLDivElement | null>
	viewerRef: React.RefObject<any> // PdfViewerHandle
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	setSelectedAnnot: (annot: any) => void
	areas: Array<{ id: string; pageIndex: number; left: number; top: number; width: number; height: number }>
	setAreas: (areas: Array<{ id: string; pageIndex: number; left: number; top: number; width: number; height: number }>) => void
	searchCacheRef: React.MutableRefObject<Map<string, MatchItem[]>>
	fileUrl: string
}

export const usePdfJumpTo = ({
	docId,
	hostRef,
	viewerRef,
	overlayRootsRef,
	setSelectedAnnot,
	areas,
	setAreas,
	searchCacheRef,
	fileUrl
}: UsePdfJumpToProps) => {

	const goToMatch = async (m: MatchItem) => {
		setSelectedAnnot(null)

		// Usa viewerRef per saltare alla pagina
		if (viewerRef.current?.jumpToPage) {
			viewerRef.current.jumpToPage(m.page);
		}

		// Helper per aspettare che una condizione sia vera
		const waitFor = async (cond: () => HTMLElement | null, ms = 5000, desc = 'element') => {
			const start = Date.now()
			return new Promise<HTMLElement | null>((resolve) => {
				const tick = () => {
					const el = cond()
					if (el) {
						return resolve(el)
					}
					if (Date.now() - start > ms) {
						return resolve(null)
					}
					requestAnimationFrame(tick)
				}
				tick()
			})
		}

		const viewer = hostRef.current
		if (!viewer) {
			return
		}

		// Aspetta che viewer salti alla pagina
		await new Promise(r => setTimeout(r, 300))

		// Passo 2: Aspetta che la pagina sia renderizzata (timeout aumentato per documenti nativi)
		const pageEl = await waitFor(
			() => {
				const layers = viewer.querySelectorAll('.rpv-core__page-layer')
				const layer = layers[m.page - 1] as HTMLElement | undefined
				// Verifica che la pagina abbia almeno una dimensione (sia renderizzata)
				if (layer) {
					const rect = layer.getBoundingClientRect()
					if (rect.width > 0 && rect.height > 0) {
						return layer
					}
				}
				return null
			},
			6000, // Timeout aumentato a 6 secondi per documenti nativi
			'page layer'
		)

		if (!pageEl) {
			console.warn('[GOTO] page el missing after timeout');
			return
		}

		console.log('[GOTO] Page element found, waiting for text layer...')

		// Passo 3: Per documenti nativi, aspetta che il text layer sia disponibile
		const textLayer = await waitFor(
			() => {
				const layer = pageEl.querySelector('.rpv-core__text-layer') as HTMLElement | null
				// Per documenti nativi, verifica che il text layer abbia contenuto
				if (layer) {
					const hasContent = layer.children.length > 0 || layer.textContent?.trim().length > 0
					if (hasContent) {
						return layer
					}
				}
				// Fallback: usa il pageEl stesso se non c'è text layer (caso OCR)
				return pageEl
			},
			4000,
			'text layer'
		)

		// Usa textLayer se disponibile, altrimenti pageEl come fallback
		const effectiveTextLayer = textLayer || pageEl

		if (!textLayer) {
			console.warn('[GOTO] text layer missing after timeout, using pageEl as fallback')
		} else {
			console.log('[GOTO] Text layer found and ready')
		}

		// one extra RAF to let layout settle
		await new Promise(r => requestAnimationFrame(() => r(null as any)))
		// Container scroll deterministico
		const sc = viewer.querySelector('.rpv-core__viewer') as HTMLElement | null
		if (!sc) {
			console.warn('[GOTO] .rpv-core__viewer missing');
			return
		}
		console.log('[GOTO] Scroll container found:', {
			scrollHeight: sc.scrollHeight,
			clientHeight: sc.clientHeight,
			scrollTop: sc.scrollTop
		})

		const pr0 = pageEl.getBoundingClientRect();
		const scr0 = sc.getBoundingClientRect()
		const pageTop = sc.scrollTop + (pr0.top - scr0.top) - 20
		console.log('[GOTO] Initial scroll calculation:', {
			pageElTop: pr0.top,
			scrollContainerTop: scr0.top,
			currentScrollTop: sc.scrollTop,
			calculatedPageTop: pageTop
		})
		sc.scrollTo({ top: Math.max(0, pageTop), behavior: 'auto' })

		const pr = pageEl.getBoundingClientRect()
		const scr = sc.getBoundingClientRect()
		console.log('[GOTO] Match coordinates:', {
			x0Pct: m.x0Pct,
			y0Pct: m.y0Pct,
			x1Pct: m.x1Pct,
			y1Pct: m.y1Pct,
			pageWidth: pr.width,
			pageHeight: pr.height
		})

		const yAbs = pr.top + (m.y0Pct ?? 0) * pr.height
		const yAbsBottom = pr.top + (m.y1Pct ?? 0) * pr.height
		const xAbs = pr.left + (m.x0Pct ?? 0) * pr.width
		const xAbsRight = pr.left + (m.x1Pct ?? 0) * pr.width
		console.log('[GOTO] Calculated absolute positions:', {
			yAbs,
			yAbsBottom,
			xAbs,
			xAbsRight,
			viewportTop: scr.top,
			viewportBottom: scr.bottom,
			viewportLeft: scr.left,
			viewportRight: scr.right
		})

		let newTop = sc.scrollTop
		let newLeft = sc.scrollLeft
		if (yAbs < scr.top + 24 || yAbsBottom > scr.bottom - 24) {
			const desiredTop = sc.scrollTop + (yAbs - scr.top) - Math.floor(sc.clientHeight * 0.3)
			newTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, desiredTop))
			console.log('[GOTO] Vertical scroll needed:', {
				yAbs,
				viewportTop: scr.top,
				desiredTop,
				finalTop: newTop
			})
		}
		if (xAbs < scr.left + 24 || xAbsRight > scr.right - 24) {
			const desiredLeft = sc.scrollLeft + (xAbs - scr.left) - Math.floor(sc.clientWidth * 0.4)
			newLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, desiredLeft))
			console.log('[GOTO] Horizontal scroll needed:', {
				xAbs,
				viewportLeft: scr.left,
				desiredLeft,
				finalLeft: newLeft
			})
		}
		console.log('[GOTO] Final scroll values:', {
			fromTop: sc.scrollTop,
			toTop: newTop,
			fromLeft: sc.scrollLeft,
			toLeft: newLeft
		})
		sc.scrollTo({ top: newTop, left: newLeft, behavior: 'smooth' })
		console.log('[GOTO] Scroll executed')

		// Disegna il bbox ricevuto (diagnostica) e prova a raffinarlo alla parola usando le highlight native
		try {
			const x0Pct = Math.max(0, Math.min(1, m.x0Pct ?? 0))
			const y0Pct = Math.max(0, Math.min(1, m.y0Pct ?? 0))
			const x1Pct = Math.max(0, Math.min(1, m.x1Pct ?? 1))
			const y1Pct = Math.max(0, Math.min(1, m.y1Pct ?? 1))
			// drawOcrRects([{ page: m.page, x0Pct, y0Pct, x1Pct, y1Pct }], 'rgba(59,130,246,1)') // Ora gestito dal componente OcrInspector
			// Trova highlight native nella pagina corrente
			const nodes = Array.from(document.querySelectorAll('.rpv-search__highlight')) as HTMLElement[]
			const onPage = nodes
				.map((n) => ({ el: n, r: n.getBoundingClientRect() }))
				.filter(({ r }) => r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right)
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
				// drawOcrRects([{ page: m.page, x0Pct: nx0, y0Pct: ny0, x1Pct: nx1, y1Pct: ny1 }], 'rgba(16,185,129,1)') // Ora gestito dal componente OcrInspector
			}
		} catch (e) { console.warn('[GOTO][bbox-refine][err]', e) }
		let root = overlayRootsRef.current.get(m.page)
		if (!root) {
			root = document.createElement('div')
			root.className = 'ai-overlay-root'
			Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10' })
			if (!effectiveTextLayer.style.position || effectiveTextLayer.style.position === '') {
				effectiveTextLayer.style.position = 'relative'
			}
			effectiveTextLayer.appendChild(root)
			overlayRootsRef.current.set(m.page, root)
		}
		setSelectedAnnot({ id: 'sel', page: m.page, type: 'highlight', color: '#fbbf2480', x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct })
	}

	// Jump-to handler from outside (drawer/tmpdoc)
	useEffect(() => {
		const handler = async (ev: any) => {
			const detail = ev?.detail || {}
			// Jump-to handler from outside (drawer/tmpdoc). Scroll to box if provided and add area highlight.
			if (!detail || (detail.docId && detail.docId !== (docId || 'current'))) { return }
			try {
				const m = detail.match || {}
				if (typeof m.page === 'number' && viewerRef.current?.jumpToPage) {
					viewerRef.current.jumpToPage(m.page);
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
						const pageEl = await waitFor(() => (viewer.querySelectorAll('.rpv-core__page-layer')?.[Math.max(0, (m.page || 1) - 1)] as HTMLElement) || null)
						if (pageEl) {
							const pr = pageEl.getBoundingClientRect()
							const scCandidates = [viewer.querySelector('.rpv-core__inner') as HTMLElement | null, viewer.querySelector('.rpv-core__pages') as HTMLElement | null, viewer.querySelector('.rpv-core__viewer') as HTMLElement | null, viewer as HTMLElement]
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
								setAreas(prev => { const next = prev.filter(a => a.id !== 'goto-match'); next.push({ id: 'goto-match', pageIndex, left, top, width, height }); return next })
							} catch { }
						}
					}
				}
				// If we received a range (startPage-endPage), log it for debugging
			} catch { }
			// Disegna subito il rettangolo OCR esatto (se ho il bbox)
			try {
				const m = detail?.match
				if (m && m.page && m.x0Pct != null && m.y0Pct != null && m.x1Pct != null && m.y1Pct != null) {
					// drawOcrRects([{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }], 'rgba(16,185,129,1)') // Ora gestito dal componente OcrInspector
					requestAnimationFrame(() => {
						// try { drawOcrRects([{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }], 'rgba(16,185,129,1)') } catch {} // Ora gestito dal componente OcrInspector
					})
				}
			} catch { }
			// ultimate fallback - usa goToMatch per navigare
			const mi = detail.match ? { id: detail.match.id, page: detail.match.page, snippet: detail.match.snippet, x0Pct: detail.match.x0Pct, x1Pct: detail.match.x1Pct, y0Pct: detail.match.y0Pct, y1Pct: detail.match.y1Pct, charIdx: detail.match.charIdx, qLen: detail.match.qLength } : null
			if (mi) { await (goToMatch as any)(mi) }
		}
		window.addEventListener('app:goto-match', handler as any)
		return () => window.removeEventListener('app:goto-match', handler as any)
	}, [docId])

	return {
		goToMatch
	}
}
