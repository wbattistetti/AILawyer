import { useEffect, useRef, useCallback } from 'react'
import { getSelectedTextInRect } from '../utils/textExtraction'

export interface NativeSelectionHookProps {
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	extractOpen: boolean
	hostRef: React.RefObject<HTMLDivElement>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	pdfDocRef: React.MutableRefObject<any>
	setDraft: (draft: any) => void
	setExtractPos: (pos: { x: number; y: number }) => void
	setExtractPage: (page: number) => void
	setLastSelection: (selection: any) => void
	setContextMenu: (menu: { x: number; y: number; visible: boolean }) => void
	selectionHandledRef: React.MutableRefObject<boolean>
}

export const useNativeSelection = ({
	selectMode,
	selectKind,
	extractOpen,
	hostRef,
	pageElsRef,
	elToPageRef,
	overlayRootsRef,
	pdfDocRef,
	setDraft,
	setExtractPos,
	setExtractPage,
	setLastSelection,
	setContextMenu,
	selectionHandledRef
}: NativeSelectionHookProps) => {
	const isSelectingRef = useRef(false)
	const mouseDownPageRef = useRef<number | null>(null)
	const mouseDownPosRef = useRef<{ xPct: number; yPct: number } | null>(null)
	const lastDraftBoxRef = useRef<Array<{
		page: number
		x0Pct: number
		y0Pct: number
		x1Pct: number
		y1Pct: number
	}> | null>(null)
	const timerRef = useRef<number | null>(null)

	const handleSelection = useCallback(() => {
		// Logica per gestire la selezione nativa
		try {
			console.log('[NATIVE][event] selectionchange handler')
		} catch {}
	}, [])

	useEffect(() => {
		if (!selectMode || selectKind !== 'NATIVE') return

		const host = hostRef.current
		if (!host) return

		let timer: number | null = null

		const onMouseDown = (ev: MouseEvent) => {
			if (extractOpen) return
			
			const x = ev.clientX
			const y = ev.clientY
			const hostR = host.getBoundingClientRect()
			
			if (x < hostR.left || x > hostR.right || y < hostR.top || y > hostR.bottom) return

			isSelectingRef.current = true
			host.classList.add('is-dragging')
			console.log('[NATIVE][DEBUG] MouseDown - isSelecting: true, added is-dragging class')

			// Trova la pagina del mouse down
			let pn = 0
			const holders = Array.from((host.querySelectorAll('[data-page-number]') as NodeListOf<HTMLElement>))
			
			for (const h of holders) {
				const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
				if (!layer) continue
				const r = layer.getBoundingClientRect()
				const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
				if (inside) { 
					const parsed = parseInt(h.getAttribute('data-page-number') || '', 10)
					if (Number.isFinite(parsed) && parsed > 0) { 
						pn = parsed
						break 
					} 
				}
			}

			if (!pn) {
				// fallback to closest
				const t = ev.target as HTMLElement
				const pageLayer = t.closest('.rpv-core__page-layer') as HTMLElement | null
				if (pageLayer) pn = elToPageRef.current.get(pageLayer) || 0
			}

			if (!pn) {
				const holdersDoc = Array.from((document.querySelectorAll('[data-page-number]') as NodeListOf<HTMLElement>))
				for (const h of holdersDoc) {
					const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
					if (!layer) continue
					const r = layer.getBoundingClientRect()
					const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
					if (inside) { 
						const parsed = parseInt(h.getAttribute('data-page-number') || '', 10)
						if (Number.isFinite(parsed) && parsed > 0) { 
							pn = parsed
							break 
						} 
					}
				}
			}

			if (pn > 0) mouseDownPageRef.current = pn

			// seed a zero-area draft to keep visual highlight persistent from the first pixel
			try {
				const layer = pageElsRef.current.get(mouseDownPageRef.current || 0)
				if (layer) {
					const r = layer.getBoundingClientRect()
					const ax = (x - r.left) / r.width
					const ay = (y - r.top) / r.height
					mouseDownPosRef.current = { xPct: ax, yPct: ay }
				}
			} catch {}

			try { 
				console.log('[NATIVE][event] mousedown start selecting', { mouseDownPage: mouseDownPageRef.current }) 
			} catch {}
		}

		const onMouseUp = async (ev: MouseEvent) => {
			// ignora click su UI esterne
			const hostR = host.getBoundingClientRect()
			if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
			if (extractOpen) { 
				try { console.log('[NATIVE][mouseup] ignored: extractOpen') } catch {}
				return 
			}
			if (timer) window.clearTimeout(timer)
			
			console.log('[NATIVE][DEBUG] MouseUp - isSelecting: false, removing is-dragging class')
			console.log('[NATIVE][event] mouseup within viewer', { x: ev.clientX, y: ev.clientY, wasSelecting: isSelectingRef.current })
			
			isSelectingRef.current = false
			host.classList.remove('is-dragging')
			
			// ✅ NUOVA LOGICA: Usa le coordinate del draft box invece di window.getSelection()
			const draftBoxes = lastDraftBoxRef.current
			console.log('[DRAG][END]', { 
				hasDraftBox: !!draftBoxes,
				draftBoxes
			})
			
			if (!draftBoxes || draftBoxes.length === 0) {
				console.warn('[DRAG][END] No draft box saved, skipping extraction')
				try { setDraft(null) } catch {}
				return
			}
			
			try {
				// Per compatibilità, prendi la prima pagina (MVP per trans-pagina verrà dopo)
				const firstDraftBox = draftBoxes[0]
				const pageNum = firstDraftBox.page
				const pageLayer = pageElsRef.current.get(pageNum)
				
				if (!pageLayer) {
					console.warn('[DRAG][END] No page layer found for page', pageNum)
					try { setDraft(null) } catch {}
					return
				}
				
				const textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
				if (!textLayer) {
					console.warn('[DRAG][END] No text layer found for page', pageNum)
					try { setDraft(null) } catch {}
					return
				}
				
				const pr = pageLayer.getBoundingClientRect()
				
				// Converti percentuali in coordinate pixel
				const viewportBox = {
					x: firstDraftBox.x0Pct * pr.width,
					y: firstDraftBox.y0Pct * pr.height,
					w: (firstDraftBox.x1Pct - firstDraftBox.x0Pct) * pr.width,
					h: (firstDraftBox.y1Pct - firstDraftBox.y0Pct) * pr.height
				}
				
				console.log('[DRAG][EXTRACT][START]', { pageNum, viewportBox, draftBox: firstDraftBox })
				
				// Estrai il testo usando le coordinate del rettangolo
				const { text } = await getSelectedTextInRect(textLayer, viewportBox)
				
				console.log('[DRAG][EXTRACT][TEXT]', { 
					textLength: text.length, 
					textPreview: text.substring(0, 100)
				})
				
				// ✅ NUOVO: Crea selezione nativa programmaticamente dalle coordinate del rettangolo
				try {
					const textLayerRect = textLayer.getBoundingClientRect()
					const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
					
					const spansInBox: HTMLElement[] = []
					for (const span of spans) {
						const r = span.getBoundingClientRect()
						const yTop = r.top - textLayerRect.top
						const yBot = r.bottom - textLayerRect.top
						const xLeft = r.left - textLayerRect.left
						const xRight = r.right - textLayerRect.left
						
						// Controlla se lo span interseca il rettangolo
						const overlap = !(xRight < viewportBox.x || xLeft > (viewportBox.x + viewportBox.w) || 
										 yBot < viewportBox.y || yTop > (viewportBox.y + viewportBox.h))
						
						if (overlap) spansInBox.push(span)
					}
					
					console.log('[NATIVE-SEL][CREATE]', { 
						spansFound: spansInBox.length,
						boxCoords: viewportBox
					})
					
					if (spansInBox.length > 0) {
						// Ordina gli span per posizione (top -> bottom, left -> right)
						spansInBox.sort((a, b) => {
							const ra = a.getBoundingClientRect()
							const rb = b.getBoundingClientRect()
							const diffY = (ra.top - textLayerRect.top) - (rb.top - textLayerRect.top)
							if (Math.abs(diffY) > 5) return diffY // Diversa riga
							return (ra.left - textLayerRect.left) - (rb.left - textLayerRect.left) // Stessa riga, ordina per x
						})
						
						// Crea Range dal primo all'ultimo span
						const range = document.createRange()
						const firstSpan = spansInBox[0]
						const lastSpan = spansInBox[spansInBox.length - 1]
						
						// Seleziona dall'inizio del primo span alla fine dell'ultimo
						const firstNode = firstSpan.firstChild || firstSpan
						const lastNode = lastSpan.lastChild || lastSpan
						
						range.setStart(firstNode, 0)
						range.setEnd(lastNode, lastNode.textContent?.length || 0)
						
						// Applica la selezione
						const sel = window.getSelection()
						if (sel) {
							sel.removeAllRanges()
							sel.addRange(range)
							console.log('[NATIVE-SEL][APPLIED]', { 
								selectedText: sel.toString().substring(0, 80),
								rangeText: range.toString().substring(0, 80)
							})
						}
					} else {
						console.warn('[NATIVE-SEL] No spans found in box')
					}
				} catch (err) {
					console.error('[NATIVE-SEL][ERROR]', err)
				}
				
				// Calcola posizione pannello
				const panelW = 460, panelH = 260
				let px = pr.left + viewportBox.x + (viewportBox.w - panelW) / 2
				let py = pr.top + viewportBox.y + (viewportBox.h - panelH) / 2
				px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
				py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
				
				setExtractPos({ x: px, y: py })
				setExtractPage(pageNum)
				
				// Calcola PDF coordinates
				try {
					if (pdfDocRef.current) {
						const page = await pdfDocRef.current.getPage(pageNum)
						const base = page.getViewport({ scale: 1 })
						const domW = pr.width
						const scale = Math.max(0.1, domW / base.width)
						const vp = page.getViewport({ scale })
						const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
						const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
						
						const selection = { 
							pdfPageNumber: pageNum, 
							bboxPdf: { x0, y0, x1, y1 }, 
							viewportBox, 
							text 
						}
						
						console.log('[DRAG][EXTRACT][SET-SELECTION]', { hasText: !!text, textLen: text.length })
						setLastSelection(selection)
					} else {
						setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
					}
				} catch (e) {
					console.warn('[DRAG][EXTRACT][pdfbox][err]', e)
					setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
				}
				
				// Apri il context menu invece del dialog
				selectionHandledRef.current = true
				setContextMenu({ x: ev.clientX, y: ev.clientY, visible: true })
				
			} catch (error) {
				console.error('[DRAG][EXTRACT][ERROR]', error)
			} finally {
				// ✅ NATIVE: rimuovi il rettangolo (c'è la selezione nativa del browser)
				try { setDraft(null) } catch {}
				console.log('[DRAG][EXTRACT][NATIVE] Rimosso rettangolo, mantenendo selezione nativa')
				
				// Pulisci sempre i refs
				lastDraftBoxRef.current = null
				mouseDownPageRef.current = null
				mouseDownPosRef.current = null
			}
		}

		const onSelChange = () => {
			if (timer) window.clearTimeout(timer)
			// ignora gli update mentre si trascina, apri solo su mouseup
			if (!isSelectingRef.current) {
				try { console.log('[NATIVE][event] selectionchange (idle)') } catch {}
				timer = window.setTimeout(handleSelection, 30)
			} else {
				try { console.log('[NATIVE][event] selectionchange (drag)') } catch {}
				// Ignore while dragging to avoid flicker; we'll handle on mouseup
			}
		}

		// During drag across lines, show a stable draft box so the native selection disappearing doesn't cause flicker
		const onDragMove = (ev: MouseEvent) => {
			if (!isSelectingRef.current || !mouseDownPageRef.current || !mouseDownPosRef.current) {
				return
			}
			
			try {
				const layer = pageElsRef.current.get(mouseDownPageRef.current)
				if (!layer) {
					console.warn('[DRAG][MOVE][NO-LAYER]', { page: mouseDownPageRef.current })
					return
				}
				
				const r = layer.getBoundingClientRect()
				const x = Math.max(0, Math.min((ev.clientX - r.left) / r.width, 1))
				const y = Math.max(0, Math.min((ev.clientY - r.top) / r.height, 1))
				
				// ✅ DETECT CROSS-PAGE: Controlla se il mouse ha superato i bordi della pagina
				const crossedRightBoundary = x >= 0.95 && ev.clientX > r.right
				const crossedLeftBoundary = x <= 0.05 && ev.clientX < r.left
				const crossedBottomBoundary = y >= 0.95 && ev.clientY > r.bottom
				const crossedTopBoundary = y <= 0.05 && ev.clientY < r.top
				
				// Se crossa un bordo, inizia la logica trans-pagina
				if (crossedRightBoundary || crossedLeftBoundary || crossedBottomBoundary || crossedTopBoundary) {
					console.log('[DRAG][CROSS-PAGE]', { 
						crossedRightBoundary, crossedLeftBoundary, crossedBottomBoundary, crossedTopBoundary,
						mouseX: ev.clientX, mouseY: ev.clientY,
						pageRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
					})
				}
				
				const draftBox = {
					id: 'draft', 
					page: mouseDownPageRef.current, 
					type: 'highlight' as const,
					color: 'rgba(59,130,246,0.3)',
					x0Pct: Math.min(mouseDownPosRef.current.xPct, x),
					y0Pct: Math.min(mouseDownPosRef.current.yPct, y),
					x1Pct: Math.max(mouseDownPosRef.current.xPct, x),
					y1Pct: Math.max(mouseDownPosRef.current.yPct, y)
				}
				
				// ✅ NUOVO: Se copre più righe, estendi fino alla fine del testo (non fino al bordo pagina)
				const boxHeightPx = (draftBox.y1Pct - draftBox.y0Pct) * r.height
				const typicalLineHeight = 20 // pixel (altezza tipica di una riga)
				const isMultiLine = boxHeightPx > (typicalLineHeight * 1.5)
				
				if (isMultiLine) {
					// Trova gli span nelle righe coperte per calcolare bounds reali del testo
					try {
						const textLayer = layer.querySelector('.rpv-core__text-layer') as HTMLElement | null
						if (textLayer) {
							const textLayerRect = textLayer.getBoundingClientRect()
							const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
							
							let minX = Infinity
							let maxX = -Infinity
							
							const y0Px = draftBox.y0Pct * r.height
							const y1Px = draftBox.y1Pct * r.height
							
							for (const span of spans) {
								const spanRect = span.getBoundingClientRect()
								const spanY = spanRect.top - textLayerRect.top
								
								// Controlla se lo span è nelle righe coperte (solo Y, ignora X)
								const inYRange = spanY >= (y0Px - 5) && spanY <= (y1Px + 5)
								
								if (inYRange && span.textContent?.trim()) {
									const spanLeft = spanRect.left - textLayerRect.left
									const spanRight = spanRect.right - textLayerRect.left
									minX = Math.min(minX, spanLeft)
									maxX = Math.max(maxX, spanRight)
								}
							}
							
							// Se abbiamo trovato span, usa i loro bounds
							if (minX !== Infinity && maxX !== -Infinity) {
								draftBox.x0Pct = Math.max(0, minX / r.width)
								draftBox.x1Pct = Math.min(1, maxX / r.width)
								console.log('[DRAG][MULTI-LINE] Extended to text bounds', { 
									minX: minX.toFixed(1), 
									maxX: maxX.toFixed(1), 
									x0Pct: draftBox.x0Pct.toFixed(3), 
									x1Pct: draftBox.x1Pct.toFixed(3) 
								})
							} else {
								// Fallback: estendi a tutta la larghezza
								draftBox.x0Pct = 0
								draftBox.x1Pct = 1
								console.log('[DRAG][MULTI-LINE] No spans found, using full width')
							}
						}
					} catch (err) {
						console.error('[DRAG][MULTI-LINE] Error finding text bounds', err)
						// Fallback: estendi a tutta la larghezza
						draftBox.x0Pct = 0
						draftBox.x1Pct = 1
					}
				}
				
				console.log('[DRAG][MOVE][SET-DRAFT]', {
					page: draftBox.page,
					box: { x0: draftBox.x0Pct.toFixed(3), y0: draftBox.y0Pct.toFixed(3), x1: draftBox.x1Pct.toFixed(3), y1: draftBox.y1Pct.toFixed(3) },
					hasRoot: !!overlayRootsRef.current.get(draftBox.page),
					boxHeightPx: boxHeightPx.toFixed(1),
					isMultiLine
				})
				
				// Salva le coordinate del draft per l'estrazione testo
				lastDraftBoxRef.current = [{
					page: draftBox.page,
					x0Pct: draftBox.x0Pct,
					y0Pct: draftBox.y0Pct,
					x1Pct: draftBox.x1Pct,
					y1Pct: draftBox.y1Pct
				}]
				
				// Mostra box stabile durante drag
				setDraft(draftBox)
			} catch (err) {
				console.error('[DRAG][MOVE][ERROR]', err)
			}
		}

		const onKey = (e: KeyboardEvent) => { 
			if (e.key === 'Escape') { 
				try { 
					const s = window.getSelection()
					s && s.removeAllRanges() 
				} catch {}
				// setSelectMode(false) - questo sarà gestito dal componente padre
			} 
		}

		document.addEventListener('mousedown', onMouseDown, true)
		document.addEventListener('mouseup', onMouseUp, true)
		document.addEventListener('selectionchange', onSelChange, true)
		document.addEventListener('mousemove', onDragMove, true)
		document.addEventListener('keydown', onKey, true)
		
		try { console.log('[NATIVE][bind] listeners attached') } catch {}
		
		return () => { 
			if (timer) window.clearTimeout(timer)
			document.removeEventListener('mousedown', onMouseDown, true)
			document.removeEventListener('mouseup', onMouseUp, true)
			document.removeEventListener('selectionchange', onSelChange, true)
			document.removeEventListener('mousemove', onDragMove, true)
			document.removeEventListener('keydown', onKey, true)
		}
	}, [selectMode, selectKind, extractOpen, setDraft, setExtractPos, setExtractPage, setLastSelection, setContextMenu, handleSelection])

	return {
		isSelectingRef,
		mouseDownPageRef,
		mouseDownPosRef,
		lastDraftBoxRef
	}
}
