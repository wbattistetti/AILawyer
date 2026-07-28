import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'
import { cropCanvasFromViewportBox } from '../utils/canvasCrop'
import { ExtractBlock } from '../../../../features/defense-memory/components/table-editor/components/ExtractBlock'
import { ExtractBlock as ExtractBlockType, ExtractData } from '../../../../features/defense-memory/components/table-editor/types/blocks.types'
import { isSearchSurfaceTarget } from '../../../search/searchSurfaceContract'

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
	praticaId?: string  // ✅ ID pratica per estrazione anagrafica
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
	const overlayRef = useRef<HTMLDivElement | null>(null)
	const contentWrapperRef = useRef<HTMLDivElement | null>(null) // ✅ Ref per il wrapper del contenuto
	const imageRef = useRef<HTMLImageElement | null>(null) // ✅ Ref per l'immagine ritagliata (per highlight)
	const [actualHeaderHeight, setActualHeaderHeight] = useState<number>(60) // ✅ Altezza reale misurata

	// Create ExtractBlock immediately from geometry; text/screenshot may arrive later.
	useEffect(() => {
		const pageNum = selection.page
		const pageLayer = pageElsRef.current.get(pageNum)

		if (!pageLayer) {
			setIsLoading(false)
			return
		}

		const pr = pageLayer.getBoundingClientRect()

		let viewportBox: { x: number; y: number; w: number; h: number }
		if (selection.viewportBox) {
			viewportBox = selection.viewportBox
		} else {
			console.warn('[ExtractBlockOverlay] viewportBox non disponibile, usando fallback percentuali')
			viewportBox = {
				x: selection.x0Pct * pr.width,
				y: selection.y0Pct * pr.height,
				w: (selection.x1Pct - selection.x0Pct) * pr.width,
				h: (selection.y1Pct - selection.y0Pct) * pr.height
			}
		}

		let displayName = docName || selection.source || lastSelection?.source || 'Documento'
		if (displayName.toLowerCase().endsWith('.pdf')) {
			displayName = displayName.slice(0, -4)
		}
		if (displayName.startsWith('Documento ')) {
			displayName = displayName.replace('Documento ', '')
		}

		const initialText = selection.text || lastSelection?.text || ''
		const initialImage = selection.imageDataUrl || lastSelection?.imageDataUrl
		const waitingForContent = selection.contentReady === false && !initialImage && !initialText.trim()

		const data: ExtractData = {
			id: `extract_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			content: initialText,
			source: displayName,
			page: pageNum,
			bbox: {
				x0Pct: selection.x0Pct,
				y0Pct: selection.y0Pct,
				x1Pct: selection.x1Pct,
				y1Pct: selection.y1Pct
			},
			createdAt: new Date(),
			title: '',
			observation: '',
			hasObservation: false,
			collapsed: false,
			imageDataUrl: initialImage
		}

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

		// Sync mount: show chrome (header/buttons/rect) in the same turn as mouseup.
		setExtractData(data)
		setExtractBlock(block)
		setIsLoading(false)
		setIsImageLoading(!initialImage && (waitingForContent || hasNativeText === false))

		const isOcrDocument = hasNativeText === false
		const hasText = initialText.trim().length > 0
		const shouldCropImage = !initialImage && (isOcrDocument || !hasText)
		let cancelled = false

		if (!shouldCropImage || !viewportBox) {
			return () => {
				cancelled = true
			}
		}

		void (async () => {
			try {
				const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
				const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null
				if (!canvas || canvas.width <= 0 || canvas.height <= 0) return

				const croppedImage = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
				if (cancelled || !croppedImage) return

				setExtractData(prev => prev ? { ...prev, imageDataUrl: croppedImage } : prev)
				setExtractBlock(prev => prev ? {
					...prev,
					extract: { ...prev.extract, imageDataUrl: croppedImage }
				} : prev)
				setIsImageLoading(false)
			} catch (error) {
				console.error('[ExtractBlockOverlay] Errore durante il ritaglio immagine:', error)
			}
		})()

		return () => {
			cancelled = true
		}
		// Re-init only when the selection identity changes (optimistic updates patch the same id).
		// eslint-disable-next-line react-hooks/exhaustive-deps -- selection.id is the stable key
	}, [selection.id, pageElsRef, docName, hasNativeText])

	// Patch text/screenshot when the shell finishes background extraction.
	useEffect(() => {
		const currentText = selection.text || lastSelection?.text || ''
		const currentImageDataUrl = selection.imageDataUrl || lastSelection?.imageDataUrl
		const contentReady = selection.contentReady === true

		if (!extractData || !extractBlock) return

		const nextText = currentText || extractData.content
		const nextImage = currentImageDataUrl || extractData.imageDataUrl
		const textChanged = nextText !== extractData.content
		const imageChanged = nextImage !== extractData.imageDataUrl

		if (textChanged || imageChanged) {
			setExtractData(prev => prev ? {
				...prev,
				content: nextText,
				imageDataUrl: nextImage
			} : prev)
			setExtractBlock(prev => prev ? {
				...prev,
				extract: {
					...prev.extract,
					content: nextText,
					imageDataUrl: nextImage
				}
			} : prev)
		}

		if (currentImageDataUrl || contentReady || (currentText.trim() && hasNativeText !== false)) {
			setIsImageLoading(false)
		}
	}, [
		selection.text,
		selection.imageDataUrl,
		selection.contentReady,
		lastSelection?.text,
		lastSelection?.imageDataUrl,
		extractData,
		extractBlock,
		hasNativeText
	])

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

			if (isSearchSurfaceTarget(target)) {
				return
			}

			// ✅ NON bloccare se il click è su un elemento interattivo (button, input, textarea, etc.)
			// ✅ Verifica anche se il target è un figlio di un elemento interattivo
			const isInteractiveElement = target && (
				target.tagName === 'BUTTON' ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.closest('button') !== null ||
				target.closest('input') !== null ||
				target.closest('textarea') !== null ||
				target.closest('select') !== null ||
				target.closest('label') !== null ||
				target.closest('[role="combobox"]') !== null ||
				target.closest('[role="listbox"]') !== null ||
				target.closest('[data-radix-select-content]') !== null ||
				target.closest('[data-radix-popper-content-wrapper]') !== null ||
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

			if (isSearchSurfaceTarget(target)) {
				return
			}

			// ✅ NON bloccare se il mousedown è su un elemento interattivo (button, input, textarea, etc.)
			// ✅ Verifica anche se il target è un figlio di un elemento interattivo
			const isInteractiveElement = target && (
				target.tagName === 'BUTTON' ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.closest('button') !== null ||
				target.closest('input') !== null ||
				target.closest('textarea') !== null ||
				target.closest('select') !== null ||
				target.closest('label') !== null ||
				target.closest('[role="combobox"]') !== null ||
				target.closest('[role="listbox"]') !== null ||
				target.closest('[data-radix-select-content]') !== null ||
				target.closest('[data-radix-popper-content-wrapper]') !== null ||
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

	/**
	 * Salva unificato:
	 * - con tipo → riga nel Riporto generale
	 * - senza tipo → estratto sciolto nel Cassetto
	 */
	const handleSave = () => {
		if (!extractData || !extractBlock) {
			throw new Error('handleSave: extract data is not ready')
		}

		const updatedExtract: ExtractData = {
			...extractData,
			...extractBlock.extract,
			title: extractBlock.title,
			observation: extractBlock.observation,
			hasObservation: extractBlock.hasObservation,
			collapsed: extractBlock.collapsed,
		}

		if (updatedExtract.cellType) {
			window.dispatchEvent(
				new CustomEvent('app:qualified-extract-to-report', {
					detail: { extract: updatedExtract },
				})
			)
		} else {
			extractClipboardManager.copy({
				content: updatedExtract.content,
				imageDataUrl: updatedExtract.imageDataUrl,
				source: updatedExtract.source,
				page: updatedExtract.page,
				bbox: updatedExtract.bbox,
			})
			if (onExtractAdd) {
				onExtractAdd(updatedExtract)
			}
		}

		setPersistentSelections((prev) => prev.filter((s) => s.id !== selection.id))
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

	// ✅ Usa le dimensioni reali dell'overlay root (textLayer) per coerenza con le percentuali
	const rootRect = root.getBoundingClientRect()
	const baseRect = (rootRect.width > 0 && rootRect.height > 0) ? rootRect : pageRect

	const selectionHeight = (selection.y1Pct - selection.y0Pct) * baseRect.height

	// ✅ Usa altezza reale misurata invece di valore stimato
	const headerHeight = actualHeaderHeight
	const observationHeight = extractBlock.hasObservation ? 120 : 0 // Altezza campo osservazione se presente

	// ✅ Posiziona overlay: inizia SOPRA il rettangolo per includere l'header
	const left = `${selection.x0Pct * 100}%`
	const width = `${(selection.x1Pct - selection.x0Pct) * 100}%`
	// ✅ Top: inizia SOPRA il rettangolo per includere l'header
	const top = `calc(${selection.y0Pct * 100}% - ${headerHeight}px)`
	// ✅ Altezza esatta: header + rettangolo (+ eventuale osservazione)
	// ✅ IMPORTANTE: selectionHeight deve corrispondere esattamente alle dimensioni del contenuto nella card
	const overlayHeight = headerHeight + selectionHeight + observationHeight

	const overlayNode = (
		<div
			ref={overlayCallbackRef} // ✅ Callback ref per intercettare eventi in fase di capture
			data-extract-overlay="true" // ✅ Attributo per identificare l'overlay in useNativeSelection
			className="extract-block-overlay" // ✅ Classe per identificare l'overlay
			style={{
				position: 'absolute',
				left,
				top,
				width,
				height: `${overlayHeight}px`,
				maxWidth: width,
				maxHeight: `${overlayHeight}px`,
				minWidth: 0,
				zIndex: 10000,
				pointerEvents: 'auto',
				overflow: 'hidden',
				background: '#ffffff',
				border: '2px solid rgba(59,130,246,0.8)',
				borderRadius: 2,
				boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
				boxSizing: 'border-box'
			}}
			onClick={(e) => {
				e.stopPropagation()
			}}
			onMouseDown={(e) => {
				e.stopPropagation()
			}}
		>
			<div
				ref={contentWrapperRef}
				className="flex flex-col relative min-w-0 w-full h-full"
				style={{ overflow: 'hidden', minWidth: 0 }}
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
					showQualifier
					headerActions={
						<>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									handleCancel()
								}}
								className="px-2 py-1 bg-muted text-foreground hover:bg-muted/80 rounded text-xs font-medium transition-colors"
							>
								Annulla
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									handleSave()
								}}
								className="px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs font-medium transition-colors"
							>
								Salva
							</button>
						</>
					}
					onUpdate={(updatedBlock) => {
						setExtractBlock(updatedBlock)
						setExtractData((prev) =>
							prev
								? {
										...prev,
										...updatedBlock.extract,
										title: updatedBlock.title,
										observation: updatedBlock.observation,
										hasObservation: updatedBlock.hasObservation,
										collapsed: updatedBlock.collapsed,
									}
								: prev
						)
					}}
					onDragStart={(e) => {
						// ✅ Quando si trascina dall'overlay, imposta i dati con flag fromOverlay
						if (!extractData || !extractBlock) return

						// ✅ Aggiorna ExtractData con i metadati da ExtractBlock
						const updatedExtract: ExtractData = {
							...extractData,
							...extractBlock.extract,
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
					imageRef={imageRef} // ✅ Passa il ref all'immagine per highlight
				/>
			</div>
		</div>
	)

	return createPortal(overlayNode, root)
}
