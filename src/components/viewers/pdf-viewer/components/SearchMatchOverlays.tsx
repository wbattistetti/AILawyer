/**
 * Evidenzia i match di ricerca sulle pagine attualmente montate dal virtualizzatore.
 * Non forza overlay su pagine fuori dalla finestra virtuale (evita spam e race).
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { MatchItem } from '../hooks/usePdfSearch'

interface SearchMatchOverlaysProps {
	matches: MatchItem[]
	activeMatchId: string | null
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	/** Forza il re-render quando i root pagina diventano disponibili. */
	overlayTick: number
	ensureOverlayRootForPage?: (pageNum: number) => boolean
	onOverlayRootsChanged?: () => void
}

const ACTIVE_STYLE: React.CSSProperties = {
	background: 'rgba(96, 165, 250, 0.45)',
	border: '2px solid rgba(29, 78, 216, 0.95)',
	zIndex: 14
}

const INACTIVE_STYLE: React.CSSProperties = {
	background: 'rgba(96, 165, 250, 0.28)',
	border: '1px solid rgba(59, 130, 246, 0.55)',
	zIndex: 12
}

/** Pagine con holder montato nel DOM (finestra del virtualizzatore). */
const listMountedPages = (): Set<number> => {
	const pages = new Set<number>()
	for (const el of Array.from(document.querySelectorAll('[data-page-number]'))) {
		const n = parseInt(el.getAttribute('data-page-number') || '', 10)
		if (Number.isFinite(n) && n > 0) pages.add(n)
	}
	return pages
}

/**
 * Disegna i match sulle pagine vive; il match attivo ha bordo scuro.
 */
export const SearchMatchOverlays: React.FC<SearchMatchOverlaysProps> = ({
	matches,
	activeMatchId,
	overlayRootsRef,
	overlayTick,
	ensureOverlayRootForPage,
	onOverlayRootsChanged
}) => {
	useEffect(() => {
		if (!activeMatchId || !ensureOverlayRootForPage) return

		const active = matches.find((m) => m.id === activeMatchId)
		const mounted = listMountedPages()
		const pagesToEnsure = new Set<number>()

		// Priorità: pagina del match attivo
		if (active?.page) pagesToEnsure.add(active.page)

		// Poi solo pagine già montate che hanno match
		for (const match of matches) {
			if (mounted.has(match.page)) pagesToEnsure.add(match.page)
		}

		let created = false
		for (const page of pagesToEnsure) {
			if (ensureOverlayRootForPage(page)) created = true
		}
		if (created) onOverlayRootsChanged?.()
	}, [activeMatchId, matches, ensureOverlayRootForPage, onOverlayRootsChanged, overlayTick])

	if (!activeMatchId || matches.length === 0) return null

	return (
		<>
			{matches.flatMap((match) => {
				if (!match.rects?.length) return []
				const root = overlayRootsRef.current.get(match.page)
				if (!root || !document.contains(root)) return []

				const isActive = match.id === activeMatchId
				const tone = isActive ? ACTIVE_STYLE : INACTIVE_STYLE

				return match.rects.map((rect, rectIndex) => createPortal(
					<div
						key={`${match.id}-${rectIndex}`}
						data-search-match-id={match.id}
						data-search-match-active={isActive ? 'true' : 'false'}
						style={{
							position: 'absolute',
							left: `${rect.x0Pct}%`,
							top: `${rect.y0Pct}%`,
							width: `${Math.max(0, rect.x1Pct - rect.x0Pct)}%`,
							height: `${Math.max(0, rect.y1Pct - rect.y0Pct)}%`,
							borderRadius: 2,
							boxSizing: 'border-box',
							pointerEvents: 'none',
							...tone
						}}
					/>,
					root,
					`${match.id}-${rectIndex}`
				))
			})}
		</>
	)
}
