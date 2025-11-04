import React from 'react'
import { GripVertical, X } from 'lucide-react'
import { SearchProvider } from '../../../search/SearchProvider'
import { SearchPanelTree } from '../../../search/SearchPanelTree'
import { cryptoRandom } from '../../../../utils/misc'

interface SearchPanelProps {
	showAdvanced: boolean
	setShowAdvanced: (show: boolean) => void
	panelW: number
	resizingRef: React.MutableRefObject<boolean>
	searchQ: string
	docId?: string
	fileUrl: string
	totalPages: number
	setMatches: (matches: any[]) => void
	goToMatch: (match: any) => Promise<void>
	searchCacheRef: React.MutableRefObject<Map<string, any[]>>
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
	showAdvanced,
	setShowAdvanced,
	panelW,
	resizingRef,
	searchQ,
	docId,
	fileUrl,
	totalPages,
	setMatches,
	goToMatch,
	searchCacheRef
}) => {
	if (!showAdvanced) return null

	return (
		<React.Fragment>
			{/* ✅ Slider stretto, trasparente, colorato solo al hover */}
			<div
				onMouseDown={(e) => {
					if (e.button !== 0) return
					e.preventDefault()
					e.stopPropagation()
					resizingRef.current = true
					document.body.style.cursor = 'col-resize'
					document.body.style.userSelect = 'none'
				}}
				className="group cursor-col-resize transition-colors hover:bg-blue-400 bg-transparent flex items-center justify-center"
				style={{
					width: '6px',
					minWidth: '6px',
					height: '100%',
					position: 'relative',
					zIndex: 1000,
					userSelect: 'none',
					touchAction: 'none'
				}}
				title="Trascina per ridimensionare"
			>
				<GripVertical size={12} className="text-transparent group-hover:text-blue-700 transition-colors" />
			</div>
			<div className="h-full border-l bg-white flex flex-col overflow-hidden" style={{ width: panelW }}>
				{/* Header pannello ricerca con X per chiudere - FISSO */}
				<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
					<h3 className="font-semibold text-sm">Risultati ricerca</h3>
					<button
						className="p-1 hover:bg-gray-200 rounded"
						title="Chiudi pannello"
						onClick={() => setShowAdvanced(false)}
					>
						<X size={18} />
					</button>
				</div>

				<SearchProvider defaultScope={'current'} initialQuery={searchQ} autoSearch={true} onSearch={async (q, _scope) => {
					console.log('[SEARCH][document] Backend search start', { q, docId, fileUrl: fileUrl?.substring(0, 100) })

					try {
						// ✅ USA LA STESSA API DELL'ARCHIVIO!
						const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
						const response = await fetch(`${apiUrl}/api/search/archive?q=${encodeURIComponent(q)}&docId=${docId}`)

						if (!response.ok) {
							console.error('[SEARCH][document] API response not OK', { status: response.status, statusText: response.statusText })
							throw new Error('Search failed')
						}
						const data = await response.json()

						console.log('[SEARCH][document] API response', {
							total: data.total,
							matches: data.matches?.length,
							sampleMatches: data.matches?.slice(0, 3).map((m: any) => ({
								page: m.page,
								snippet: m.snippet?.substring(0, 50),
								charIdx: m.charIdx
							}))
						})

						// Converti i risultati nel formato atteso
						const found = data.matches || []
						setMatches(found)

						// ✅ Quando scope è 'current', usa title vuoto per nascondere l'header documento
						const actualDocId = docId || 'current'
						console.log('[SEARCH][provider][onSearch]', {
							docId: actualDocId,
							q,
							foundCount: found.length,
							scope: 'current'
						})

						const groups = [{
							doc: {
								id: actualDocId,
								title: '', // ✅ Vuoto per scope 'current' - non mostra header documento
								hash: '',
								pages: totalPages,
								kind: 'pdf' as const
							},
							matches: found.map((m: any) => ({
								id: m.id,
								docId: actualDocId,
								docTitle: '', // Non necessario per scope current
								kind: 'pdf' as const,
								page: m.page,
								q: q,
								x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct,
								charIdx: m.charIdx, qLength: m.qLen,
								snippet: m.snippet,
								score: 0,
							}))
						}]

						return { id: cryptoRandom(), query: q, scope: 'current' as any, total: found.length, groups } as any

					} catch (error) {
						console.error('[SEARCH][document] API error', error)
						return { id: cryptoRandom(), query: q, scope: 'current' as any, total: 0, groups: [] } as any
					}
				}} adapterFactory={() => ({
					goToMatch: async (m: any) => {
						// ✅ LOG CRITICO: verifica page prima di passarlo
						if (typeof m.page !== 'number' || m.page < 1) {
							console.error('[SEARCH][adapter] ❌ INVALID PAGE IN MATCH:', { page: m.page, match: m })
							return
						}

						const mi = { id: m.id, page: m.page, snippet: m.snippet, x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct, charIdx: m.charIdx, qLen: m.qLength } as any
						try {
							await (goToMatch as any)(mi)
						} catch (error) {
							console.error('[SEARCH][adapter] goToMatch error:', error)
						}
						// disegna rettangoli sugli hit correnti (dalla cache dell'ultima ricerca)
						try {
							const cacheKey = `${fileUrl}::${(m.q || '').toLowerCase()}::${docId || 'no-doc'}`
							const cached = searchCacheRef.current.get(cacheKey) || []
							const matches = cached.map((mm: any) => ({ page: mm.page, x0Pct: mm.x0Pct, y0Pct: mm.y0Pct, x1Pct: mm.x1Pct, y1Pct: mm.y1Pct }))
							// drawOcrRects(matches.filter(Boolean)) // Ora gestito dal componente OcrInspector
							const box = [{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }]
							const paint = () => { try { /* drawOcrRects(box) */ } catch { } } // Ora gestito dal componente OcrInspector
							paint(); setTimeout(paint, 100); setTimeout(paint, 300)
						} catch { }
					}
				})}>
					<SearchPanelTree showInput={true} showScopeSelector={false} initialQuery={searchQ} />
				</SearchProvider>
			</div>
		</React.Fragment>
	)
}