import React from 'react'
import { formatDocTitle } from '../../../../utils/misc'

interface ExtractDialogProps {
	extractOpen: boolean
	extractPos: { x: number; y: number }
	extractTitle: string
	extractDate: string
	extractNotes: string
	extractPage: number
	showNotes: boolean
	selectKind: 'NATIVE' | 'OCR'
	lastSelection: any
	docId?: string
	fileUrl: string
	hostRef: React.RefObject<HTMLDivElement>
	suppressClearRef: React.MutableRefObject<boolean>
	onExtractTitleChange: (title: string) => void
	onExtractDateChange: (date: string) => void
	onExtractNotesChange: (notes: string) => void
	onShowNotesChange: (show: boolean) => void
	onExtractOpenChange: (open: boolean) => void
	onDraftChange: (draft: any) => void
	onSelBoxChange: (selBox: any) => void
	onSelectedAnnotChange: (annot: any) => void
	onSelectionHandledChange: (handled: boolean) => void
}

export const ExtractDialog: React.FC<ExtractDialogProps> = ({
	extractOpen,
	extractPos,
	extractTitle,
	extractDate,
	extractNotes,
	extractPage,
	showNotes,
	selectKind,
	lastSelection,
	docId,
	fileUrl,
	hostRef,
	suppressClearRef,
	onExtractTitleChange,
	onExtractDateChange,
	onExtractNotesChange,
	onShowNotesChange,
	onExtractOpenChange,
	onDraftChange,
	onSelBoxChange,
	onSelectedAnnotChange,
	onSelectionHandledChange
}) => {

	if (!extractOpen) return null

	const handleClose = () => {
		if (!suppressClearRef.current) {
			// ✅ LOGICA INTELLIGENTE: pulisci selezione in base al tipo
			if (selectKind === 'OCR') {
				onDraftChange(null) // OCR: rimuovi rettangolo quando chiudi
			} else {
				// NATIVE: mantieni selezione nativa, rimuovi solo selBox
			}
			onExtractOpenChange(false)
			onSelBoxChange(null)
		}
	}

	const handleCancel = () => {
		// ✅ LOGICA INTELLIGENTE: pulisci selezione in base al tipo
		if (selectKind === 'OCR') {
			onDraftChange(null) // OCR: rimuovi rettangolo quando annulli
		} else {
			// NATIVE: mantieni selezione nativa
		}
		onSelectedAnnotChange(null)
		onShowNotesChange(false) // Reset notes visibility
		onExtractOpenChange(false)
	}

	const handleSave = () => {
		const payload = {
			kind: 'EXTRACT',
			date: extractDate,
			title: extractTitle.trim(),
			notes: extractNotes || '',
			source: { docId: docId || 'current', fileUrl, page: extractPage, range: (lastSelection as any)?.range || null },
			viewportBox: lastSelection?.viewportBox || null,
			bboxPdf: lastSelection?.bboxPdf || null,
			text: lastSelection?.text || '',
			createdAt: new Date().toISOString(),
		}
		const safe = (s: string) => (s || 'estratto').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64)
		const fileName = `${safe(extractTitle || 'estratto') || 'estratto'}_p${extractPage}.json`
		try { console.log('[EXTRACT][SAVE][modal]', { extractPage, payload }) } catch {}
		try {
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
			const file = new File([blob], fileName, { type: 'application/json' })
			// Fixed tags for "estratti" drawer
			const tags: string[] = ['estratti']
			// Add as in-memory pending extract first (visualize immediately), persistence will happen on Save pratica
			try {
			  const pending = ((window as any).__pendingExtracts || []) as Array<any>
			  const bg = '#94a3b8' // Fixed color for estratti
			  const label = (fileName || 'Estratto').slice(0, 24)
			  const svg = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
			    <svg xmlns='http://www.w3.org/2000/svg' width='256' height='360'>
			      <rect width='100%' height='100%' rx='12' ry='12' fill='white' stroke='${bg}' stroke-width='3'/>
			      <rect x='24' y='24' width='208' height='36' rx='6' fill='${bg}'/>
			      <text x='128' y='48' text-anchor='middle' font-family='Inter, Arial, sans-serif' font-size='16' fill='white'>Estratto</text>
			      <text x='24' y='100' font-family='Inter, Arial, sans-serif' font-size='14' fill='#111'>${label}</text>
			      <text x='24' y='330' font-family='Inter, Arial, sans-serif' font-size='12' fill='#6b7280'>JSON</text>
			    </svg>`
			  const thumb = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
			    const pageForMeta = extractPage
			    const pageLayerEl = (hostRef.current?.querySelectorAll('.rpv-core__page-layer')?.[pageForMeta-1] as HTMLElement | null)
			    const pr = pageLayerEl?.getBoundingClientRect()
			    const vb = lastSelection?.viewportBox
			    const x0Pct = (vb && pr) ? (vb.x / pr.width) : undefined
			    const x1Pct = (vb && pr) ? ((vb.x + vb.w) / pr.width) : undefined
			    const y0Pct = (vb && pr) ? (vb.y / pr.height) : undefined
			    const y1Pct = (vb && pr) ? ((vb.y + vb.h) / pr.height) : undefined
			    const virt = { id: `tmp:${Date.now()}`, filename: fileName, s3Key: file.name, mime: file.type, thumb, tags, meta: { title: payload.title || 'Estratto', text: payload.text || '', source: { docId: (docId||'current'), title: formatDocTitle(fileUrl), page: pageForMeta, fileUrl, x0Pct, x1Pct, y0Pct, y1Pct, range: (lastSelection as any)?.range || null } } }
			  try { console.log('[EXTRACT][PENDING][virt]', { pageForMeta, virtSource: virt.meta?.source }) } catch {}
			  const next = [virt, ...pending]
			  ;(window as any).__pendingExtracts = next
			  // Push immediate update to open drawers
			  try { window.dispatchEvent(new CustomEvent('app:documents', { detail: { items: next } })) } catch {}
			  // And ask page to rebroadcast full list (persisted + pending)
			  window.dispatchEvent(new CustomEvent('app:request-documents'))
			} catch {}
			// Optionally skip immediate upload; if you want immediate persistence, re-dispatch upload-files
		} catch (e) { console.warn('[EXTRACT][SAVE][err]', e) }
		// ✅ LOGICA INTELLIGENTE: pulisci selezione in base al tipo
		if (selectKind === 'OCR') {
			onDraftChange(null) // OCR: rimuovi rettangolo dopo salvataggio
		} else {
			// NATIVE: mantieni selezione nativa, rimuovi solo eventi
			try { window.dispatchEvent(new Event('ai-select-clear')) } catch {}
			try { const s = window.getSelection(); s && s.removeAllRanges() } catch {}
		}
		onSelectionHandledChange(false)
		onShowNotesChange(false) // Reset notes visibility
		onExtractOpenChange(false)
		onSelectedAnnotChange(null)
	}

	return (
		<React.Fragment>
			<div className="fixed inset-0 z-[999]" onClick={handleClose} />
			<div 
				className="fixed z-[1000] bg-white rounded-lg shadow-2xl border border-gray-200" 
				style={{ 
					left: extractPos.x, 
					top: extractPos.y, 
					width: 480, 
					minHeight: 300, 
					maxHeight: Math.min(600, (window.innerHeight||800) - 32) 
				}}
			>
				<div 
					className="p-6 max-h-full flex flex-col" 
					onMouseDown={(e)=>{ e.stopPropagation(); suppressClearRef.current = true }} 
					onMouseUp={()=>{ suppressClearRef.current = false }}
				>
					{/* ✅ Header elegante con ombra - FONT RIDOTTO */}
					<div className="text-lg font-semibold mb-4 text-center text-gray-800 drop-shadow-sm">Aggiungi estratto</div>

					<div className="grid grid-cols-1 gap-3">
						{/* ✅ Solo titolo obbligatorio - FONT RIDOTTO */}
						<div>
							<label className="text-sm block mb-1 font-medium text-gray-700">Titolo dell'estratto *</label>
							<input
								className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
								placeholder="Scrivi un titolo per l'estratto…"
								value={extractTitle}
								onChange={(e)=>onExtractTitleChange(e.target.value)}
								autoFocus
							/>
						</div>

						{/* ✅ Layout ottimizzato: data + pulsante note affiancati */}
						<div className="flex items-end gap-2">
							<div className="flex-[2]">
								<label className="text-sm block mb-1 font-medium text-gray-700">Data *</label>
								<input
									type="date"
									className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
									value={extractDate}
									onChange={(e)=>onExtractDateChange(e.target.value)}
									placeholder="GG/MM/AAAA"
								/>
							</div>

							<div className="flex-[1]">
								<button
									type="button"
									className="w-full text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 py-2 font-medium transition-colors border border-gray-300 rounded-lg hover:bg-gray-50 h-[38px]"
									onClick={() => onShowNotesChange(!showNotes)}
								>
									{showNotes ? '▾' : '▸'} Aggiungi note
								</button>
							</div>
						</div>

						{/* ✅ Note espandibili - solo se attive */}
						{showNotes && (
							<div className="mt-2">
								<label className="text-sm block mb-1 font-medium text-gray-700">Note</label>
								<textarea
									className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[80px] max-h-[160px] resize-y overflow-auto text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
									value={extractNotes}
									onChange={(e)=>onExtractNotesChange(e.target.value)}
									placeholder="Aggiungi note opzionali..."
								/>
							</div>
						)}
					</div>

					{/* ✅ Pulsanti SOPRA - FONT RIDOTTO */}
					<div className="mt-4 pt-3 border-t border-gray-200 flex justify-end gap-3">
						<button
							className="px-4 py-2 border border-gray-300 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
							onClick={handleCancel}
						>
							Annulla
						</button>
						<button
							className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 text-[13px] font-medium hover:bg-blue-700 disabled:hover:bg-blue-600 transition-colors"
							disabled={!extractTitle.trim() || !extractDate.trim()}
							onClick={handleSave}
						>
							Salva
						</button>
					</div>
				</div>
			</div>
		</React.Fragment>
	)
}