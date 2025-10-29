import React from 'react'
import { ContextMenuState } from '../types'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'

interface ContextMenuProps {
	contextMenu: ContextMenuState
	lastSelection: any
	persistentSelections: PersistentSelection[]
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	onContextMenuChange: (menu: ContextMenuState) => void
	onOcrInspectOpenChange: (open: boolean) => void
	onExtractPosChange: (pos: { x: number; y: number }) => void
	onExtractPageChange: (page: number) => void
	onExtractOpenChange: (open: boolean) => void
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
	contextMenu,
	lastSelection,
	persistentSelections,
	pageElsRef,
	onContextMenuChange,
	onOcrInspectOpenChange,
	onExtractPosChange,
	onExtractPageChange,
	onExtractOpenChange
}) => {
	const handleCreateTask = () => {
		console.log('🎬 [ContextMenu] Create task clicked')
		onContextMenuChange({ x: 0, y: 0, visible: false })
		// TODO: Implementare logica per creare task
	}

	const handleCopyExtract = () => {
		console.log('🎬 [ContextMenu] Copia estratto clicked')

		if (!lastSelection) {
			console.warn('[ContextMenu] Nessuna selezione disponibile')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		const pageNum = lastSelection.pdfPageNumber || 1
		const pageLayer = pageElsRef.current.get(pageNum)

		// Calcola le coordinate percentuali dal viewportBox se disponibile
		let bbox = { x0Pct: 0, y0Pct: 0, x1Pct: 0, y1Pct: 0 }

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
			if (lastPersistent.page === pageNum) {
				bbox = {
					x0Pct: lastPersistent.x0Pct,
					y0Pct: lastPersistent.y0Pct,
					x1Pct: lastPersistent.x1Pct,
					y1Pct: lastPersistent.y1Pct
				}
			}
		}

		// Copia l'estratto nella clipboard globale
		const extractData = {
			content: lastSelection.text || '',
			source: lastSelection.source || 'Documento',
			page: pageNum,
			bbox
		}

		extractClipboardManager.copy(extractData)
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
