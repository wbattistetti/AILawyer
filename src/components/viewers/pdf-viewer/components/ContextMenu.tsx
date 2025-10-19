import React from 'react'
import { ContextMenuState } from '../types'

interface ContextMenuProps {
	contextMenu: ContextMenuState
	lastSelection: any
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
	pageElsRef,
	onContextMenuChange,
	onOcrInspectOpenChange,
	onExtractPosChange,
	onExtractPageChange,
	onExtractOpenChange
}) => {
	const handleCreateExtract = () => {
		console.log('[CONTEXT-MENU] Crea estratto clicked', { lastSelection: !!lastSelection })
		onContextMenuChange({ x: 0, y: 0, visible: false })
		onOcrInspectOpenChange(false) // Mantieni nascosto durante creazione estratto

		// ✅ POSIZIONAMENTO INTELLIGENTE: evita di coprire il testo selezionato
		const vb = lastSelection?.viewportBox
		if (vb && pageElsRef.current.has(lastSelection.pdfPageNumber)) {
			const pageLayer = pageElsRef.current.get(lastSelection.pdfPageNumber)!
			const pr = pageLayer.getBoundingClientRect()

			const panelW = 480, panelH = 300
			const windowW = window.innerWidth || 1200
			const windowH = window.innerHeight || 800
			
			// Coordinate della selezione nel viewport
			const selectionLeft = pr.left + vb.x
			const selectionTop = pr.top + vb.y
			const selectionRight = selectionLeft + vb.w
			const selectionBottom = selectionTop + vb.h
			
			// Calcola posizione X (centrata sulla selezione)
			let px = selectionLeft + (vb.w - panelW) / 2
			px = Math.max(8, Math.min(px, windowW - panelW - 8))
			
			// ✅ LOGICA POSIZIONAMENTO Y INTELLIGENTE
			let py: number
			const spaceBelow = windowH - (selectionBottom + 20) // 20px di margine
			const spaceAbove = selectionTop - 20 // 20px di margine
			
			if (spaceBelow >= panelH) {
				// ✅ SOTTO la selezione (preferenza)
				py = selectionBottom + 20
			} else if (spaceAbove >= panelH) {
				// ✅ SOPRA la selezione
				py = selectionTop - panelH - 20
			} else {
				// ✅ SOPRA la selezione (anche se copre parzialmente)
				py = Math.max(8, selectionTop - panelH - 20)
			}
			
			// Assicura che il form rimanga nel viewport
			py = Math.max(8, Math.min(py, windowH - panelH - 8))

			onExtractPosChange({ x: px, y: py })
			onExtractPageChange(lastSelection.pdfPageNumber)
		}

		onExtractOpenChange(true)
	}

	if (!contextMenu.visible) return null

	return (
		<div>
			{/* Overlay invisibile per catturare click fuori */}
			<div 
				className="fixed inset-0 z-[9998]" 
				onClick={() => onContextMenuChange({ x: 0, y: 0, visible: false })}
			/>
			<div className="fixed z-[9999]" style={{ left: contextMenu.x, top: contextMenu.y }}>
				<div className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3 min-w-[200px] pointer-events-auto">
					<button
						className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
						onClick={handleCreateExtract}
					>
						📄 Crea estratto
					</button>
				</div>
			</div>
		</div>
	)
}
