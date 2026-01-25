import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'
import { cropCanvasFromViewportBox } from '../utils/canvasCrop'
import { ExtractBlock } from '../../../../features/defense-memory/components/table-editor/components/ExtractBlock'
import { ExtractBlock as ExtractBlockType, ExtractData } from '../../../../features/defense-memory/components/table-editor/types/blocks.types'
import { getSelectedTextInRect } from '../utils/textExtraction'

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
	const [isImageLoading, setIsImageLoading] = useState(true) // ✅ Stato per tracciare se l'immagine è in caricamento
	const [isExtractingText, setIsExtractingText] = useState(false)
	const overlayRef = useRef<HTMLDivElement | null>(null)
	const contentWrapperRef = useRef<HTMLDivElement | null>(null) // ✅ Ref per il wrapper del contenuto
	const [actualHeaderHeight, setActualHeaderHeight] = useState<number>(60) // ✅ Altezza reale misurata

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
			setIsImageLoading(true) // ✅ Imposta loading quando inizia

			// ✅ Usa imageDataUrl già presente nella selezione (per Word/OCR) o in lastSelection
			let imageDataUrl: string | undefined = selection.imageDataUrl || lastSelection?.imageDataUrl

			// ✅ Se non c'è già uno screenshot, prova a ritagliare dal canvas (solo per PDF)
			if (!imageDataUrl && shouldCropImage && viewportBox) {
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
			setIsImageLoading(false) // ✅ Imposta loading a false quando finisce
		}

		initializeExtract()
	}, [selection, pageElsRef, lastSelection, docName, hasNativeText])

	// ✅ Aggiorna isImageLoading e extractData quando l'immagine viene aggiornata nella selezione
	useEffect(() => {
		const currentImageDataUrl = selection.imageDataUrl || lastSelection?.imageDataUrl
		if (currentImageDataUrl && extractData && !extractData.imageDataUrl) {
			// ✅ L'immagine è disponibile, aggiorna extractData e lo stato
			setExtractData(prev => prev ? { ...prev, imageDataUrl: currentImageDataUrl } : prev)
			if (extractBlock) {
				setExtractBlock(prev => prev ? {
					...prev,
					extract: { ...prev.extract, imageDataUrl: currentImageDataUrl }
				} : prev)
			}
			setIsImageLoading(false)
		} else if (!currentImageDataUrl && extractData && !extractData.imageDataUrl) {
			// ✅ L'immagine non è ancora disponibile, mantieni loading
			setIsImageLoading(true)
		} else if (currentImageDataUrl && isImageLoading) {
			// ✅ L'immagine è disponibile e siamo in loading, aggiorna lo stato
			setIsImageLoading(false)
		}
	}, [selection.imageDataUrl, lastSelection?.imageDataUrl, isImageLoading, extractData, extractBlock])

	// ✅ Listener per chiudere l'overlay quando l'estratto viene aggiunto tramite drag
	useEffect(() => {
		if (!extractData) return

		const handleExtractAddedByDrag = (event: CustomEvent) => {
			const { extractId } = event.detail
			// Verifica se l'estratto aggiunto corrisponde a quello dell'overlay
			if (extractData.id === extractId) {
				onClose()
			}
		}

		window.addEventListener('app:extract-added-by-drag', handleExtractAddedByDrag as EventListener)
		return () => {
			window.removeEventListener('app:extract-added-by-drag', handleExtractAddedByDrag as EventListener)
		}
	}, [extractData, onClose])

	// ✅ Misura altezza reale dell'header dopo il render
	useLayoutEffect(() => {
		if (contentWrapperRef.current && extractBlock) {
			// ✅ ExtractBlock renderizza un div principale, e il primo elemento figlio è l'header (div con border-b)
			const extractBlockElement = contentWrapperRef.current.firstElementChild as HTMLElement
			if (extractBlockElement) {
				// ✅ L'header è il primo elemento figlio del ExtractBlock (div con className che include 'border-b')
				const headerElement = Array.from(extractBlockElement.children).find(
					(child) => child.classList.contains('border-b') ||
					(child as HTMLElement).querySelector('.border-b')
				) as HTMLElement

				// ✅ Se non trovato con la classe, prova a prendere il primo figlio
				const targetElement = headerElement || extractBlockElement.firstElementChild as HTMLElement

				if (targetElement) {
					const headerRect = targetElement.getBoundingClientRect()
					const measuredHeight = headerRect.height
					if (measuredHeight > 0 && Math.abs(measuredHeight - actualHeaderHeight) > 1) {
						setActualHeaderHeight(measuredHeight)
					}
				}
			}
		}
	}, [extractBlock, actualHeaderHeight])

	// ✅ Callback ref per salvare il riferimento all'overlay
	const overlayCallbackRef = (element: HTMLDivElement | null) => {
		overlayRef.current = element
	}

	// ✅ Intercetta tutti i click/mousedown in fase di capture per prevenire che raggiungano gli elementi sottostanti
	useLayoutEffect(() => {
		const overlayElement = overlayRef.current

		if (!overlayElement) {
			return
		}

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
				return // ✅ NON bloccare i click su elementi interattivi
			}

			// ✅ Se il click è dentro l'overlay ma NON su un elemento interattivo, bloccalo
			if (overlayElement.contains(target)) {
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
				return // ✅ NON bloccare i mousedown su elementi interattivi
			}

			// ✅ Se il mousedown è dentro l'overlay ma NON su un elemento interattivo, bloccalo
			if (overlayElement.contains(target)) {
				e.stopPropagation()
				e.stopImmediatePropagation()
			}
		}

		// ✅ Aggiungi listener in fase di capture sul document (per intercettare prima di useNativeSelection)
		// ✅ Usa addEventListener con capture: true per intercettare PRIMA di useNativeSelection
		document.addEventListener('click', handleCaptureClick, true)
		document.addEventListener('mousedown', handleCaptureMouseDown, true)

		return () => {
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

	// ✅ Handler per estrarre testo dal rettangolo (opzionale, a posteriori)
	const handleExtractText = async () => {
		if (!extractData || !hasNativeText) return

		const pageNum = selection.page
		const pageLayer = pageElsRef.current.get(pageNum)
		if (!pageLayer) return

		const textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
		if (!textLayer) {
			console.warn('[ExtractBlockOverlay] Text layer non trovato')
			return
		}

		setIsExtractingText(true)

		try {
			const pr = pageLayer.getBoundingClientRect()
			const viewportBox = {
				x: selection.x0Pct * pr.width,
				y: selection.y0Pct * pr.height,
				w: (selection.x1Pct - selection.x0Pct) * pr.width,
				h: (selection.y1Pct - selection.y0Pct) * pr.height
			}

			const { text } = await getSelectedTextInRect(textLayer, viewportBox)

			if (text && text.trim().length > 0) {
				// ✅ Aggiorna extractData con il testo estratto
				const updatedData: ExtractData = {
					...extractData,
					content: text.trim()
				}

				// ✅ Aggiorna extractBlock con il testo
				const updatedBlock: ExtractBlockType = {
					...extractBlock!,
					extract: updatedData
				}

				setExtractData(updatedData)
				setExtractBlock(updatedBlock)
			}
		} catch (error) {
			console.error('[ExtractBlockOverlay] Errore durante estrazione testo:', error)
		} finally {
			setIsExtractingText(false)
		}
	}

	// ✅ Verifica se il testo può essere estratto (haNativeText e testo non ancora estratto)
	const canExtractText = hasNativeText === true && (!extractData?.content || extractData.content.trim().length === 0)

	if (isLoading || !extractBlock || !extractData) {
		return null
	}

	const root = overlayRootsRef.current.get(selection.page)
	if (!root) return null

	// ✅ Calcola dimensioni in pixel per posizionamento preciso
	const pageLayer = pageElsRef.current.get(selection.page)
	const pageRect = pageLayer?.getBoundingClientRect()
	if (!pageRect) return null

	// ✅ Usa le dimensioni reali dell'overlay root (textLayer) per coerenza con le percentuali
	const rootRect = root.getBoundingClientRect()
	const baseRect = (rootRect.width > 0 && rootRect.height > 0) ? rootRect : pageRect

	const selectionWidth = (selection.x1Pct - selection.x0Pct) * baseRect.width
	const selectionHeight = (selection.y1Pct - selection.y0Pct) * baseRect.height

	// ✅ Usa altezza reale misurata invece di valore stimato
	const headerHeight = actualHeaderHeight
	const footerHeight = 50 // Altezza approssimativa del footer (pulsanti)
	const observationHeight = extractBlock.hasObservation ? 120 : 0 // Altezza campo osservazione se presente

	// ✅ Posiziona overlay: inizia SOPRA il rettangolo per includere l'header
	const left = `${selection.x0Pct * 100}%`
	const width = `${(selection.x1Pct - selection.x0Pct) * 100}%`
	// ✅ Top: inizia SOPRA il rettangolo per includere l'header
	const top = `calc(${selection.y0Pct * 100}% - ${headerHeight}px)`
	// ✅ Altezza esatta: header + rettangolo + footer (+ eventuale osservazione)
	// ✅ IMPORTANTE: selectionHeight deve corrispondere esattamente alle dimensioni del contenuto nella card
	const overlayHeight = headerHeight + selectionHeight + footerHeight + observationHeight

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
				height: `${overlayHeight}px`, // ✅ Altezza esatta per evitare espansioni
				maxHeight: `${overlayHeight}px`,
				zIndex: 10000,
				pointerEvents: 'auto',
				overflow: 'hidden', // ✅ Evita che il contenuto allarghi la card oltre il rettangolo
				background: '#ffffff', // ✅ Fondo opaco (non trasparente)
				border: '2px solid rgba(59,130,246,0.8)', // ✅ Bordo simile al rettangolo
				borderRadius: 2,
				boxShadow: '0 2px 8px rgba(0,0,0,0.15)' // ✅ Ombra per distinguerlo dal documento
			}}
			onClick={(e) => {
				e.stopPropagation()
			}}
			onMouseDown={(e) => {
				e.stopPropagation()
			}}
		>
			<div
				ref={contentWrapperRef} // ✅ Ref per misurare altezza header
				className="flex flex-col relative"
				style={{ overflow: 'hidden' }} // ✅ Mantieni layout dentro l'altezza fissata
				onClick={(e) => {
					e.stopPropagation()
				}}
				onMouseDown={(e) => {
					e.stopPropagation()
				}}
			>
				{/* ✅ ExtractBlock: header normale sopra, contenuto inizia subito dopo l'header */}
				<ExtractBlock
					block={extractBlock}
					onUpdate={(updatedBlock) => {
						setExtractBlock(updatedBlock)
					}}
					onDragStart={(e) => {
						// ✅ Quando si trascina dall'overlay, imposta i dati con flag fromOverlay
						if (!extractData || !extractBlock) return

						// ✅ Aggiorna ExtractData con i metadati da ExtractBlock
						const updatedExtract: ExtractData = {
							...extractData,
							title: extractBlock.title,
							observation: extractBlock.observation,
							hasObservation: extractBlock.hasObservation,
							collapsed: extractBlock.collapsed
						}

						e.dataTransfer.setData('application/json', JSON.stringify({
							type: 'extract',
							extract: updatedExtract,
							title: updatedExtract.title,
							observation: updatedExtract.observation,
							hasObservation: updatedExtract.hasObservation,
							collapsed: updatedExtract.collapsed,
							fromOverlay: true // ✅ Flag per indicare che viene dall'overlay
						}))
						e.dataTransfer.effectAllowed = 'move'
					}}
					readOnly={false}
					isOverlay={true} // ✅ Passa isOverlay per mostrare immagine a dimensione originale
					overlayHeaderOffset={headerHeight} // ✅ Passa l'offset (non più usato per absolute, ma per calcoli)
					overlayContentHeight={selectionHeight} // ✅ Passa altezza esatta del contenuto per mostrare tutto il rettangolo
					isImageLoading={isImageLoading} // ✅ Passa lo stato di loading dell'immagine
				/>

				{/* ✅ Footer con pulsanti: "Estrai testo" / "Aggiungi osservazione" a sinistra, "Annulla" e "Salva estratto" a destra */}
				{/* ✅ Mantieni mt-2 per spazio al contenuto (rettangolo selezionato), ma rimuovi border-t per evitare la "fascetta grigia" */}
				<div className="mt-2 flex items-center justify-between gap-2 flex-shrink-0 p-2 bg-background">
					{/* Pulsanti a sinistra */}
					<div className="flex gap-2">
						{/* Pulsante "Estrai testo" (opzionale, solo se haNativeText e testo non estratto) */}
						{canExtractText && (
							<button
								onClick={(e) => {
									e.stopPropagation()
									handleExtractText()
								}}
								onMouseDown={(e) => {
									e.stopPropagation()
								}}
								disabled={isExtractingText}
								className="px-2 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isExtractingText ? 'Estrazione...' : 'Estrai testo'}
							</button>
						)}

						{/* Pulsante "Aggiungi osservazione" (solo se non c'è già) */}
						{!extractBlock.hasObservation && (
							<button
								onClick={(e) => {
									e.stopPropagation()
									if (extractBlock) {
										const updatedBlock = { ...extractBlock, hasObservation: true, observation: '' }
										setExtractBlock(updatedBlock)
									}
								}}
								onMouseDown={(e) => {
									e.stopPropagation()
								}}
								className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded transition-colors"
							>
								Aggiungi osservazione
							</button>
						)}
					</div>

					{/* Spacer per spingere i pulsanti a destra */}
					<div className="flex-1" />

					{/* Pulsanti "Annulla" e "Salva estratto" a destra */}
					<div className="flex gap-2">
						<button
							onClick={(e) => {
								e.stopPropagation()
								handleCancel()
							}}
							className="px-2 py-1 bg-muted text-foreground hover:bg-muted/80 rounded text-xs font-medium transition-colors"
						>
							Annulla
						</button>
						<button
							onClick={(e) => {
								e.stopPropagation()
								handleAddExtract()
							}}
							className="px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs font-medium transition-colors"
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
