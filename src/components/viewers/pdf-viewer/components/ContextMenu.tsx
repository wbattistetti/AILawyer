import React from 'react'
import { ContextMenuState } from '../types'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'

interface ContextMenuProps {
	contextMenu: ContextMenuState
	lastSelection: any
	persistentSelections: PersistentSelection[]
	setPersistentSelections: (selections: PersistentSelection[] | ((prev: PersistentSelection[]) => PersistentSelection[])) => void
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	onContextMenuChange: (menu: ContextMenuState) => void
	onOcrInspectOpenChange: (open: boolean) => void
	onExtractPosChange: (pos: { x: number; y: number }) => void
	onExtractPageChange: (page: number) => void
	onExtractOpenChange: (open: boolean) => void
	docName?: string
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
	contextMenu,
	lastSelection,
	persistentSelections,
	setPersistentSelections,
	pageElsRef,
	onContextMenuChange,
	onOcrInspectOpenChange,
	onExtractPosChange,
	onExtractPageChange,
	onExtractOpenChange,
	docName
}) => {
	const handleCreateTask = () => {
		console.log('🎬 [ContextMenu] Create task clicked')
		onContextMenuChange({ x: 0, y: 0, visible: false })
		// TODO: Implementare logica per creare task
	}

	const handleCopyExtract = () => {
		console.log('🎬 [ContextMenu] Copia estratto clicked')
		console.log('🎬 [ContextMenu] Stato attuale persistentSelections:', persistentSelections.length, 'elementi')

		if (!lastSelection) {
			console.warn('[ContextMenu] Nessuna selezione disponibile')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		const pageNum = lastSelection.pdfPageNumber || 1
		const pageLayer = pageElsRef.current.get(pageNum)

		// Calcola le coordinate percentuali dal viewportBox se disponibile
		let bbox = { x0Pct: 0, y0Pct: 0, x1Pct: 0, y1Pct: 0 }
		let selectedPersistentId: string | null = null

		if (lastSelection.viewportBox && pageLayer) {
			const pr = pageLayer.getBoundingClientRect()
			const vb = lastSelection.viewportBox
			bbox = {
				x0Pct: vb.x / pr.width,
				y0Pct: vb.y / pr.height,
				x1Pct: (vb.x + vb.w) / pr.width,
				y1Pct: (vb.y + vb.h) / pr.height
			}
		} else if (persistentSelections.length > 0) {
			// Usa l'ultima selezione persistente se disponibile
			const lastPersistent = persistentSelections[persistentSelections.length - 1]
			console.log('🎬 [ContextMenu] Controllo selezione persistente:', {
				lastPersistentPage: lastPersistent.page,
				currentPage: pageNum,
				matches: lastPersistent.page === pageNum,
				persistentId: lastPersistent.id
			})
			if (lastPersistent.page === pageNum) {
				bbox = {
					x0Pct: lastPersistent.x0Pct,
					y0Pct: lastPersistent.y0Pct,
					x1Pct: lastPersistent.x1Pct,
					y1Pct: lastPersistent.y1Pct
				}
				selectedPersistentId = lastPersistent.id
				console.log('🎬 [ContextMenu] Usando selezione persistente:', selectedPersistentId)
			}
		}

		// Estrai il nome del documento (senza estensione .pdf)
		let displayName = docName || lastSelection.source || 'Documento'
		// Rimuovi estensione .pdf se presente
		if (displayName.toLowerCase().endsWith('.pdf')) {
			displayName = displayName.slice(0, -4)
		}
		// Se contiene ancora "Documento" generico, usa solo il nome del file
		if (displayName.startsWith('Documento ')) {
			displayName = displayName.replace('Documento ', '')
		}

		// Copia l'estratto nella clipboard globale
		const extractData = {
			content: lastSelection.text || '',
			source: displayName,
			page: pageNum,
			bbox
		}

		extractClipboardManager.copy(extractData)

		// Rimuovi la selezione persistente dopo 2 secondi se è stata usata
		if (selectedPersistentId) {
			console.log('⏰ [ContextMenu] Timer avviato per rimuovere rettangolo specifico:', selectedPersistentId)
			setTimeout(() => {
				console.log('🗑️ [ContextMenu] Eseguendo rimozione rettangolo persistente:', selectedPersistentId)
				setPersistentSelections(prev => {
					console.log('🗑️ [ContextMenu] Stato prima della rimozione:', prev.map(s => ({ id: s.id, page: s.page })))
					const filtered = prev.filter(s => s.id !== selectedPersistentId)
					console.log('🗑️ [ContextMenu] Rettangoli prima:', prev.length, 'dopo:', filtered.length)
					console.log('🗑️ [ContextMenu] Stato dopo la rimozione:', filtered.map(s => ({ id: s.id, page: s.page })))
					return filtered
				})
			}, 2000)
		} else {
			// Se non c'è un rettangolo specifico da rimuovere, rimuovi tutti i rettangoli più vecchi
			// e mantieni solo l'ultimo (quello appena creato)
			console.log('🗑️ [ContextMenu] Nessun rettangolo specifico da rimuovere, pulizia generale')
			setPersistentSelections(prev => {
				console.log('🗑️ [ContextMenu] Stato prima della pulizia generale:', prev.map(s => ({ id: s.id, page: s.page })))
				if (prev.length > 1) {
					console.log('🗑️ [ContextMenu] Rimuovendo tutti i rettangoli tranne l\'ultimo')
					const filtered = prev.slice(-1) // Mantieni solo l'ultimo
					console.log('🗑️ [ContextMenu] Dopo pulizia generale:', filtered.map(s => ({ id: s.id, page: s.page })))
					return filtered
				}
				return prev
			})
		}

		onContextMenuChange({ x: 0, y: 0, visible: false })
	}

	if (!contextMenu.visible) return null

	// ✅ FIX: Previeni che il context menu vada troppo in basso
	const menuHeight = 100 // Altezza approssimativa del menu
	const safeY = Math.min(contextMenu.y, window.innerHeight - menuHeight - 10)

	return (
		<div>
			{/* Overlay invisibile per catturare click fuori */}
			<div
				className="fixed inset-0 z-[9998]"
				onClick={() => onContextMenuChange({ x: 0, y: 0, visible: false })}
			/>
			<div className="fixed z-[9999]" style={{ left: contextMenu.x, top: safeY }}>
				<div className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3 min-w-[200px] pointer-events-auto">
					<button
						className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
						onClick={handleCreateTask}
					>
						📋 Create task
					</button>
					<button
						className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
						onClick={handleCopyExtract}
					>
						📄 Copia estratto
					</button>
				</div>
			</div>
		</div>
	)
}
