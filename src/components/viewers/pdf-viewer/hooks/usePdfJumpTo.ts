/**
 * Navigazione al match di ricerca su PDF virtualizzato (react-pdf-viewer).
 *
 * Flusso:
 * 1. Un solo goto alla volta (generation id).
 * 2. jumpToPage → aspetta page-layer montata + scroll stabile su `.rpv-core__inner-pages`.
 * 3. Scroll fine diretto su inner-pages verso il box OCR.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { MatchItem } from './usePdfSearch'
import { matchBoxToUnit } from '../utils/matchCoords'

type JumpArea = { id: string; pageIndex: number; left: number; top: number; width: number; height: number }
type UnitBox = { x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }

export interface UsePdfJumpToProps {
	docId?: string
	hostRef: React.MutableRefObject<HTMLDivElement | null>
	scrollHostRef: React.MutableRefObject<HTMLElement | null>
	viewerRef: React.RefObject<any>
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	ensureOverlayRootForPage: (pageNum: number) => boolean
	bumpOverlayTick: () => void
	setActiveSearchMatchId: (matchId: string | null) => void
	setAreas: React.Dispatch<React.SetStateAction<JumpArea[]>>
	/** Propaga la pagina al parent / session store (evita reset a p.1 al remount). */
	onPageChange?: (page: number) => void
}

const INNER_PAGES_SEL = '.rpv-core__inner-pages, [data-testid="core__inner-pages"]'

const resolveInnerPages = (root: HTMLElement | null): HTMLElement | null => {
	if (!root) return null
	return (root.querySelector(INNER_PAGES_SEL) as HTMLElement | null)
		|| (document.querySelector(INNER_PAGES_SEL) as HTMLElement | null)
}

const resolvePageLayer = (searchRoot: ParentNode, page: number): HTMLElement | null => {
	// In rpv: .rpv-core__page-layer > [data-page-number]
	const holder = searchRoot.querySelector(`[data-page-number="${page}"]`) as HTMLElement | null
	if (!holder || !document.contains(holder)) return null

	const layer = (holder.closest('.rpv-core__page-layer') as HTMLElement | null)
		|| (holder.querySelector('.rpv-core__page-layer') as HTMLElement | null)
		|| holder

	const rect = layer.getBoundingClientRect()
	if (rect.width > 0 && rect.height > 0) return layer
	return null
}

/**
 * Aspetta page-layer montata + scroll stabile.
 * Non dichiara idle prima che jumpToPage abbia avuto tempo di partire.
 */
const waitForPageAfterJump = async (
	page: number,
	getScroller: () => HTMLElement | null,
	isCancelled: () => boolean,
	timeoutMs = 15000
): Promise<{ pageEl: HTMLElement | null; scroller: HTMLElement | null }> => {
	const start = Date.now()
	let sawScroll = false
	let lastScrollAt = start

	const scroller0 = getScroller()
	const onScroll = () => {
		sawScroll = true
		lastScrollAt = Date.now()
	}
	scroller0?.addEventListener('scroll', onScroll, { passive: true })

	try {
		while (!isCancelled() && Date.now() - start < timeoutMs) {
			const scroller = getScroller() || scroller0
			const root: ParentNode = scroller || document
			const pageEl = resolvePageLayer(root, page)
			const idleMs = Date.now() - lastScrollAt
			const elapsed = Date.now() - start
			// Soglie basse: pagina già in DOM (doc aperto) o dopo breve jumpToPage.
			const ready = !!pageEl && idleMs >= 50 && (sawScroll || elapsed >= 120)

			if (ready && pageEl) {
				return { pageEl, scroller: scroller || null }
			}

			await new Promise<void>((r) => requestAnimationFrame(() => r()))
		}

		if (isCancelled()) {
			return { pageEl: null, scroller: getScroller() }
		}

		const scroller = getScroller()
		return { pageEl: resolvePageLayer(scroller || document, page), scroller }
	} finally {
		scroller0?.removeEventListener('scroll', onScroll)
	}
}

/** Scroll fine sul box OCR dentro `.rpv-core__inner-pages`. */
const scrollScrollerToMatch = (
	scroller: HTMLElement,
	pageEl: HTMLElement,
	unitBox: UnitBox
): void => {
	const pr = pageEl.getBoundingClientRect()
	const sr = scroller.getBoundingClientRect()
	const matchTop = pr.top + unitBox.y0Pct * pr.height
	const desired = scroller.scrollTop + (matchTop - sr.top) - Math.floor(scroller.clientHeight * 0.3)
	const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
	const target = Math.max(0, Math.min(max, desired))
	// Instant: lo smooth (~1s) ritardava l'apertura delle fonti entità.
	scroller.scrollTo({ top: target, left: scroller.scrollLeft, behavior: 'auto' })
}

export const usePdfJumpTo = ({
	docId,
	hostRef,
	scrollHostRef,
	viewerRef,
	overlayRootsRef,
	ensureOverlayRootForPage,
	bumpOverlayTick,
	setActiveSearchMatchId,
	setAreas,
	onPageChange
}: UsePdfJumpToProps) => {
	const generationRef = useRef(0)

	const goToMatch = useCallback(async (m: MatchItem) => {
		const generation = ++generationRef.current
		const isCancelled = () => generationRef.current !== generation

		if (typeof m.page !== 'number' || m.page < 1) {
			throw new Error(`[GOTO] pagina invalida: ${m.page}`)
		}

		const getScroller = () =>
			resolveInnerPages(hostRef.current)
			|| resolveInnerPages(scrollHostRef.current)
			|| resolveInnerPages(document.body)

		if (typeof viewerRef.current?.jumpToPage !== 'function') {
			throw new Error('[GOTO] jumpToPage non disponibile sul viewer')
		}
		viewerRef.current.jumpToPage(m.page)
		onPageChange?.(m.page)

		const { pageEl, scroller } = await waitForPageAfterJump(m.page, getScroller, isCancelled)
		if (isCancelled()) return
		if (!pageEl) {
			throw new Error(`[GOTO] page-layer non trovata per pagina ${m.page}`)
		}

		// Solo salto pagina: niente rettangolo finto se mancano coordinate affidabili.
		if (!m.rects?.length) {
			setActiveSearchMatchId(null)
			const sc = scroller || getScroller()
			if (sc) {
				scrollScrollerToMatch(sc, pageEl, { x0Pct: 0, y0Pct: 0.15, x1Pct: 1, y1Pct: 0.25 })
			}
			bumpOverlayTick()
			return
		}

		setActiveSearchMatchId(m.id)
		ensureOverlayRootForPage(m.page)
		bumpOverlayTick()

		const overlayDeadline = Date.now() + 2500
		while (Date.now() < overlayDeadline) {
			if (isCancelled()) return
			const root = overlayRootsRef.current.get(m.page)
			if (root && document.contains(root)) break
			ensureOverlayRootForPage(m.page)
			await new Promise((r) => requestAnimationFrame(() => r(null)))
		}
		if (isCancelled()) return

		bumpOverlayTick()
		await new Promise((r) => setTimeout(r, 40))
		if (isCancelled()) return

		const unitBox = matchBoxToUnit({
			x0Pct: m.x0Pct ?? 0,
			y0Pct: m.y0Pct ?? 0,
			x1Pct: m.x1Pct ?? 0,
			y1Pct: m.y1Pct ?? 0
		})

		const sc = scroller || getScroller()
		if (!sc) {
			throw new Error('[GOTO] scroller .rpv-core__inner-pages non trovato')
		}

		scrollScrollerToMatch(sc, pageEl, unitBox)
		bumpOverlayTick()
	}, [
		bumpOverlayTick,
		ensureOverlayRootForPage,
		hostRef,
		onPageChange,
		overlayRootsRef,
		scrollHostRef,
		setActiveSearchMatchId,
		viewerRef
	])

	useEffect(() => {
		const handler = async (ev: Event) => {
			const detail = (ev as CustomEvent).detail || {}
			if (!detail || (detail.docId && detail.docId !== (docId || 'current'))) return
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

	return { goToMatch }
}
