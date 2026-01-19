import React from 'react'
import { Highlighter, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, MessageSquare, Save as SaveIcon, Search, PanelRightOpen } from 'lucide-react'
import { Tool } from '../types'

interface PdfToolbarProps {
	// Page navigation
	pageInput: string
	totalPages: number
	onPageInputChange: (value: string) => void
	onPageKeyDown: (e: React.KeyboardEvent) => void
	onPageChange?: (page: number) => void

	// Search
	searchQ: string
	showAdvanced: boolean
	onSearchChange: (value: string) => void
	onSearchKeyDown: (e: React.KeyboardEvent) => void
	onToggleAdvanced: () => void

	// Tools
	tool: Tool
	onToolChange: (tool: Tool) => void

	// Audit mode
	audit: boolean
	onAuditToggle: () => void

	// Deskew
	autoDeskew: boolean
	onDeskewToggle: () => Promise<void>

	// Selection
	selectKind: 'NATIVE' | 'OCR'
	onSelectKindChange: (kind: 'NATIVE' | 'OCR') => void

	// Zoom
	zoomPct: number
	onZoomChange: (value: number) => void


	// Refs (for internal use)
	pageNav?: any
	scaleRef?: React.MutableRefObject<number>
	zoomDebounceRef?: React.MutableRefObject<number | null>
	hostRef?: React.RefObject<HTMLDivElement>
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
	pageInput,
	totalPages,
	onPageInputChange,
	onPageKeyDown,
	onPageChange,
	searchQ,
	showAdvanced,
	onSearchChange,
	onSearchKeyDown,
	onToggleAdvanced,
	tool,
	onToolChange,
	audit,
	onAuditToggle,
	autoDeskew,
	onDeskewToggle,
	selectKind,
	onSelectKindChange,
	zoomPct,
	onZoomChange,
	pageNav,
	scaleRef,
	zoomDebounceRef,
	hostRef
}) => {

	return (
		<div className="flex flex-wrap items-center gap-2 border-b px-2 py-1 text-sm bg-background">
			{/* Page navigation */}
			<div className="flex items-center gap-1">
				<input
					className="w-16 border rounded px-1 py-0.5 text-center"
					value={pageInput}
					onChange={(e) => onPageInputChange(e.target.value.replace(/[^0-9]/g, ''))}
					onKeyDown={onPageKeyDown}
				/>
				<span className="text-muted-foreground whitespace-nowrap px-1">/ {totalPages || '-'}</span>
			</div>

			{/* Pulsante Cerca a destra della toolbar */}
			<div className="ml-auto flex items-center gap-2">
				{showAdvanced ? (
					<button
						className="px-3 py-1 border rounded bg-blue-100 border-blue-400 hover:bg-blue-200"
						title="Chiudi pannello ricerca"
						onClick={onToggleAdvanced}
					>
						Chiudi ricerca
					</button>
				) : (
					<button
						className="px-3 py-1 border rounded bg-background hover:bg-muted"
						title="Apri pannello ricerca"
						onClick={onToggleAdvanced}
					>
						<Search size={16} className="inline-block mr-1" />
						Cerca
					</button>
				)}
			</div>

			{/* Annotation tools */}
			<div className="flex items-center gap-2">
				<button
					className={`px-2 py-1 rounded border ${tool==='highlight'?'bg-yellow-100 border-yellow-400':''}`}
					title="Evidenzia"
					onClick={() => onToolChange(tool==='highlight'?'none':'highlight')}
				>
					<Highlighter size={16} />
				</button>
				<button
					className={`px-2 py-1 rounded border ${tool==='underline'?'bg-sky-100 border-sky-400':''}`}
					title="Sottolinea"
					onClick={() => onToolChange(tool==='underline'?'none':'underline')}
				>
					<UnderlineIcon size={16} />
				</button>
				<button
					className={`px-2 py-1 rounded border ${tool==='strike'?'bg-red-100 border-red-400':''}`}
					title="Barra"
					onClick={() => onToolChange(tool==='strike'?'none':'strike')}
				>
					<StrikethroughIcon size={16} />
				</button>
				<button
					className={`px-2 py-1 rounded border ${audit?'bg-muted border-border':''}`}
					title="Audit mode (testo digitale)"
					onClick={onAuditToggle}
				>
					Audit
				</button>
				<button
					className={`px-2 py-1 rounded border ${tool==='comment'?'bg-amber-100 border-amber-400':''}`}
					title="Commento"
					onClick={() => onToolChange(tool==='comment'?'none':'comment')}
				>
					<MessageSquare size={16} />
				</button>
				<button
					className={`px-2 py-1 rounded border ${autoDeskew ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : ''}`}
					title={autoDeskew ? 'Raddrizza: ON' : 'Raddrizza quando serve'}
					onClick={onDeskewToggle}
				>
					Raddrizza
				</button>

			</div>

			{/* Right side controls */}
			<div className="w-full md:w-auto md:ml-auto flex items-center gap-2 justify-start md:justify-end flex-wrap">
				<div className="flex items-center gap-1">
					<label className="text-xs text-muted-foreground">Selezione</label>
					<select
						className="border rounded px-1 py-0.5 text-xs"
						value={selectKind}
						onChange={(e) => onSelectKindChange(e.target.value as any)}
					>
						<option value="NATIVE">Nativa</option>
						<option value="OCR">OCR</option>
					</select>
				</div>
				<span className="text-xs w-10 text-right">{zoomPct}%</span>
				<input
					type="range"
					min={50}
					max={300}
					step={1}
					value={zoomPct}
					onChange={(e) => {
						const v = parseInt(e.target.value, 10)
						onZoomChange(v)
						const s = v / 100
						if (scaleRef?.current !== undefined) scaleRef.current = s
						if (zoomDebounceRef?.current != null) {
							window.clearTimeout(zoomDebounceRef.current)
						}
						if (zoomDebounceRef) {
							zoomDebounceRef.current = window.setTimeout(() => {
								try {
									// This would need to be passed down from parent
									const viewer = hostRef?.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
									if (viewer) viewer.style.setProperty('--scale-factor', String(s))
								} catch {}
							}, 80)
						}
					}}
				/>
			</div>
		</div>
	)
}
