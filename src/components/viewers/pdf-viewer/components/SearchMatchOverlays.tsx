/**
 * Renderizza i rettangoli OCR del risultato di ricerca attivo sulla pagina PDF.
 */

import React from 'react'
import { createPortal } from 'react-dom'
import type { MatchItem } from '../hooks/usePdfSearch'

interface SearchMatchOverlaysProps {
	matches: MatchItem[]
	activeMatchId: string | null
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	/** Forza il re-render quando i root pagina diventano disponibili. */
	overlayTick: number
}

/**
 * Disegna solo il match selezionato, usando coordinate canoniche 0-100 sulla pagina.
 */
export const SearchMatchOverlays: React.FC<SearchMatchOverlaysProps> = ({
	matches,
	activeMatchId,
	overlayRootsRef,
	overlayTick
}) => {
	void overlayTick
	if (!activeMatchId) return null

	const activeMatch = matches.find((match) => match.id === activeMatchId)
	if (!activeMatch || activeMatch.rects.length === 0) return null

	const root = overlayRootsRef.current.get(activeMatch.page)
	if (!root || !document.contains(root)) return null

	return (
		<>
			{activeMatch.rects.map((rect, rectIndex) => createPortal(
				<div
					key={`${activeMatch.id}-${rectIndex}`}
					data-search-match-id={activeMatch.id}
					style={{
						position: 'absolute',
						left: `${rect.x0Pct}%`,
						top: `${rect.y0Pct}%`,
						width: `${Math.max(0, rect.x1Pct - rect.x0Pct)}%`,
						height: `${Math.max(0, rect.y1Pct - rect.y0Pct)}%`,
						background: 'rgba(96, 165, 250, 0.42)',
						border: '2px solid rgba(37, 99, 235, 0.9)',
						borderRadius: 2,
						boxSizing: 'border-box',
						pointerEvents: 'none',
						zIndex: 12
					}}
				/>,
				root,
				`${activeMatch.id}-${rectIndex}`
			))}
		</>
	)
}
