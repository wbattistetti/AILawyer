import React from 'react'
import { Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, PanelRightOpen } from 'lucide-react'
import { Tool } from '../hooks/usePdfAnnotations'

interface PdfToolbarAdvancedProps {
	// Toolbar state
	tool: Tool
	setTool: (tool: Tool | ((prev: Tool) => Tool)) => void
	audit: boolean
	setAudit: (audit: boolean) => void
	autoDeskew: boolean
	setAutoDeskew: (deskew: boolean) => void
	skewAngles: Record<number, number>
	setSkewAngles: (angles: Record<number, number>) => void
	pageInput: string
	selectKind: 'NATIVE' | 'OCR'
	setSelectKind: (kind: 'NATIVE' | 'OCR') => void
	zoomPct: number
	setZoomPct: (zoom: number) => void
	scaleRef: React.MutableRefObject<number>
	zoomDebounceRef: React.MutableRefObject<number | null>
	hostRef: React.RefObject<HTMLElement>
	showAdvanced: boolean
	setShowAdvanced: (show: boolean) => void

	// Functions
	estimateSkewForPage: (page: number) => Promise<number>
	persistSkew: (angles: Record<number, number>) => void
	applyImmediateToPage: (page: number, angle: number) => void
	zoomTo: (scale: number) => void
}

export const PdfToolbarAdvanced: React.FC<PdfToolbarAdvancedProps> = ({
	tool,
	setTool,
	audit,
	setAudit,
	autoDeskew,
	setAutoDeskew,
	skewAngles,
	setSkewAngles,
	pageInput,
	selectKind,
	setSelectKind,
	zoomPct,
	setZoomPct,
	scaleRef,
	zoomDebounceRef,
	hostRef,
	showAdvanced,
	setShowAdvanced,
	estimateSkewForPage,
	persistSkew,
	applyImmediateToPage,
	zoomTo
}) => {
	return (
		<div className="flex items-center justify-between p-2 border-b bg-background flex-shrink-0">
			<div className="flex items-center gap-2">
				{/* Pulsante per aprire il pannello quando è chiuso */}
				{!showAdvanced && (
					<div className="flex items-center gap-2">
						<button className="px-2 py-1 border rounded" title="Apri pannello ricerca" onClick={()=>setShowAdvanced(true)}>
							<PanelRightOpen size={16} />
						</button>
					</div>
				)}

				{/* Pulsante per chiudere il pannello quando è aperto */}
				{showAdvanced && (
					<button
						className="px-2 py-1 border rounded bg-accent text-accent-foreground hover:bg-accent/80"
						title="Chiudi pannello ricerca"
						onClick={()=>setShowAdvanced(false)}
					>
						<PanelRightOpen size={16} className="rotate-180" />
					</button>
				)}

				<div className="flex items-center gap-2">
					<button className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${tool==='highlight'?'bg-accent text-accent-foreground border-border':''}`} title="Evidenzia" onClick={()=>setTool(tool==='highlight'?'none':'highlight')}>
						<Highlighter size={16} />
					</button>
					<button className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${tool==='underline'?'bg-accent text-accent-foreground border-border':''}`} title="Sottolinea" onClick={()=>setTool(tool==='underline'?'none':'underline')}>
						<UnderlineIcon size={16} />
					</button>
					<button className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${tool==='strike'?'bg-accent text-accent-foreground border-border':''}`} title="Barra" onClick={()=>setTool(tool==='strike'?'none':'strike')}>
						<StrikethroughIcon size={16} />
					</button>
					<button className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${audit?'bg-accent text-accent-foreground border-border':''}`} title="Audit mode (testo digitale)" onClick={()=>setAudit(a=>!a)}>Audit</button>
					<button className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${tool==='comment'?'bg-accent text-accent-foreground border-border':''}`} title="Commento" onClick={()=>setTool(tool==='comment'?'none':'comment')}>
						<MessageSquare size={16} />
					</button>
					<button
						className={`px-2 py-1 rounded border bg-background text-foreground hover:bg-muted ${autoDeskew ? 'bg-accent text-accent-foreground border-border' : ''}`}
						title={autoDeskew ? 'Raddrizza: ON' : 'Raddrizza quando serve'}
						onClick={async()=>{
							const next = !autoDeskew
							try { console.log('[DESKEW][toggle]', { next }) } catch {}
							setAutoDeskew(next)
							if (next) {
								const p = Math.max(1, parseInt(pageInput || '1', 10))
								try { console.log('[DESKEW][estimate][start]', { page: p }) } catch {}
								if (!skewAngles[p]) {
									const ang = await estimateSkewForPage(p)
									try { console.log('[DESKEW][estimate][done]', { page: p, angle: ang }) } catch {}
									setSkewAngles(prev => { const n = { ...prev, [p]: ang }; persistSkew(n); return n })
									applyImmediateToPage(p, ang)
								} else {
									const ang = skewAngles[p]
									try { console.log('[DESKEW][cached]', { page: p, angle: ang }) } catch {}
									applyImmediateToPage(p, ang)
								}
							}
						}}
					>Raddrizza</button>
				</div>
			</div>

			<div className="w-full md:w-auto md:ml-auto flex items-center gap-2 justify-start md:justify-end flex-wrap">
				<div className="flex items-center gap-1">
					<label className="text-xs text-muted-foreground">Selezione</label>
					<select className="border rounded px-1 py-0.5 text-xs bg-background text-foreground" value={selectKind} onChange={(e)=>setSelectKind(e.target.value as any)}>
						<option value="NATIVE">Nativa</option>
						<option value="OCR">OCR</option>
					</select>
				</div>
				<span className="text-xs w-10 text-right text-muted-foreground">{zoomPct}%</span>
				<input
					type="range"
					min={50}
					max={300}
					step={1}
					value={zoomPct}
					onChange={(e)=>{
						const v = parseInt(e.target.value,10)
						setZoomPct(v)
						const s = v/100
						scaleRef.current = s
						if (zoomDebounceRef.current != null) {
							window.clearTimeout(zoomDebounceRef.current)
						}
						zoomDebounceRef.current = window.setTimeout(() => {
							try { zoomTo(s) } catch {}
							const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
							if (viewer) viewer.style.setProperty('--scale-factor', String(s))
						}, 80)
					}}
				/>
			</div>
		</div>
	)
}
