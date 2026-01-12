import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'
import { cropCanvasFromViewportBox } from '../utils/canvasCrop'
import { ExtractBlock } from '../../../../features/defense-memory/components/table-editor/components/ExtractBlock'
import { ExtractBlock as ExtractBlockType, ExtractData } from '../../../../features/defense-memory/components/table-editor/types/blocks.types'

interface ExtractBlockOverlayProps {
	selection: PersistentSelection
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	lastSelection: any
	onClose: () => void
	setPersistentSelections: (selections: PersistentSelection[] | ((prev: PersistentSelection[]) => PersistentSelection[])) => void
	docName?: string
	hasNativeText?: boolean
	onExtractAdd?: (extract: ExtractData) => void  // ✅ Callback per aggiungere al cassetto
}

export const ExtractBlockOverlay: React.FC<ExtractBlockOverlayProps> = ({
	selection,
	pageElsRef,
	overlayRootsRef,
	lastSelection,
	onClose,
	setPersistentSelections,
	docName,
	hasNativeText,
	onExtractAdd
}) => {
	const [extractBlock, setExtractBlock] = useState<ExtractBlockType | null>(null)
	const [extractData, setExtractData] = useState<ExtractData | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	// ✅ Crea ExtractBlock e ExtractData dalla selezione
	useEffect(() => {
		const pageNum = selection.page
		const pageLayer = pageElsRef.current.get(pageNum)

		if (!pageLayer) {
			setIsLoading(false)
			return
		}

		const pr = pageLayer.getBoundingClientRect()
		const viewportBox = {
			x: selection.x0Pct * pr.width,
			y: selection.y0Pct * pr.height,
			w: (selection.x1Pct - selection.x0Pct) * pr.width,
			h: (selection.y1Pct - selection.y0Pct) * pr.height
		}

		// Nome documento
		let displayName = docName || selection.source || lastSelection?.source || 'Documento'
		if (displayName.toLowerCase().endsWith('.pdf')) {
			displayName = displayName.slice(0, -4)
		}
		if (displayName.startsWith('Documento ')) {
			displayName = displayName.replace('Documento ', '')
		}

		// Crea ExtractData iniziale
		const initialData: ExtractData = {
			id: `extract_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			content: selection.text || lastSelection?.text || '',
			source: displayName,
			page: pageNum,
			bbox: {
				x0Pct: selection.x0Pct,
				y0Pct: selection.y0Pct,
				x1Pct: selection.x1Pct,
				y1Pct: selection.y1Pct
			},
			createdAt: new Date(),
			title: `${displayName} Pag. ${pageNum}`,  // ✅ Titolo di default
			observation: '',
			hasObservation: false,
			collapsed: false
		}

		// Ritaglia immagine se OCR o senza testo
		const isOcrDocument = hasNativeText === false
		const hasText = !!(selection.text || lastSelection?.text) && (selection.text || lastSelection?.text).trim().length > 0
		const shouldCropImage = isOcrDocument || !hasText

		const initializeExtract = async () => {
			let imageDataUrl: string | undefined = undefined

			if (shouldCropImage && viewportBox) {
				try {
					const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
					const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null

					if (canvas) {
						const croppedImage = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
						if (croppedImage) {
							imageDataUrl = croppedImage
						}
					}
				} catch (error) {
					console.error('[ExtractBlockOverlay] Errore durante il ritaglio immagine:', error)
				}
			}

			// Crea ExtractData finale
			const data: ExtractData = {
				...initialData,
				imageDataUrl
			}

			// Crea ExtractBlock
			const block: ExtractBlockType = {
				type: 'extract',
				id: data.id,
				order: 0,
				extract: data,
				title: data.title,
				observation: data.observation,
				hasObservation: data.hasObservation,
				collapsed: data.collapsed
			}

			setExtractData(data)
			setExtractBlock(block)
			setIsLoading(false)
		}

		initializeExtract()
	}, [selection, pageElsRef, lastSelection, docName, hasNativeText])

	const handleAddExtract = () => {
		if (!extractData || !extractBlock) return

		// ✅ Aggiorna ExtractData con i metadati da ExtractBlock
		const updatedExtract: ExtractData = {
			...extractData,
			title: extractBlock.title,
			observation: extractBlock.observation,
			hasObservation: extractBlock.hasObservation,
			collapsed: extractBlock.collapsed
		}

		// ✅ Copia nella clipboard (per compatibilità con altri componenti)
		extractClipboardManager.copy({
			content: updatedExtract.content,
			imageDataUrl: updatedExtract.imageDataUrl,
			source: updatedExtract.source,
			page: updatedExtract.page,
			bbox: updatedExtract.bbox
		})

		// ✅ Aggiungi al cassetto tramite callback (che dispatcha app:extract-add)
		// ExtractDrawer NON aggiungerà automaticamente perché controlla i duplicati
		if (onExtractAdd) {
			onExtractAdd(updatedExtract)
		}

		// ✅ Rimuovi selezione
		setPersistentSelections(prev => prev.filter(s => s.id !== selection.id))
		onClose()
	}

	const handleCancel = () => {
		// ✅ Rimuovi selezione senza aggiungere estratto
		setPersistentSelections(prev => prev.filter(s => s.id !== selection.id))
		onClose()
	}

	if (isLoading || !extractBlock || !extractData) {
		return null
	}

	const root = overlayRootsRef.current.get(selection.page)
	if (!root) return null

	// ✅ Posiziona ExtractBlock ESATTAMENTE sopra il rettangolo selezionato (stesse dimensioni)
	const left = `${selection.x0Pct * 100}%`
	const top = `${selection.y0Pct * 100}%`
	const width = `${(selection.x1Pct - selection.x0Pct) * 100}%`
	const height = `${Math.max(0.01, (selection.y1Pct - selection.y0Pct)) * 100}%`

	const overlayNode = (
		<div
			style={{
				position: 'absolute',
				left,
				top,
				width,  // ✅ Stessa larghezza del rettangolo
				height, // ✅ Stessa altezza del rettangolo
				zIndex: 10000,
				pointerEvents: 'auto',
				overflow: 'auto', // ✅ Scroll se il contenuto è più grande
				background: 'white', // ✅ Sfondo bianco per sostituire il rettangolo blu
				border: '2px solid rgba(59,130,246,0.8)', // ✅ Bordo simile al rettangolo
				borderRadius: 2,
				boxShadow: '0 2px 8px rgba(0,0,0,0.15)' // ✅ Ombra per distinguerlo dal documento
			}}
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<div className="p-2 h-full flex flex-col">
				<div className="flex-1 overflow-auto">
					<ExtractBlock
						block={extractBlock}
						onUpdate={(updatedBlock) => {
							setExtractBlock(updatedBlock)
						}}
						readOnly={false}
					/>
				</div>
				{/* ✅ Footer con pulsanti: "Aggiungi osservazione" a sinistra, "Annulla" e "Salva estratto" a destra */}
				<div className="mt-2 flex items-center justify-between gap-2 flex-shrink-0">
					{/* Pulsante "Aggiungi osservazione" a sinistra (solo se non c'è già) */}
					{!extractBlock.hasObservation && (
						<button
							onClick={(e) => {
								e.stopPropagation()
								if (extractBlock) {
									const updatedBlock = { ...extractBlock, hasObservation: true, observation: '' }
									setExtractBlock(updatedBlock)
								}
							}}
							className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
						>
							Aggiungi osservazione
						</button>
					)}

					{/* Spacer per spingere i pulsanti a destra */}
					<div className="flex-1" />

					{/* Pulsanti "Annulla" e "Salva estratto" a destra */}
					<div className="flex gap-2">
						<button
							onClick={handleCancel}
							className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs font-medium transition-colors"
						>
							Annulla
						</button>
						<button
							onClick={handleAddExtract}
							className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
						>
							Salva estratto
						</button>
					</div>
				</div>
			</div>
		</div>
	)

	return createPortal(overlayNode, root)
}
