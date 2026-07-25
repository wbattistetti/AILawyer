import { useCallback, useEffect } from 'react'
import type { MatchItem } from './usePdfSearch'
import { matchBoxToUnit } from '../utils/matchCoords'

type JumpArea = { id: string; pageIndex: number; left: number; top: number; width: number; height: number }

export interface UsePdfJumpToProps {
	docId?: string
	hostRef: React.MutableRefObject<HTMLDivElement | null>
	viewerRef: React.RefObject<any> // PdfViewerHandle
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	ensureOverlayRootForPage: (pageNum: number) => boolean
	bumpOverlayTick: () => void
	setActiveSearchMatchId: (matchId: string | null) => void
	setAreas: React.Dispatch<React.SetStateAction<JumpArea[]>>
}

export const usePdfJumpTo = ({
	docId,
	hostRef,
	viewerRef,
	overlayRootsRef,
	ensureOverlayRootForPage,
	bumpOverlayTick,
	setActiveSearchMatchId,
	setAreas
}: UsePdfJumpToProps) => {

	const goToMatch = useCallback(async (m: MatchItem) => {
		if (typeof m.page !== 'number' || m.page < 1) {
			console.error('[GOTO] ❌ INVALID PAGE NUMBER:', { page: m.page, match: m })
			return
		}
		if (!m.rects?.length) {
			throw new Error(`Match "${m.id}" senza rettangoli OCR`)
		}
		console.log('[GOTO] ▶ Jumping to page:', m.page, { id: m.id, snippet: m.snippet?.substring(0, 30) })

		setActiveSearchMatchId(m.id)

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

		ensureOverlayRootForPage(m.page)
		bumpOverlayTick()

		// Per documenti nativi/OCR aspetta che il layer pagina sia stabile
		await waitFor(
			() => {
				const root = overlayRootsRef.current.get(m.page)
				return root && document.contains(root) ? root : null
			},
			4000,
			'overlay root'
		)

		// one extra RAF to let layout settle
		await new Promise(r => requestAnimationFrame(() => r(null as any)))
		// Container scroll deterministico
		const sc = viewer.querySelector('.rpv-core__viewer') as HTMLElement | null
		if (!sc) {
			console.warn('[GOTO] .rpv-core__viewer missing');
			return
		}

		const pr0 = pageEl.getBoundingClientRect();
		const scr0 = sc.getBoundingClientRect()
		const pageTop = sc.scrollTop + (pr0.top - scr0.top) - 20
		sc.scrollTo({ top: Math.max(0, pageTop), behavior: 'auto' })

		const pr = pageEl.getBoundingClientRect()
		const scr = sc.getBoundingClientRect()

		const unitBox = matchBoxToUnit({
			x0Pct: m.x0Pct ?? 0,
			y0Pct: m.y0Pct ?? 0,
			x1Pct: m.x1Pct ?? 0,
			y1Pct: m.y1Pct ?? 0
		})

		const yAbs = pr.top + unitBox.y0Pct * pr.height
		const yAbsBottom = pr.top + unitBox.y1Pct * pr.height
		const xAbs = pr.left + unitBox.x0Pct * pr.width
		const xAbsRight = pr.left + unitBox.x1Pct * pr.width

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
		sc.scrollTo({ top: newTop, left: newLeft, behavior: 'smooth' })
		bumpOverlayTick()
	}, [
		bumpOverlayTick,
		ensureOverlayRootForPage,
		hostRef,
		overlayRootsRef,
		setActiveSearchMatchId,
		viewerRef
	])

	// Jump-to handler from outside (drawer/tmpdoc)
	useEffect(() => {
		const handler = async (ev: Event) => {
			const detail = (ev as CustomEvent).detail || {}
			if (!detail || (detail.docId && detail.docId !== (docId || 'current'))) { return }
			const match = detail.match
			if (!match || typeof match.page !== 'number') {
				throw new Error('Evento app:goto-match senza match valido')
			}

			const unitBox = matchBoxToUnit({
				x0Pct: match.x0Pct ?? 0,
				y0Pct: match.y0Pct ?? 0,
				x1Pct: match.x1Pct ?? 0,
				y1Pct: match.y1Pct ?? 0
			})
			const pageIndex = Math.max(0, match.page - 1)
			setAreas((prev) => {
				const next = prev.filter((area) => area.id !== 'goto-match')
				next.push({
					id: 'goto-match',
					pageIndex,
					left: unitBox.x0Pct,
					top: unitBox.y0Pct,
					width: Math.max(0, unitBox.x1Pct - unitBox.x0Pct),
					height: Math.max(0, unitBox.y1Pct - unitBox.y0Pct)
				})
				return next
			})

			await goToMatch({
				id: match.id || `goto-${match.page}`,
				page: match.page,
				snippet: match.snippet || '',
				x0Pct: match.x0Pct ?? 0,
				x1Pct: match.x1Pct ?? 0,
				y0Pct: match.y0Pct ?? 0,
				y1Pct: match.y1Pct ?? 0,
				charIdx: match.charIdx ?? 0,
				qLen: match.qLength ?? match.qLen ?? 0,
				rects: Array.isArray(match.rects) && match.rects.length > 0
					? match.rects
					: [{
						x0Pct: match.x0Pct ?? 0,
						x1Pct: match.x1Pct ?? 0,
						y0Pct: match.y0Pct ?? 0,
						y1Pct: match.y1Pct ?? 0
					}]
			})
		}
		window.addEventListener('app:goto-match', handler as EventListener)
		return () => window.removeEventListener('app:goto-match', handler as EventListener)
	}, [docId, goToMatch, setAreas])

	return {
		goToMatch
	}
}
