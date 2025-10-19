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
	searchPluginInstance: any
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
	searchPluginInstance,
	goToMatch,
	searchCacheRef
}) => {
	if (!showAdvanced) return null

	return (
		<React.Fragment>
			<div onMouseDown={()=>{ resizingRef.current = true; document.body.style.cursor = 'ew-resize' }} className="w-1.5 cursor-col-resize bg-transparent hover:bg-blue-300" title="Ridimensiona">
				<GripVertical size={12} className="mx-auto text-gray-400" />
			</div>
			<div className="h-full border-l bg-white flex flex-col" style={{ width: panelW }}>
				{/* Header pannello ricerca con X per chiudere */}
				<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
					<h3 className="font-semibold text-sm">Risultati ricerca</h3>
					<button 
						className="p-1 hover:bg-gray-200 rounded" 
						title="Chiudi pannello"
						onClick={()=>setShowAdvanced(false)}
					>
						<X size={18} />
					</button>
				</div>
					
				<SearchProvider defaultScope={'current'} initialQuery={searchQ} autoSearch={true} onSearch={async(q, _scope)=>{
					console.log('[SEARCH][document] Backend search start', { q, docId })
					
					try {
						// ✅ USA LA STESSA API DELL'ARCHIVIO!
						const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
						const response = await fetch(`${apiUrl}/search/archive?q=${encodeURIComponent(q)}&docId=${docId}`)
						
						if (!response.ok) throw new Error('Search failed')
						const data = await response.json()
						
						console.log('[SEARCH][document] API response', { total: data.total, matches: data.matches?.length })
						
						// Converti i risultati nel formato atteso
						const found = data.matches || []
						setMatches(found)
						
						const docTitle = (fileUrl?.split('/')?.pop() || 'Documento') as string
						const actualDocId = docId || 'current'
						console.log('[SEARCH][provider][onSearch]', { docId: actualDocId, q, foundCount: found.length })
						
						const groups = [{ doc: { id: actualDocId, title: docTitle, hash: '', pages: totalPages, kind: 'pdf' as const }, matches: found.map((m: any)=>({
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
						})) }]
						
						return { id: cryptoRandom(), query: q, scope: 'current' as any, total: found.length, groups } as any
						
					} catch (error) {
						console.error('[SEARCH][document] API error', error)
						return { id: cryptoRandom(), query: q, scope: 'current' as any, total: 0, groups: [] } as any
					}
				}} adapterFactory={() => ({
					goToMatch: async (m: any) => {
						try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: m.q }) } catch {}
						const mi = { id: m.id, page: m.page, snippet: m.snippet, x0Pct: m.x0Pct, x1Pct: m.x1Pct, y0Pct: m.y0Pct, y1Pct: m.y1Pct, charIdx: m.charIdx, qLen: m.qLength } as any
						await (goToMatch as any)(mi)
						// disegna rettangoli sugli hit correnti (dalla cache dell'ultima ricerca)
						try {
							const cacheKey = `${fileUrl}::${(m.q||'').toLowerCase()}::${docId || 'no-doc'}`
							const cached = searchCacheRef.current.get(cacheKey) || []
							const matches = cached.map((mm:any)=>({ page:mm.page, x0Pct:mm.x0Pct, y0Pct:mm.y0Pct, x1Pct:mm.x1Pct, y1Pct:mm.y1Pct }))
							// drawOcrRects(matches.filter(Boolean)) // Ora gestito dal componente OcrInspector
							const box = [{ page: m.page, x0Pct: m.x0Pct, y0Pct: m.y0Pct, x1Pct: m.x1Pct, y1Pct: m.y1Pct }]
							const paint = () => { try { /* drawOcrRects(box) */ } catch {} } // Ora gestito dal componente OcrInspector
							paint(); setTimeout(paint, 100); setTimeout(paint, 300)
						} catch {}
					}
				})}>
					<SearchPanelTree showInput={true} showScopeSelector={false} initialQuery={searchQ} />
				</SearchProvider>
			</div>
		</React.Fragment>
	)
}