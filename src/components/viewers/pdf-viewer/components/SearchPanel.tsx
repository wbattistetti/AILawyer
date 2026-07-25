/**
 * Adapter PDF per il pannello di ricerca documentale condiviso.
 */

import React, { useMemo } from 'react'
import { DocumentSearchPanel } from '../../../search/DocumentSearchPanel'
import { searchDocument } from '../../../search/searchApi'
import type { DocumentSearchAdapter } from '../../../search/types'

export interface SearchPanelProps {
	showAdvanced: boolean
	setShowAdvanced: (show: boolean) => void
	panelW: number
	resizingRef: React.MutableRefObject<boolean>
	searchQ: string
	setSearchQ: (query: string) => void
	docId?: string
	documentHash?: string
	storageKey?: string
	documentTitle?: string
	fileUrl: string
	totalPages: number
	setMatches: (matches: any[]) => void
	setActiveSearchMatchId?: (matchId: string | null) => void
	goToMatch: (match: any) => Promise<void>
	searchCacheRef: React.MutableRefObject<Map<string, any[]>>
	isActive?: boolean
	searchPluginInstance?: unknown
}

/**
 * Collega il backend e la navigazione PDF al pannello condiviso.
 */
export const SearchPanel = React.memo(function SearchPanel({
	showAdvanced,
	setShowAdvanced,
	panelW,
	resizingRef,
	searchQ,
	setSearchQ,
	docId,
	documentHash,
	storageKey,
	documentTitle,
	fileUrl,
	totalPages,
	setMatches,
	setActiveSearchMatchId,
	goToMatch,
	searchCacheRef
}: SearchPanelProps) {
	const actualDocId = docId || 'current'
	const adapter = useMemo<DocumentSearchAdapter>(() => ({
		document: {
			id: actualDocId,
			title: documentTitle || '',
			hash: documentHash || '',
			pages: totalPages,
			kind: 'pdf'
		},
		search: async (query) => {
			if (!docId) {
				throw new Error('Impossibile cercare nel PDF: identificativo documento mancante')
			}
			const found = await searchDocument(query, {
				locator: {
					id: docId,
					...(documentHash ? { hash: documentHash } : {}),
					...(storageKey ? { storageKey } : {}),
					...(documentTitle ? { filename: documentTitle } : {})
				},
				documentKind: 'pdf',
				documentTitle
			})
			const legacyMatches = found.map((match) => ({
				id: match.id,
				page: match.page,
				snippet: match.snippet,
				x0Pct: match.x0Pct,
				x1Pct: match.x1Pct,
				y0Pct: match.y0Pct,
				y1Pct: match.y1Pct,
				rects: match.rects,
				charIdx: match.charIdx ?? 0,
				qLen: match.qLength ?? query.length
			}))
			setMatches(legacyMatches)
			setActiveSearchMatchId?.(null)
			searchCacheRef.current.set(`${fileUrl}::${query.toLowerCase()}::${docId}`, legacyMatches)
			return found
		},
		goToMatch: async (match) => {
			await goToMatch({
				id: match.id,
				page: match.page,
				snippet: match.snippet,
				x0Pct: match.x0Pct,
				x1Pct: match.x1Pct,
				y0Pct: match.y0Pct,
				y1Pct: match.y1Pct,
				rects: match.rects,
				charIdx: match.charIdx ?? 0,
				qLen: match.qLength ?? match.q.length
			})
		}
	}), [
		actualDocId,
		docId,
		documentHash,
		documentTitle,
		fileUrl,
		goToMatch,
		searchCacheRef,
		setActiveSearchMatchId,
		setMatches,
		storageKey,
		totalPages
	])

	return (
		<DocumentSearchPanel
			adapter={adapter}
			isOpen={showAdvanced}
			onOpenChange={setShowAdvanced}
			width={panelW}
			resizingRef={resizingRef}
			query={searchQ}
			onQueryChange={setSearchQ}
			enableExpandedContext
			copyPageTextOnNavigate
		/>
	)
})
