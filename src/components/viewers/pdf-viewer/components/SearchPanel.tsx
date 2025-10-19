import React from 'react'
import { X, GripVertical } from 'lucide-react'
import { SearchProvider } from '../../../search/SearchProvider'
import { SearchPanelTree } from '../../../search/SearchPanelTree'
import { MatchItem } from '../types'

interface SearchPanelProps {
	searchQ: string
	totalPages: number
	docId?: string
	fileUrl: string
	panelW: number
	onPanelWidthChange: (width: number) => void
	onSearch: (q: string) => Promise<MatchItem[]>
	onGoToMatch: (match: any) => Promise<void>
	onJumpToMatch: (match: any) => void
	showAdvanced: boolean
	onShowAdvancedChange: (show: boolean) => void
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
	searchQ,
	totalPages,
	docId,
	fileUrl,
	panelW,
	onPanelWidthChange,
	onSearch,
	onGoToMatch,
	onJumpToMatch,
	showAdvanced,
	onShowAdvancedChange
}) => {
	return (
		<React.Fragment>
			<div onMouseDown={() => { resizingRef.current = true; document.body.style.cursor = 'ew-resize' }} className="w-1.5 cursor-col-resize bg-transparent hover:bg-blue-300" title="Ridimensiona">
				<GripVertical size={12} className="mx-auto text-gray-400" />
			</div>
			<div className="h-full border-l bg-white flex flex-col" style={{ width: panelW }}>
				{/* Header pannello ricerca con X per chiudere */}
				<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
					<h3 className="font-semibold text-sm">Risultati ricerca</h3>
					<button
						className="p-1 hover:bg-gray-200 rounded"
						title="Chiudi pannello"
						onClick={() => onShowAdvancedChange(false)}
					>
						<X size={18} />
					</button>
				</div>

				<SearchProvider
					defaultScope={'current'}
					initialQuery={searchQ}
					autoSearch={true}
					onSearch={async (q, _scope) => {
						const found = await onSearch(q)
						const docTitle = (fileUrl?.split('/')?.pop() || 'Documento') as string
						const actualDocId = docId || 'current'
						console.log('[SEARCH][provider][onSearch]', { docId: actualDocId, q, foundCount: found?.length || 0 })
						const groups = [{
							doc: { id: actualDocId, title: docTitle, hash: '', pages: totalPages, kind: 'pdf' as const },
							matches: (found || []).map((m) => ({
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
							}))
						}]
						return { id: cryptoRandom(), query: q, scope: 'current' as any, total: (found || []).length, groups } as any
					}}
					adapterFactory={() => ({
						goToMatch: async (m: any) => {
							try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: m.q }) } catch {}
							const mi = { id: m.id, page: m.page, snippet: m.snippet, x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct, charIdx: m.charIdx, qLen: m.qLength } as any
							await onGoToMatch(mi)
							// disegna rettangoli sugli hit correnti (dalla cache dell'ultima ricerca)
							try {
								const cacheKey = `${fileUrl}::${(m.q||'').toLowerCase()}::${docId || 'no-doc'}`
								const cached = searchCacheRef.current.get(cacheKey) || []
								const matches = cached.map((mm:any)=>({ page:mm.page, x0Pct:mm.x0Pct, y0Pct:mm.y0Pct, x1Pct:mm.x1Pct, y1Pct:mm.y1Pct }))
								drawOcrRects(matches.filter(Boolean))
								const box = [{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }]
								const paint = () => { try { drawOcrRects(box) } catch {} }
								paint(); setTimeout(paint, 100); setTimeout(paint, 300)
							} catch {}
						}
					})}
				>
					<SearchPanelTree showInput={true} showScopeSelector={false} initialQuery={searchQ} />
				</SearchProvider>
			</div>
		</React.Fragment>
	)
}
