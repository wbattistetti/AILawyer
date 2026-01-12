import React from 'react'
import { ContextMenuState } from '../types'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'
import { cropCanvasFromViewportBox } from '../utils/canvasCrop'

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
	hasNativeText?: boolean
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
	docName,
	hasNativeText
}) => {
	const menuRef = React.useRef<HTMLDivElement>(null)

	const handleCreateTask = () => {
		console.log('🎬 [ContextMenu] Create task clicked')
		onContextMenuChange({ x: 0, y: 0, visible: false })
		// TODO: Implementare logica per creare task
	}

	const handleCopyExtract = async () => {
		console.log('🔥🔥🔥 [ContextMenu] ===== COPIA ESTRATTO CHIAMATA ===== 🔥🔥🔥')

		if (!lastSelection) {
			console.warn('[ContextMenu] Nessuna selezione disponibile')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		const pageNum = lastSelection.pdfPageNumber || 1
		const pageLayer = pageElsRef.current.get(pageNum)

		if (!pageLayer) {
			console.warn('[ContextMenu] Pagina non trovata:', pageNum)
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		// Calcola viewportBox da lastSelection o persistentSelections
		let bbox = { x0Pct: 0, y0Pct: 0, x1Pct: 0, y1Pct: 0 }
		let viewportBox: { x: number; y: number; w: number; h: number } | null = null
		let selectedPersistentId: string | null = null

		if (lastSelection.viewportBox && pageLayer) {
			const pr = pageLayer.getBoundingClientRect()
			const vb = lastSelection.viewportBox
			viewportBox = vb
			bbox = {
				x0Pct: vb.x / pr.width,
				y0Pct: vb.y / pr.height,
				x1Pct: (vb.x + vb.w) / pr.width,
				y1Pct: (vb.y + vb.h) / pr.height
			}
		} else if (persistentSelections.length > 0) {
			const lastPersistent = persistentSelections[persistentSelections.length - 1]
			if (lastPersistent.page === pageNum) {
				const pr = pageLayer.getBoundingClientRect()
				viewportBox = {
					x: lastPersistent.x0Pct * pr.width,
					y: lastPersistent.y0Pct * pr.height,
					w: (lastPersistent.x1Pct - lastPersistent.x0Pct) * pr.width,
					h: (lastPersistent.y1Pct - lastPersistent.y0Pct) * pr.height
				}
				bbox = {
					x0Pct: lastPersistent.x0Pct,
					y0Pct: lastPersistent.y0Pct,
					x1Pct: lastPersistent.x1Pct,
					y1Pct: lastPersistent.y1Pct
				}
				selectedPersistentId = lastPersistent.id
			}
		}

		if (!viewportBox) {
			console.warn('[ContextMenu] ⚠️ Nessun viewportBox disponibile')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		// Nome documento
		let displayName = docName || lastSelection.source || 'Documento'
		if (displayName.toLowerCase().endsWith('.pdf')) {
			displayName = displayName.slice(0, -4)
		}
		if (displayName.startsWith('Documento ')) {
			displayName = displayName.replace('Documento ', '')
		}

		// Ritaglia immagine se OCR
		const isOcrDocument = hasNativeText === false
		let imageDataUrl: string | undefined = undefined

		if (isOcrDocument && viewportBox) {
			try {
				const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
				const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null

				if (canvas) {
					const croppedImage = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
					if (croppedImage) {
						imageDataUrl = croppedImage
						console.log('✅ [ContextMenu] Immagine ritagliata con successo')
					}
				}
			} catch (error) {
				console.error('[ContextMenu] Errore durante il ritaglio immagine:', error)
			}
		}

		const extractData = {
			content: lastSelection?.text || '',
			imageDataUrl,
			source: displayName,
			page: pageNum,
			bbox
		}

		if (!extractData.content && !extractData.imageDataUrl) {
			console.warn('[ContextMenu] ⚠️ Nessun contenuto da copiare')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
		}

		// Copia nella clipboard
		extractClipboardManager.copy(extractData)
		console.log('✅ [ContextMenu] Estratto copiato:', {
			hasText: !!extractData.content,
			hasImage: !!extractData.imageDataUrl,
			page: extractData.page
		})

		// Copia anche nella clipboard del browser
		if (extractData.content) {
			try {
				await navigator.clipboard.writeText(extractData.content)
			} catch (error) {
				console.error('[ContextMenu] Errore copiando nella clipboard del browser:', error)
			}
		}

		// Rimuovi selezione persistente dopo 2 secondi
		if (selectedPersistentId) {
			setTimeout(() => {
				setPersistentSelections(prev => prev.filter(s => s.id !== selectedPersistentId))
			}, 2000)
		} else if (persistentSelections.length > 1) {
			setPersistentSelections(prev => prev.slice(-1))
		}

		onContextMenuChange({ x: 0, y: 0, visible: false })
	}

	// Nessun listener globale - usiamo un overlay che si attiva solo dopo il rendering
	const [overlayReady, setOverlayReady] = React.useState(false)

	React.useEffect(() => {
		if (contextMenu.visible) {
			// Attiva l'overlay dopo che il menu è stato renderizzato
			const timeoutId = setTimeout(() => {
				setOverlayReady(true)
			}, 50)
			return () => {
				clearTimeout(timeoutId)
				setOverlayReady(false)
			}
		} else {
			setOverlayReady(false)
		}
	}, [contextMenu.visible])

	if (!contextMenu.visible) {
		return null
	}

	const menuHeight = 100
	const safeY = Math.min(contextMenu.y, window.innerHeight - menuHeight - 10)

	return (
		<>
			{/* Overlay per chiudere il menu quando si clicca fuori - attivo solo dopo il rendering */}
			{overlayReady && (
				<div
					className="fixed inset-0 z-[9998]"
					onClick={(e) => {
						const target = e.target as Node
						if (menuRef.current && !menuRef.current.contains(target)) {
							console.log('🌐 [ContextMenu] Click fuori menu, chiudere')
							onContextMenuChange({ x: 0, y: 0, visible: false })
						}
					}}
				/>
			)}
			{/* Menu */}
			<div
				ref={menuRef}
				className="fixed z-[9999]"
				style={{ left: contextMenu.x, top: safeY }}
				onClick={(e) => {
					// Previeni che il click arrivi all'overlay
					e.stopPropagation()
				}}
			>
				<div className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3 min-w-[200px]">
				<button
					type="button"
					className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
						handleCreateTask()
					}}
				>
					📋 Create task
				</button>
				<button
					type="button"
					className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
					onMouseDown={(e) => {
						console.log('🔥 [ContextMenu] Copia estratto - onMouseDown')
						e.stopPropagation()
					}}
					onClick={(e) => {
						console.log('🔥🔥🔥 [ContextMenu] Copia estratto - onClick TRIGGERED')
						e.preventDefault()
						e.stopPropagation()
						handleCopyExtract()
					}}
				>
					📄 Copia estratto
				</button>
				</div>
			</div>
		</>
	)
}
