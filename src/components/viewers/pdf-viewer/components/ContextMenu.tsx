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

		// Calcola posizione dialog elegante (centrato sulla selezione)
		const vb = lastSelection?.viewportBox
		if (vb && pageElsRef.current.has(lastSelection.pdfPageNumber)) {
			const pageLayer = pageElsRef.current.get(lastSelection.pdfPageNumber)!
			const pr = pageLayer.getBoundingClientRect()

			const panelW = 480, panelH = 300
			let px = pr.left + vb.x + (vb.w - panelW) / 2
			let py = pr.top + vb.y + (vb.h - panelH) / 2
			px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
			py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))

			onExtractPosChange({ x: px, y: py })
			onExtractPageChange(lastSelection.pdfPageNumber)
		}

		onExtractOpenChange(true)
	}

	if (!contextMenu.visible) return null

	return (
		<div>
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
