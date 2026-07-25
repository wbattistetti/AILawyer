/**
 * Gestisce overlay e select root ancorati alla pagina PDF intera.
 * Le coordinate OCR/selezione usano percentuali 0-1 relative al page-layer.
 */

import { useEffect, useRef, useState } from 'react'

export interface UsePdfOverlaysProps {
	hostRef: React.RefObject<HTMLElement>
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	viewerReadyTick?: number
}

export interface UsePdfOverlaysReturn {
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	selectRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	selectTick: number
	setSelectTick: (tick: number | ((prev: number) => number)) => void
	ensureOverlayRootForPage: (pageNum: number) => boolean
}

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
	position: 'absolute',
	inset: '0',
	width: '100%',
	height: '100%',
	pointerEvents: 'none',
	zIndex: '100'
}

/**
 * Crea o aggiorna il root overlay a piena pagina sul page-layer.
 */
function createOverlayRootForPage(
	pageNum: number,
	pageLayer: HTMLElement,
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
): boolean {
	if (!document.contains(pageLayer)) return false

	if (!pageLayer.style.position) pageLayer.style.position = 'relative'

	const existing = overlayRootsRef.current.get(pageNum)
	if (existing && document.contains(existing) && existing.parentElement === pageLayer) {
		Object.assign(existing.style, OVERLAY_STYLE)
		return false
	}
	if (existing) {
		existing.remove()
		overlayRootsRef.current.delete(pageNum)
	}

	const over = document.createElement('div')
	over.className = 'ai-overlay-root'
	Object.assign(over.style, OVERLAY_STYLE)
	pageLayer.appendChild(over)
	overlayRootsRef.current.set(pageNum, over)
	return true
}

function createSelectRootForPage(
	pageNum: number,
	pageLayer: HTMLElement,
	selectRootsRef: React.MutableRefObject<Map<number, HTMLElement>>,
	selectMode: boolean,
	selectKind: 'NATIVE' | 'OCR'
): boolean {
	if (!document.contains(pageLayer)) return false

	if (selectRootsRef.current.has(pageNum)) {
		const existing = selectRootsRef.current.get(pageNum)!
		if (document.contains(existing)) return false
		selectRootsRef.current.delete(pageNum)
	}

	const sel = document.createElement('div')
	sel.className = 'ai-select-root'
	if (!pageLayer.style.position) pageLayer.style.position = 'relative'
	pageLayer.appendChild(sel)
	selectRootsRef.current.set(pageNum, sel)
	Object.assign(sel.style, {
		position: 'absolute',
		inset: '0',
		zIndex: '2000',
		userSelect: 'none',
		cursor: (selectMode && selectKind === 'OCR') ? 'crosshair' : '',
		pointerEvents: (selectMode && selectKind === 'OCR') ? 'auto' : 'none',
		touchAction: (selectMode && selectKind === 'OCR') ? ('none' as any) : ''
	} as any)
	return true
}

function getPageNumber(element: HTMLElement): number | null {
	const holder = element.closest('[data-page-number]') as HTMLElement | null
	if (holder) {
		const parsed = parseInt(holder.getAttribute('data-page-number') || '', 10)
		if (Number.isFinite(parsed) && parsed > 0) return parsed
	}
	let p: HTMLElement | null = element
	for (let i = 0; i < 5 && p; i++) {
		const aria = p.getAttribute('aria-label') || ''
		const m = aria.match(/\bP(?:age|agina)\s+(\d+)/i)
		if (m) {
			const parsed = parseInt(m[1], 10)
			if (Number.isFinite(parsed) && parsed > 0) return parsed
		}
		p = p.parentElement as HTMLElement | null
	}
	return null
}

function findPageLayer(host: HTMLElement, pageNum: number): HTMLElement | null {
	const holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
	for (const holder of holders) {
		const pageNumAttr = parseInt(holder.getAttribute('data-page-number') || '', 10)
		if (pageNumAttr !== pageNum) continue
		const found = holder.querySelector('.rpv-core__page-layer') as HTMLElement | null
		if (found && document.contains(found)) return found
	}

	const layers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
	for (const layer of layers) {
		if (!document.contains(layer)) continue
		if (getPageNumber(layer) === pageNum) return layer
	}
	return null
}

export function usePdfOverlays({
	hostRef,
	selectMode,
	selectKind,
	viewerReadyTick = 0
}: UsePdfOverlaysProps): UsePdfOverlaysReturn {
	const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const selectRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
	const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
	const [selectTick, setSelectTick] = useState<number>(0)
	const lastLogTimeRef = useRef<Map<number, number>>(new Map())

	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		let added = 0

		const ensurePageLayers = () => {
			const holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
			const layers = holders.length === 0
				? Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
				: []

			for (const holder of holders.length > 0 ? holders : layers) {
				const pageNum = holders.length > 0
					? parseInt(holder.getAttribute('data-page-number') || '', 10)
					: getPageNumber(holder)

				if (!pageNum || pageNum <= 0) continue

				const pageLayer = holders.length > 0
					? holder.querySelector('.rpv-core__page-layer') as HTMLElement | null
					: holder

				if (!pageLayer || !document.contains(pageLayer)) continue

				pageElsRef.current.set(pageNum, pageLayer)
				elToPageRef.current.set(pageLayer, pageNum)

				if (createSelectRootForPage(pageNum, pageLayer, selectRootsRef, selectMode, selectKind)) {
					added++
				}
				if (createOverlayRootForPage(pageNum, pageLayer, overlayRootsRef)) {
					added++
				}
			}
		}

		const pageObserver = new MutationObserver(() => {
			ensurePageLayers()
			if (added > 0) {
				setSelectTick((tick) => tick + 1)
				added = 0
			}
		})

		ensurePageLayers()
		if (added > 0) {
			setSelectTick((tick) => tick + 1)
			added = 0
		}

		pageObserver.observe(host, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['style', 'class', 'data-page-number']
		})

		const onAny = () => {
			ensurePageLayers()
		}
		const scs = [
			host.querySelector('.rpv-core__inner') as HTMLElement | null,
			host.querySelector('.rpv-core__pages') as HTMLElement | null,
			host.querySelector('.rpv-core__viewer') as HTMLElement | null
		].filter(Boolean) as HTMLElement[]
		scs.forEach((sc) => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
		window.addEventListener('resize', onAny)

		return () => {
			pageObserver.disconnect()
			scs.forEach((sc) => sc.removeEventListener('scroll', onAny, { capture: true } as any))
			window.removeEventListener('resize', onAny)
		}
	}, [selectMode, selectKind, hostRef, viewerReadyTick])

	const ensureOverlayRootForPage = (pageNum: number): boolean => {
		const host = hostRef.current
		if (!host) {
			console.warn('[OVERLAYS] Host non disponibile per ensureOverlayRootForPage:', pageNum)
			return false
		}

		if (overlayRootsRef.current.has(pageNum)) {
			const existingRoot = overlayRootsRef.current.get(pageNum)!
			if (!document.contains(existingRoot)) {
				overlayRootsRef.current.delete(pageNum)
			} else {
				return false
			}
		}

		let pageLayer = pageElsRef.current.get(pageNum) || null
		if (pageLayer && !document.contains(pageLayer)) {
			pageElsRef.current.delete(pageNum)
			pageLayer = null
		}
		if (!pageLayer) {
			pageLayer = findPageLayer(host, pageNum)
			if (pageLayer) pageElsRef.current.set(pageNum, pageLayer)
		}

		if (pageLayer && document.contains(pageLayer)) {
			return createOverlayRootForPage(pageNum, pageLayer, overlayRootsRef)
		}

		const now = Date.now()
		const lastLogTime = lastLogTimeRef.current.get(pageNum) || 0
		if (now - lastLogTime > 2000) {
			lastLogTimeRef.current.set(pageNum, now)
			console.warn('[OVERLAYS] Page layer non trovato per pagina:', pageNum)
		}
		return false
	}

	return {
		overlayRootsRef,
		selectRootsRef,
		pageElsRef,
		elToPageRef,
		selectTick,
		setSelectTick,
		ensureOverlayRootForPage
	}
}
