import React from 'react'
import { createPortal } from 'react-dom'
import type { PersistentSelection } from '../types'
import { extractClipboardManager } from '../../../../utils/extractClipboard'
import { cropCanvasFromViewportBox } from '../utils/canvasCrop'

interface FloatingExtractButtonProps {
	selection: PersistentSelection
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	lastSelection: any
	onClose: () => void
	setPersistentSelections: (selections: PersistentSelection[] | ((prev: PersistentSelection[]) => PersistentSelection[])) => void
	docName?: string
	hasNativeText?: boolean
}

export const FloatingExtractButton: React.FC<FloatingExtractButtonProps> = ({
	selection,
	pageElsRef,
	lastSelection,
	onClose,
	setPersistentSelections,
	docName,
	hasNativeText
}) => {
	const buttonRef = React.useRef<HTMLButtonElement>(null)
	const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null)

	React.useEffect(() => {
		const pageLayer = pageElsRef.current.get(selection.page)
		if (!pageLayer) return

		const updatePosition = () => {
			const rect = pageLayer.getBoundingClientRect()
			// ✅ Posiziona il pulsante in fondo alla selezione (y1Pct), nel bordo destro (x1Pct)
			const buttonWidth = 150 // Larghezza approssimativa del pulsante
			const buttonHeight = 40 // Altezza approssimativa del pulsante
			const x = rect.left + selection.x1Pct * rect.width - buttonWidth - 5 // Bordo destro, con margine di 5px
			const y = rect.top + selection.y1Pct * rect.height - buttonHeight - 5 // Fondo selezione, con margine di 5px
			setPosition({ x, y })
		}

		updatePosition()
		window.addEventListener('resize', updatePosition)
		window.addEventListener('scroll', updatePosition, true)

		return () => {
			window.removeEventListener('resize', updatePosition)
			window.removeEventListener('scroll', updatePosition, true)
		}
	}, [selection, pageElsRef])

	const handleCopyExtract = React.useCallback(async () => {
		console.log('🔥🔥🔥 [FloatingButton] ===== COPIA ESTRATTO CHIAMATA ===== 🔥🔥🔥')

		const pageNum = selection.page
		const pageLayer = pageElsRef.current.get(pageNum)

		if (!pageLayer) {
			console.warn('[FloatingButton] Pagina non trovata:', pageNum)
			return
		}

		const pr = pageLayer.getBoundingClientRect()
		const viewportBox = {
			x: selection.x0Pct * pr.width,
			y: selection.y0Pct * pr.height,
			w: (selection.x1Pct - selection.x0Pct) * pr.width,
			h: (selection.y1Pct - selection.y0Pct) * pr.height
		}

		const bbox = {
			x0Pct: selection.x0Pct,
			y0Pct: selection.y0Pct,
			x1Pct: selection.x1Pct,
			y1Pct: selection.y1Pct
		}

		// Nome documento
		let displayName = docName || lastSelection?.source || 'Documento'
		if (displayName.toLowerCase().endsWith('.pdf')) {
			displayName = displayName.slice(0, -4)
		}
		if (displayName.startsWith('Documento ')) {
			displayName = displayName.replace('Documento ', '')
		}

		// ✅ Ritaglia immagine se:
		// 1. È un documento OCR (hasNativeText === false), OPPURE
		// 2. Non c'è testo nella selezione (per documenti scansionati)
		const isOcrDocument = hasNativeText === false
		const hasText = !!(lastSelection?.text && lastSelection.text.trim().length > 0)
		const shouldCropImage = isOcrDocument || !hasText

		let imageDataUrl: string | undefined = undefined

		console.log('[FloatingButton] 🔍 Controllo ritaglio immagine:', {
			isOcrDocument,
			hasText,
			shouldCropImage,
			hasNativeText,
			textLength: lastSelection?.text?.length || 0
		})

		if (shouldCropImage && viewportBox) {
			try {
				const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
				const canvas = (canvasLayer?.querySelector('canvas') || pageLayer.querySelector('canvas')) as HTMLCanvasElement | null

				console.log('[FloatingButton] 🔍 Tentativo ritaglio immagine:', {
					hasCanvas: !!canvas,
					hasCanvasLayer: !!canvasLayer,
					viewportBox
				})

				if (canvas) {
					const croppedImage = await cropCanvasFromViewportBox(canvas, viewportBox, pageLayer)
					if (croppedImage) {
						imageDataUrl = croppedImage
						console.log('✅ [FloatingButton] Immagine ritagliata con successo, lunghezza:', croppedImage.length)
					} else {
						console.warn('[FloatingButton] ⚠️ cropCanvasFromViewportBox ha restituito null/undefined')
					}
				} else {
					console.warn('[FloatingButton] ⚠️ Canvas non trovato per ritaglio immagine')
				}
			} catch (error) {
				console.error('[FloatingButton] ❌ Errore durante il ritaglio immagine:', error)
			}
		}

		const extractData = {
			content: lastSelection?.text || '',
			imageDataUrl,
			source: displayName,
			page: pageNum,
			bbox
		}

		console.log('[FloatingButton] 📦 ExtractData preparato:', {
			hasContent: !!extractData.content,
			contentLength: extractData.content?.length || 0,
			hasImage: !!extractData.imageDataUrl,
			imageLength: extractData.imageDataUrl?.length || 0,
			source: extractData.source,
			page: extractData.page
		})

		if (!extractData.content && !extractData.imageDataUrl) {
			console.warn('[FloatingButton] ⚠️ Nessun contenuto da copiare (né testo né immagine)')
			return
		}

		// Copia nella clipboard
		console.log('[FloatingButton] 📋 Chiamando extractClipboardManager.copy()...')
		extractClipboardManager.copy(extractData)
		console.log('✅ [FloatingButton] extractClipboardManager.copy() chiamato con successo:', {
			hasText: !!extractData.content,
			hasImage: !!extractData.imageDataUrl,
			imageLength: extractData.imageDataUrl?.length || 0,
			page: extractData.page,
			source: extractData.source
		})

		// Copia anche nella clipboard del browser
		if (extractData.content) {
			try {
				await navigator.clipboard.writeText(extractData.content)
			} catch (error) {
				console.error('[FloatingButton] Errore copiando nella clipboard del browser:', error)
			}
		}

		// Rimuovi selezione dopo 2 secondi
		setTimeout(() => {
			setPersistentSelections(prev => prev.filter(s => s.id !== selection.id))
		}, 2000)

		onClose()
	}, [selection, pageElsRef, lastSelection, docName, hasNativeText, onClose, setPersistentSelections])

	// ✅ Aggiungi listener diretto sul DOM per catturare il click
	React.useEffect(() => {
		const button = buttonRef.current
		if (!button) return

		const handleClick = (e: MouseEvent) => {
			console.log('🔥🔥🔥 [FloatingButton] DOM click listener TRIGGERED!')
			e.preventDefault()
			e.stopPropagation()
			e.stopImmediatePropagation()
			handleCopyExtract()
		}

		const handleMouseDown = (e: MouseEvent) => {
			console.log('🔥🔥🔥 [FloatingButton] DOM mousedown listener TRIGGERED!')
			e.preventDefault()
			e.stopPropagation()
			e.stopImmediatePropagation()
		}

		// Usa capture phase per catturare il click prima di altri handler
		button.addEventListener('click', handleClick, { capture: true })
		button.addEventListener('mousedown', handleMouseDown, { capture: true })

		return () => {
			button.removeEventListener('click', handleClick, { capture: true })
			button.removeEventListener('mousedown', handleMouseDown, { capture: true })
		}
	}, [position, handleCopyExtract]) // ✅ Riapplica quando la posizione cambia o handleCopyExtract cambia

	if (!position) return null

	const buttonElement = (
		<div className="extract-button-container" style={{ position: 'fixed', zIndex: 99999, pointerEvents: 'auto' }}>
			<button
				ref={buttonRef}
				data-extract-button="true"
				type="button"
				className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors pointer-events-auto cursor-pointer"
				style={{
					left: `${position.x}px`,
					top: `${position.y}px`,
					position: 'fixed',
					zIndex: 99999
				}}
				onMouseDown={(e) => {
					console.log('🔥🔥🔥 [FloatingButton] onMouseDown TRIGGERED!')
					e.preventDefault()
					e.stopPropagation()
					e.stopImmediatePropagation()
				}}
				onClick={(e) => {
					console.log('🔥🔥🔥 [FloatingButton] onClick TRIGGERED!')
					e.preventDefault()
					e.stopPropagation()
					e.stopImmediatePropagation()
					handleCopyExtract()
				}}
			>
				Estratto
			</button>
		</div>
	)

	// ✅ Renderizza in un portal per evitare interferenze con event handlers
	return createPortal(buttonElement, document.body)
}
