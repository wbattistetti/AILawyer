import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
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
	const overlayRef = useRef<HTMLDivElement | null>(null)

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
			title: '',  // ✅ Titolo vuoto inizialmente (non ripetere nome documento e pagina)
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

	// ✅ Callback ref per salvare il riferimento all'overlay
	const overlayCallbackRef = (element: HTMLDivElement | null) => {
		console.log('🟣 [ExtractBlockOverlay] Callback ref chiamato', {
			element,
			hasElement: !!element,
			className: element?.className,
			dataAttr: element?.getAttribute('data-extract-overlay')
		})
		overlayRef.current = element
	}

	// ✅ Intercetta tutti i click/mousedown in fase di capture per prevenire che raggiungano gli elementi sottostanti
	useLayoutEffect(() => {
		const overlayElement = overlayRef.current
		console.log('🟣 [ExtractBlockOverlay] useLayoutEffect eseguito', {
			hasOverlayElement: !!overlayElement,
			overlayElement
		})

		if (!overlayElement) {
			console.log('🟣 [ExtractBlockOverlay] ⚠️ overlayElement non disponibile, salto registrazione listener')
			return
		}

		console.log('🟣 [ExtractBlockOverlay] ✅ Registrando listener in fase di capture')

		const handleCaptureClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement

			// ✅ NON bloccare se il click è su un elemento interattivo (button, input, textarea, etc.)
			// ✅ Verifica anche se il target è un figlio di un elemento interattivo
			const isInteractiveElement = target && (
				target.tagName === 'BUTTON' ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.closest('button') !== null ||
				target.closest('input') !== null ||
				target.closest('textarea') !== null ||
				// ✅ Verifica anche se il target è dentro un label o altro elemento interattivo
				target.closest('label') !== null ||
				// ✅ Verifica se il target ha un attributo onClick o è un elemento cliccabile
				target.onclick !== null ||
				target.getAttribute('onclick') !== null
			)

			if (isInteractiveElement) {
				console.log('🟣 [ExtractBlockOverlay] CAPTURE: Click su elemento interattivo, NON blocco', {
					target: target,
					tagName: target?.tagName,
					closestButton: target?.closest('button'),
					closestInput: target?.closest('input'),
					closestTextarea: target?.closest('textarea')
				})
				return // ✅ NON bloccare i click su elementi interattivi
			}

			console.log('🟣 [ExtractBlockOverlay] CAPTURE: Click rilevato', {
				target: target,
				tagName: target?.tagName,
				className: target?.className,
				overlayContainsTarget: overlayElement.contains(target)
			})

			// ✅ Se il click è dentro l'overlay ma NON su un elemento interattivo, bloccalo
			if (overlayElement.contains(target)) {
				console.log('🟣 [ExtractBlockOverlay] CAPTURE: ✅ Bloccato click dentro overlay (non interattivo)')
				e.stopPropagation()
				e.stopImmediatePropagation()
			}
		}

		const handleCaptureMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement

			// ✅ NON bloccare se il mousedown è su un elemento interattivo (button, input, textarea, etc.)
			// ✅ Verifica anche se il target è un figlio di un elemento interattivo
			const isInteractiveElement = target && (
				target.tagName === 'BUTTON' ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.closest('button') !== null ||
				target.closest('input') !== null ||
				target.closest('textarea') !== null ||
				// ✅ Verifica anche se il target è dentro un label o altro elemento interattivo
				target.closest('label') !== null ||
				// ✅ Verifica se il target ha un attributo onClick o è un elemento cliccabile
				target.onclick !== null ||
				target.getAttribute('onclick') !== null
			)

			if (isInteractiveElement) {
				console.log('🟣 [ExtractBlockOverlay] CAPTURE: MouseDown su elemento interattivo, NON blocco', {
					target: target,
					tagName: target?.tagName,
					closestButton: target?.closest('button'),
					closestInput: target?.closest('input'),
					closestTextarea: target?.closest('textarea')
				})
				return // ✅ NON bloccare i mousedown su elementi interattivi
			}

			console.log('🟣 [ExtractBlockOverlay] CAPTURE: MouseDown rilevato', {
				target: target,
				tagName: target?.tagName,
				className: target?.className,
				overlayContainsTarget: overlayElement.contains(target)
			})

			// ✅ Se il mousedown è dentro l'overlay ma NON su un elemento interattivo, bloccalo
			if (overlayElement.contains(target)) {
				console.log('🟣 [ExtractBlockOverlay] CAPTURE: ✅ Bloccato mousedown dentro overlay (non interattivo)')
				e.stopPropagation()
				e.stopImmediatePropagation()
			}
		}

		// ✅ Aggiungi listener in fase di capture sul document (per intercettare prima di useNativeSelection)
		// ✅ Usa addEventListener con capture: true per intercettare PRIMA di useNativeSelection
		document.addEventListener('click', handleCaptureClick, true)
		document.addEventListener('mousedown', handleCaptureMouseDown, true)

		console.log('🟣 [ExtractBlockOverlay] ✅ Listener registrati in fase di capture')

		return () => {
			console.log('🟣 [ExtractBlockOverlay] 🔴 Rimuovendo listener in fase di capture')
			document.removeEventListener('click', handleCaptureClick, true)
			document.removeEventListener('mousedown', handleCaptureMouseDown, true)
		}
	}) // ✅ Eseguito dopo ogni render per verificare se overlayRef.current è disponibile

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

	// ✅ Calcola dimensioni in pixel per posizionamento preciso
	const pageLayer = pageElsRef.current.get(selection.page)
	const pageRect = pageLayer?.getBoundingClientRect()
	if (!pageRect) return null

	const selectionWidth = (selection.x1Pct - selection.x0Pct) * pageRect.width
	const selectionHeight = (selection.y1Pct - selection.y0Pct) * pageRect.height

	// ✅ Altezze stimate per header e footer
	const headerHeight = 60 // Altezza approssimativa dell'header (titolo)
	const footerHeight = 50 // Altezza approssimativa del footer (pulsanti)
	const observationHeight = extractBlock.hasObservation ? 120 : 0 // Altezza campo osservazione se presente

	// ✅ Posiziona overlay: inizia SOPRA il rettangolo per includere l'header
	const left = `${selection.x0Pct * 100}%`
	const width = `${(selection.x1Pct - selection.x0Pct) * 100}%`
	// ✅ Top: inizia SOPRA il rettangolo per includere l'header
	const top = `calc(${selection.y0Pct * 100}% - ${headerHeight}px)`
	// ✅ Height: auto si adatta al contenuto, min-height include header + rettangolo + footer + osservazione
	const minHeight = headerHeight + selectionHeight + footerHeight + observationHeight

	const overlayNode = (
		<div
			ref={overlayCallbackRef} // ✅ Callback ref per intercettare eventi in fase di capture
			data-extract-overlay="true" // ✅ Attributo per identificare l'overlay in useNativeSelection
			className="extract-block-overlay" // ✅ Classe per identificare l'overlay
			style={{
				position: 'absolute',
				left,
				top, // ✅ Inizia SOPRA il rettangolo per includere l'header
				width,
				minHeight: `${minHeight}px`, // ✅ Min-height per garantire spazio per tutto
				height: 'auto', // ✅ Si adatta al contenuto
				zIndex: 10000,
				pointerEvents: 'auto',
				overflow: 'visible', // ✅ Cambiato a visible per permettere all'header di essere visibile sopra
				background: 'white', // ✅ Sfondo bianco per sostituire il rettangolo blu
				border: '2px solid rgba(59,130,246,0.8)', // ✅ Bordo simile al rettangolo
				borderRadius: 2,
				boxShadow: '0 2px 8px rgba(0,0,0,0.15)' // ✅ Ombra per distinguerlo dal documento
			}}
			onClick={(e) => {
				console.log('🟢 [ExtractBlockOverlay] Click sul container principale', {
					target: e.target,
					currentTarget: e.currentTarget,
					tagName: (e.target as HTMLElement)?.tagName,
					className: (e.target as HTMLElement)?.className
				})
				e.stopPropagation()
			}}
			onMouseDown={(e) => {
				console.log('🟢 [ExtractBlockOverlay] MouseDown sul container principale', {
					target: e.target,
					currentTarget: e.currentTarget,
					tagName: (e.target as HTMLElement)?.tagName,
					className: (e.target as HTMLElement)?.className
				})
				e.stopPropagation()
			}}
		>
			<div
				className="flex flex-col relative"
				style={{ overflow: 'auto' }}
				onClick={(e) => {
					console.log('🟡 [ExtractBlockOverlay] Click sul container interno', {
						target: e.target,
						currentTarget: e.currentTarget
					})
					e.stopPropagation()
				}}
				onMouseDown={(e) => {
					console.log('🟡 [ExtractBlockOverlay] MouseDown sul container interno', {
						target: e.target,
						currentTarget: e.currentTarget
					})
					e.stopPropagation()
				}}
			>
				{/* ✅ ExtractBlock: header normale sopra, contenuto inizia subito dopo l'header */}
				<ExtractBlock
					block={extractBlock}
					onUpdate={(updatedBlock) => {
						setExtractBlock(updatedBlock)
					}}
					readOnly={false}
					isOverlay={true} // ✅ Passa isOverlay per mostrare immagine a dimensione originale
					overlayHeaderOffset={headerHeight} // ✅ Passa l'offset (non più usato per absolute, ma per calcoli)
				/>

				{/* ✅ Footer con pulsanti: "Aggiungi osservazione" a sinistra, "Annulla" e "Salva estratto" a destra */}
				<div className="mt-2 flex items-center justify-between gap-2 flex-shrink-0 p-2 border-t border-gray-200 bg-white">
					{/* Pulsante "Aggiungi osservazione" a sinistra (solo se non c'è già) */}
					{!extractBlock.hasObservation && (
						<button
							onClick={(e) => {
								console.log('🔵 [ExtractBlockOverlay] Click su "Aggiungi osservazione"', {
									target: e.target,
									currentTarget: e.currentTarget,
									bubbles: e.bubbles,
									cancelable: e.cancelable
								})
								e.stopPropagation()
								if (extractBlock) {
									const updatedBlock = { ...extractBlock, hasObservation: true, observation: '' }
									setExtractBlock(updatedBlock)
								}
							}}
							onMouseDown={(e) => {
								console.log('🔵 [ExtractBlockOverlay] MouseDown su "Aggiungi osservazione"', {
									target: e.target,
									currentTarget: e.currentTarget
								})
								e.stopPropagation()
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
							onClick={(e) => {
								console.log('🔴 [ExtractBlockOverlay] Click su "Annulla"')
								e.stopPropagation()
								handleCancel()
							}}
							className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs font-medium transition-colors"
						>
							Annulla
						</button>
						<button
							onClick={(e) => {
								console.log('🟣 [ExtractBlockOverlay] Click su "Salva estratto"')
								e.stopPropagation()
								handleAddExtract()
							}}
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
