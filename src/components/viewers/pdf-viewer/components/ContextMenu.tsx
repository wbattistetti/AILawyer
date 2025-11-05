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
	const handleCreateTask = () => {
		console.log('🎬 [ContextMenu] Create task clicked')
		onContextMenuChange({ x: 0, y: 0, visible: false })
		// TODO: Implementare logica per creare task
	}

	const handleCopyExtract = async () => {
		console.log('🎬 [ContextMenu] Copia estratto clicked')
		console.log('🎬 [ContextMenu] lastSelection completo:', {
			hasLastSelection: !!lastSelection,
			hasText: !!lastSelection?.text,
			textLength: lastSelection?.text?.length || 0,
			textPreview: lastSelection?.text?.substring(0, 100) || 'N/A',
			pdfPageNumber: lastSelection?.pdfPageNumber,
			hasViewportBox: !!lastSelection?.viewportBox,
			viewportBox: lastSelection?.viewportBox
		})
		console.log('🎬 [ContextMenu] Stato attuale persistentSelections:', persistentSelections.length, 'elementi')

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

		// Calcola le coordinate percentuali dal viewportBox se disponibile
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
			// Usa l'ultima selezione persistente se disponibile
			const lastPersistent = persistentSelections[persistentSelections.length - 1]
			console.log('🎬 [ContextMenu] Controllo selezione persistente:', {
				lastPersistentPage: lastPersistent.page,
				currentPage: pageNum,
				matches: lastPersistent.page === pageNum,
				persistentId: lastPersistent.id
			})
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
				console.log('🎬 [ContextMenu] Usando selezione persistente:', selectedPersistentId)
			}
		}

		if (!viewportBox) {
			console.warn('[ContextMenu] Nessun viewportBox disponibile')
			onContextMenuChange({ x: 0, y: 0, visible: false })
			return
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

		// Determina se dobbiamo ritagliare l'immagine (OCR) o copiare solo il testo (nativo)
		const isOcrDocument = hasNativeText === false // Se hasNativeText è esplicitamente false, è OCR
		let imageDataUrl: string | undefined = undefined

		// Se è un documento OCR e abbiamo un viewportBox, ritaglia l'immagine dal canvas
		if (isOcrDocument && viewportBox) {
			try {
				// Cerca il canvas nella pagina
				const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
				const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null

				if (canvas) {
					console.log('🎬 [ContextMenu] Ritagliando immagine da canvas per documento OCR')
					const croppedImage = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
					if (croppedImage) {
						imageDataUrl = croppedImage
						console.log('✅ [ContextMenu] Immagine ritagliata con successo, dimensione:', croppedImage.length, 'bytes')
					} else {
						console.warn('[ContextMenu] Impossibile ritagliare immagine, uso solo testo')
					}
				} else {
					console.warn('[ContextMenu] Canvas non trovato nella pagina')
				}
			} catch (error) {
				console.error('[ContextMenu] Errore durante il ritaglio immagine:', error)
			}
		}

		// Copia l'estratto nella clipboard globale
		const extractData = {
			content: lastSelection.text || '',
			imageDataUrl, // Incluso solo se è un documento OCR
			source: displayName,
			page: pageNum,
			bbox
		}

		// Copia nella clipboard personalizzata (per drag & drop)
		extractClipboardManager.copy(extractData)

		// ✅ Copia anche nella clipboard del browser per permettere Ctrl+V
		if (extractData.content) {
			try {
				await navigator.clipboard.writeText(extractData.content)
				console.log('✅ [ContextMenu] Testo copiato nella clipboard del browser')
			} catch (error) {
				console.error('[ContextMenu] Errore copiando nella clipboard del browser:', error)
			}
		}

		console.log('✅ [ContextMenu] Estratto copiato:', {
			hasText: !!extractData.content,
			hasImage: !!extractData.imageDataUrl,
			page: extractData.page,
			source: extractData.source
		})

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

	if (!contextMenu.visible) {
		return null
	}

	// ✅ FIX: Previeni che il context menu vada troppo in basso
	const menuHeight = 100 // Altezza approssimativa del menu
	const safeY = Math.min(contextMenu.y, window.innerHeight - menuHeight - 10)

	return (
		<div>
			{/* Overlay invisibile per catturare click fuori */}
			<div
				className="fixed inset-0 z-[9998]"
				onClick={(e) => {
					// Se il click è sul menu stesso, non chiudere
					const target = e.target as HTMLElement
					if (target.closest('[data-context-menu]')) {
						return
					}
					onContextMenuChange({ x: 0, y: 0, visible: false })
				}}
			/>
			<div
				className="fixed z-[9999]"
				style={{ left: contextMenu.x, top: safeY }}
				data-context-menu="true"
				onClick={(e) => {
					e.stopPropagation()
				}}
				onMouseDown={(e) => {
					e.stopPropagation()
				}}
			>
				<div
					className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3 min-w-[200px] pointer-events-auto"
					data-context-menu="true"
					onClick={(e) => {
						e.stopPropagation()
					}}
					onMouseDown={(e) => {
						e.stopPropagation()
					}}
				>
					<button
						className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
						onClick={(e) => {
							e.preventDefault()
							e.stopPropagation()
							console.log('🔘 [ContextMenu] Create task button clicked')
							handleCreateTask()
						}}
					>
						📋 Create task
					</button>
					<button
						className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
						data-context-menu="true"
						onMouseDown={(e) => {
							e.stopPropagation()
						}}
						onClick={(e) => {
							e.preventDefault()
							e.stopPropagation()
							console.log('🔘 [ContextMenu] Copia estratto button clicked')
							handleCopyExtract()
						}}
					>
						📄 Copia estratto
					</button>
				</div>
			</div>
		</div>
	)
}
