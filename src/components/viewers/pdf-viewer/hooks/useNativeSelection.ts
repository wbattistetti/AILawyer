import { useEffect, useRef, useCallback } from 'react'
import { getSelectedTextInRect } from '../utils/textExtraction'
import { cryptoRandom } from '../../../../utils/misc'
import type { PersistentSelection } from '../types'

// ✅ Helper functions per trans-page selection (da esperto)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const getMousePctOnPage = (host: HTMLElement, page: number, clientX: number, clientY: number) => {
	const pageEl = host.querySelector(`[data-page-number="${page}"]`) as HTMLElement | null;
	const layer = (pageEl?.querySelector('.rpv-core__page-layer') as HTMLElement) || pageEl;
	if (!layer) return { xPct: 0, yPct: 0, ok: false };

	const r = layer.getBoundingClientRect();
	const xPct = clamp01((clientX - r.left) / r.width);
	const yPct = clamp01((clientY - r.top) / r.height);
	return { xPct, yPct, ok: true };
};

const normBoxY = <T extends { y0Pct: number; y1Pct: number }>(b: T): T => {
	const y0 = Math.min(b.y0Pct, b.y1Pct);
	const y1 = Math.max(b.y0Pct, b.y1Pct);
	return { ...b, y0Pct: y0, y1Pct: y1 };
};

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
	setPersistentSelections: (selections: any[]) => void
	persistentSelections: any[]
	draft: any
	docId?: string
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
	selectionHandledRef,
	setPersistentSelections,
	persistentSelections,
	draft,
	docId
}: NativeSelectionHookProps) => {

	// Selection blocker function to prevent native text selection during custom drag
	const selectionBlocker = useCallback(() => {
		if (!isSelectingRef.current) return;
		const sel = window.getSelection?.();
		if (sel && sel.rangeCount) sel.removeAllRanges();
	}, []);
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
	}, [])

	useEffect(() => {
		if (!selectMode || selectKind !== 'NATIVE') return

		const host = hostRef.current
		if (!host) return

		let timer: number | null = null

		// ✅ Funzione helper per verificare se il click è dentro un rettangolo persistente
		const isClickOnPersistentSelection = (x: number, y: number): boolean => {
			for (const selection of persistentSelections) {
				const pageLayer = pageElsRef.current.get(selection.page)
				if (!pageLayer) continue

				const pr = pageLayer.getBoundingClientRect()
				const xPct = (x - pr.left) / pr.width
				const yPct = (y - pr.top) / pr.height

				// Verifica se il click è dentro il rettangolo
				if (xPct >= selection.x0Pct && xPct <= selection.x1Pct &&
					yPct >= selection.y0Pct && yPct <= selection.y1Pct) {
					return true
				}
			}
			return false
		}

		const onMouseDown = (ev: MouseEvent) => {
			if (extractOpen) return

			const x = ev.clientX
			const y = ev.clientY
			const hostR = host.getBoundingClientRect()

			if (x < hostR.left || x > hostR.right || y < hostR.top || y > hostR.bottom) {
				// ✅ Click fuori dal viewer: cancella tutto
				if (persistentSelections.length > 0 || draft) {
					console.log('[NATIVE][mousedown] Click fuori dal viewer - cancello tutto')
					setPersistentSelections([])
					setDraft(null)
					setContextMenu({ x: 0, y: 0, visible: false })
				}
				return
			}

			// ✅ PRIMA: Verifica se il click è dentro un rettangolo persistente
			// Se il click è fuori da tutti i rettangoli, cancella tutto e NON iniziare una nuova selezione
			if (persistentSelections.length > 0 || draft) {
				const clickedOnSelection = isClickOnPersistentSelection(x, y)

				if (clickedOnSelection) {
					console.log('[NATIVE][mousedown] Click su rettangolo persistente')
					// Il rettangolo gestirà il click tramite onClick, quindi non facciamo nulla qui
					// Ma NON iniziamo una nuova selezione
					return
				}

				// Se il click è fuori da tutti i rettangoli, cancella tutto e NON iniziare selezione
				console.log('[NATIVE][mousedown] Click fuori dai rettangoli - cancello tutto')
				setPersistentSelections([])
				setDraft(null)
				setContextMenu({ x: 0, y: 0, visible: false })
				// NON continuare con la selezione
				return
			}

			// Activate native selection suppression
			host.classList.add('rpv--suppress-native-select')
			document.addEventListener('selectionchange', selectionBlocker, true)
			window.getSelection?.()?.removeAllRanges()

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

					// ✅ RIPRISTINATO: Crea draft iniziale zero-area per mostrare subito il rettangolo
					const initialDraft = {
						id: 'draft',
						page: mouseDownPageRef.current || 0,
						type: 'highlight' as const,
						color: 'rgba(59,130,246,0.3)',
						x0Pct: ax,
						y0Pct: ay,
						x1Pct: ax,
						y1Pct: ay
					}
					setDraft(initialDraft)
					lastDraftBoxRef.current = [initialDraft]
				}
			} catch { }

			try {
				console.log('[NATIVE][event] mousedown start selecting', { mouseDownPage: mouseDownPageRef.current })
			} catch { }
		}

		const onMouseUp = async (ev: MouseEvent) => {
			// ignora click su UI esterne
			const hostR = host.getBoundingClientRect()
			if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
			if (extractOpen) {
				try { console.log('[NATIVE][mouseup] ignored: extractOpen') } catch { }
				return
			}
			if (timer) window.clearTimeout(timer)

			console.log('[NATIVE][DEBUG] MouseUp - isSelecting:', isSelectingRef.current, 'removing is-dragging class')

			// Deactivate native selection suppression
			document.removeEventListener('selectionchange', selectionBlocker, true)
			host.classList.remove('rpv--suppress-native-select')

			// Rimuovi classe dragging
			if (hostRef.current) {
				hostRef.current.classList.remove('is-dragging')
			}

			// Log posizione mouse
			console.log('[NATIVE][event] mouseup within viewer', {
				x: ev.clientX, y: ev.clientY,
				wasSelecting: isSelectingRef.current
			})

			// ✅ Se NON stava selezionando, verifica se il click è fuori dai rettangoli persistenti
			if (!isSelectingRef.current) {
				// Verifica se il click è dentro un rettangolo persistente
				let clickedOnSelection = false

				for (const selection of persistentSelections) {
					const pageLayer = pageElsRef.current.get(selection.page)
					if (!pageLayer) continue

					const pr = pageLayer.getBoundingClientRect()
					const xPct = (ev.clientX - pr.left) / pr.width
					const yPct = (ev.clientY - pr.top) / pr.height

					// Verifica se il click è dentro il rettangolo
					if (xPct >= selection.x0Pct && xPct <= selection.x1Pct &&
						yPct >= selection.y0Pct && yPct <= selection.y1Pct) {
						clickedOnSelection = true
						break
					}
				}

				// Se il click è fuori da tutti i rettangoli, cancella tutto
				if (!clickedOnSelection && (persistentSelections.length > 0 || draft)) {
					setPersistentSelections([])
					setDraft(null)
					setContextMenu({ x: 0, y: 0, visible: false })
				}

				return
			}

			// Se stava selezionando, gestisci fine drag
			if (isSelectingRef.current) {
				if (lastDraftBoxRef.current && lastDraftBoxRef.current.length > 0) {
					// Per MVP: usa solo il primo box (pagina originale)
					const firstBox = lastDraftBoxRef.current[0]

					// ✅ NUOVA LOGICA: Usa le coordinate del draft box invece di window.getSelection()
					const draftBoxes = lastDraftBoxRef.current

					if (!draftBoxes || draftBoxes.length === 0) {
						try { setDraft(null) } catch { }
						return
					}

					try {
						// Per compatibilità, prendi la prima pagina (MVP per trans-pagina verrà dopo)
						const firstDraftBox = draftBoxes[0]
						const pageNum = firstDraftBox.page
						const pageLayer = pageElsRef.current.get(pageNum)

						if (!pageLayer) {
							console.warn('[DRAG][END] No page layer found for page', pageNum)
							try { setDraft(null) } catch { }
							return
						}

						const textLayer = pageLayer.querySelector('.rpv-core__text-layer') as HTMLDivElement | null
						if (!textLayer) {
							console.warn('[DRAG][END] No text layer found for page', pageNum)
							try { setDraft(null) } catch { }
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

						// ✅ Se il rettangolo è zero-area o molto piccolo, cancellalo invece di creare selezione
						const minArea = 100 // pixel minimi (10x10)
						if (viewportBox.w * viewportBox.h < minArea) {
							console.log('[DRAG][END] Rettangolo troppo piccolo, cancello:', {
								width: viewportBox.w,
								height: viewportBox.h,
								area: viewportBox.w * viewportBox.h
							})
							setDraft(null)
							lastDraftBoxRef.current = null
							mouseDownPageRef.current = null
							mouseDownPosRef.current = null
							isSelectingRef.current = false
							return
						}

						// Estrai il testo usando le coordinate del rettangolo
						const { text } = await getSelectedTextInRect(textLayer, viewportBox)


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
						px = Math.max(8, Math.min(px, (window.innerWidth || 1200) - panelW - 8))
						py = Math.max(8, Math.min(py, (window.innerHeight || 800) - panelH - 8))

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

								setLastSelection(selection)
							} else {
								setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
							}
						} catch (e) {
							console.warn('[DRAG][EXTRACT][pdfbox][err]', e)
							setLastSelection({ pdfPageNumber: pageNum, bboxPdf: undefined, viewportBox, text })
						}

						// ✅ CREA SELEZIONE PERSISTENTE invece di cancellare il draft
						const persistentSelection: PersistentSelection = {
							id: cryptoRandom(),
							page: pageNum,
							x0Pct: firstDraftBox.x0Pct,
							y0Pct: firstDraftBox.y0Pct,
							x1Pct: firstDraftBox.x1Pct,
							y1Pct: firstDraftBox.y1Pct,
							text: text || '',
							viewportBox: viewportBox,
							source: docId ? `Documento ${docId}` : undefined
						}

						setPersistentSelections((prev) => {
							// Limita a massimo 3 rettangoli persistenti, rimuovi i più vecchi
							const newSelections = [...prev, persistentSelection]
							console.log('🔵 [NATIVE-SEL] Creando rettangolo persistente:', {
								id: persistentSelection.id,
								page: persistentSelection.page,
								totalePrima: prev.length,
								totaleDopo: newSelections.length
							})
							if (newSelections.length > 3) {
								// Rimuovi i più vecchi (primi nell'array)
								const filtered = newSelections.slice(-3)
								console.log('🔵 [NATIVE-SEL] Rimosso rettangoli vecchi, rimangono:', filtered.length)
								return filtered
							}
							return newSelections
						})

						// Mantieni il draft visibile come selezione persistente
						// Non chiamare setDraft(null) qui - il rettangolo rimane visibile
						// Il draft verrà rimosso dopo che la selezione persistente è stata renderizzata

						// Apri il context menu invece del dialog
						selectionHandledRef.current = true
						setContextMenu({ x: ev.clientX, y: ev.clientY, visible: true })

					} catch (error) {
						console.error('[DRAG][EXTRACT][ERROR]', error)
					} finally {
						// ✅ PULISCI IL DRAFT dopo aver creato la selezione persistente
						// Usa un piccolo delay per permettere al render della selezione persistente
						setTimeout(() => {
							try { setDraft(null) } catch { }
						}, 100)

						// Pulisci sempre i refs
						lastDraftBoxRef.current = null
						mouseDownPageRef.current = null
						mouseDownPosRef.current = null
					}
				} else {
				}

				// Reset flag
				isSelectingRef.current = false
			}
		}

		const onSelChange = () => {
			if (timer) window.clearTimeout(timer)
			// ignora gli update mentre si trascina, apri solo su mouseup
			if (!isSelectingRef.current) {
				timer = window.setTimeout(handleSelection, 30)
			}
			// Ignore while dragging to avoid flicker; we'll handle on mouseup
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

				// Se crossa un bordo, inizia la logica trans-pagina
				if (crossedRightBoundary || crossedLeftBoundary || crossedBottomBoundary || crossedTopBoundary) {
					console.log('[TRANS-PAGE][START] Mouse crossed boundary', {
						crossedRightBoundary, crossedLeftBoundary, crossedBottomBoundary, crossedTopBoundary
					})

					// 1. DETERMINA DIREZIONE
					const direction = crossedRightBoundary ? 'right' :
						crossedLeftBoundary ? 'left' :
							crossedBottomBoundary ? 'down' : 'up'

					// 2. TROVA PAGINA ADIACENTE (funzione helper)
					const findAdjacentPage = (currentPage: number, dir: string): number | null => {
						// Ottieni totalPages dal PDF document invece di parametro
						const pdfDoc = pdfDocRef.current
						const totalPages = pdfDoc?.numPages || 0

						if (dir === 'right' || dir === 'down') return currentPage + 1 <= totalPages ? currentPage + 1 : null
						if (dir === 'left' || dir === 'up') return currentPage - 1 >= 1 ? currentPage - 1 : null
						return null
					}

					const adjacentPage = findAdjacentPage(mouseDownPageRef.current!, direction)
					console.log('[TRANS-PAGE][ADJACENT] Found page', {
						from: mouseDownPageRef.current,
						to: adjacentPage,
						direction
					})

					if (adjacentPage) {
						console.log('[TRANS-PAGE][ADJACENT] Found adjacent page', {
							from: mouseDownPageRef.current,
							to: adjacentPage,
							direction
						})

						// ✅ SOLUZIONE ESPERTO: Usa helper per calcolare coordinate intelligenti
						const { xPct: mx, yPct: my, ok } = getMousePctOnPage(hostRef.current!, adjacentPage, ev.clientX, ev.clientY);
						if (!ok) {
							console.log('[TRANS-PAGE][NO-PAGE-LAYER] Cannot get mouse position on adjacent page');
							return;
						}

						// ✅ CORRETTO: y0Pct=0 quando scendi, y1Pct=1 quando sali
						const base = (direction === 'down')
							? { y0Pct: 0, y1Pct: my }    // Dall'INIZIO fino al mouse
							: (direction === 'up')
								? { y0Pct: my, y1Pct: 1 }   // Dal mouse fino alla FINE
								: (direction === 'right')
									? { y0Pct: draftBox.y0Pct, y1Pct: draftBox.y1Pct, x0Pct: 0, x1Pct: mx }
									: { y0Pct: draftBox.y0Pct, y1Pct: draftBox.y1Pct, x0Pct: mx, x1Pct: 1 };

						const newDraftBox = normBoxY({
							id: `draft-${adjacentPage}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
							page: adjacentPage,
							type: 'highlight',
							color: 'rgba(59,130,246,0.3)',
							x0Pct: draftBox.x0Pct,
							x1Pct: draftBox.x1Pct,
							...base
						} as any);
						console.log('[TRANS-PAGE][NEW-BOX] Created', newDraftBox)

						// ✅ FORZA CREAZIONE OVERLAY ROOT PER PAGINA ADIACENTE (HOT-FIX ESPERTO)
						const adjacentRoot = overlayRootsRef.current.get(adjacentPage);
						if (!adjacentRoot && hostRef.current) {
							const pageEl = hostRef.current.querySelector(
								`[data-page-number="${adjacentPage}"]`
							) as HTMLElement | null;

							if (pageEl) {
								// ✅ Append nel layer giusto: .rpv-core__page-layer
								const pageLayer = pageEl.querySelector('.rpv-core__page-layer') as HTMLElement;

								// LOG 1: Verifica se trova il page layer
								console.log('[OVERLAY][DEBUG] Looking for page layer:', adjacentPage)
								console.log('[OVERLAY][DEBUG] Page layer found:', !!pageLayer, pageLayer)

								if (!pageLayer) {
									console.log('[OVERLAY][DEBUG] No page layer found, checking page element:', pageEl)
									return;
								}

								// LOG 2: Verifica dimensioni PRIMA di creare root
								const prBefore = pageLayer.getBoundingClientRect()
								console.log('[OVERLAY][DEBUG] Page layer rect before:', {
									width: prBefore.width,
									height: prBefore.height,
									top: prBefore.top,
									left: prBefore.left
								})

								const newRoot = document.createElement('div');
								newRoot.className = 'rpv-custom__overlay-layer';
								Object.assign(newRoot.style, {
									position: 'absolute',
									inset: '0',                // fill
									zIndex: '3',               // sopra text/annotation (canvas=0, text=1, ann=2)
									pointerEvents: 'none',     // non bloccare selezioni native
									contain: 'strict',         // migliore perf
								});

								pageLayer.appendChild(newRoot);
								overlayRootsRef.current.set(adjacentPage, newRoot);

								// LOG 3: Dopo aver creato root, verifica dimensioni
								const rr = newRoot.getBoundingClientRect()
								console.log('[OVERLAY][DEBUG] Root rect after creation:', {
									width: rr.width,
									height: rr.height,
									top: rr.top,
									left: rr.left
								})

								// LOG 4: Verifica se root è effettivamente nel DOM
								console.log('[OVERLAY][DEBUG] Root in DOM:', document.contains(newRoot))
								console.log('[OVERLAY][DEBUG] Root parent:', newRoot.parentElement)
								console.log('[OVERLAY][DEBUG] Root computed z-index:', window.getComputedStyle(newRoot).zIndex)
							}
						}

						// 4. AGGIUNGI AL ARRAY (supporto 2 pagine max per MVP)
						lastDraftBoxRef.current = [draftBox, newDraftBox]
						console.log('[TRANS-PAGE][SAVED] Draft boxes:', lastDraftBoxRef.current)
					} else {
						console.log('[TRANS-PAGE][NO-ADJACENT] No adjacent page found')
					}
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
							} else {
								// Fallback: estendi a tutta la larghezza
								draftBox.x0Pct = 0
								draftBox.x1Pct = 1
							}
						}
					} catch (err) {
						console.error('[DRAG][MULTI-LINE] Error finding text bounds', err)
						// Fallback: estendi a tutta la larghezza
						draftBox.x0Pct = 0
						draftBox.x1Pct = 1
					}
				}


				// ✅ Aggiorna solo se non è già una selezione multi-pagina
				if (!lastDraftBoxRef.current || lastDraftBoxRef.current.length <= 1) {
					lastDraftBoxRef.current = [draftBox]
				} else {
				}

				// Mostra box stabile durante drag

				if (lastDraftBoxRef.current && lastDraftBoxRef.current.length > 1) {
					setDraft(lastDraftBoxRef.current)  // ✅ Array completo per multi-page
				} else {
					setDraft(draftBox)  // ✅ Singolo box
				}
			} catch (err) {
				console.error('[DRAG][MOVE][ERROR]', err)
			}
		}

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				try {
					const s = window.getSelection()
					s && s.removeAllRanges()
				} catch { }
				// setSelectMode(false) - questo sarà gestito dal componente padre
			}
		}

		document.addEventListener('mousedown', onMouseDown, true)
		document.addEventListener('mouseup', onMouseUp, true)
		document.addEventListener('selectionchange', onSelChange, true)
		document.addEventListener('mousemove', onDragMove, true)
		document.addEventListener('keydown', onKey, true)

		// Log rimosso (troppo rumoroso)

		return () => {
			if (timer) window.clearTimeout(timer)
			document.removeEventListener('mousedown', onMouseDown, true)
			document.removeEventListener('mouseup', onMouseUp, true)
			document.removeEventListener('selectionchange', onSelChange, true)
			document.removeEventListener('mousemove', onDragMove, true)
			document.removeEventListener('keydown', onKey, true)
		}
	}, [selectMode, selectKind, extractOpen, setDraft, setExtractPos, setExtractPage, setLastSelection, setContextMenu, handleSelection, setPersistentSelections, persistentSelections, draft, docId])

	return {
		isSelectingRef,
		mouseDownPageRef,
		mouseDownPosRef,
		lastDraftBoxRef
	}
}
