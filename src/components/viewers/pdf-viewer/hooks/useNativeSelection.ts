import { useEffect, useRef, useCallback } from 'react'
import { getSelectedTextInRect } from '../utils/textExtraction'
import { cryptoRandom } from '../../../../utils/misc'
import type { PersistentSelection } from '../types'
import { useIsolatedGlobalListeners } from '../../common/hooks/useIsolatedGlobalListeners'

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
	/**
	 * ID univoco del viewer (es. docId) - necessario per isolamento
	 */
	viewerId: string
	/**
	 * Se il viewer è attualmente attivo (visibile/focus)
	 */
	isActive: boolean
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
	viewerId,
	isActive,
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
		if (sel && sel.rangeCount) {
			sel.removeAllRanges();
		}
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

	// ✅ CRITICO: Ref per valori che cambiano durante il drag
	// Questo previene il re-attachment dei listener durante un drag
	const extractOpenRef = useRef(extractOpen)
	const persistentSelectionsRef = useRef(persistentSelections)
	const draftRef = useRef(draft)

	// ✅ Aggiorna ref quando i valori cambiano
	useEffect(() => {
		extractOpenRef.current = extractOpen
	}, [extractOpen])

	useEffect(() => {
		persistentSelectionsRef.current = persistentSelections
	}, [persistentSelections])

	useEffect(() => {
		draftRef.current = draft
	}, [draft])

	const handleSelection = useCallback(() => {
		// Logica per gestire la selezione nativa
	}, [])

	// ✅ Disabilita la selezione nativa globalmente quando selectMode è attivo
	useEffect(() => {
		if (!selectMode || selectKind !== 'NATIVE') return

		const host = hostRef.current
		if (!host) return

		// Applica user-select: none globalmente al container principale
		host.style.setProperty('user-select', 'none', 'important')
		host.style.setProperty('-webkit-user-select', 'none', 'important')

		return () => {
			// Ripristina al cleanup
			if (host) {
				host.style.removeProperty('user-select')
				host.style.removeProperty('-webkit-user-select')
			}
		}
	}, [selectMode, selectKind, hostRef])

	// ✅ Helper: reset completo dello stato interno
	const resetState = useCallback(() => {
		isSelectingRef.current = false
		mouseDownPageRef.current = null
		mouseDownPosRef.current = null
		lastDraftBoxRef.current = null
		if (timerRef.current) {
			window.clearTimeout(timerRef.current)
			timerRef.current = null
		}

		const host = hostRef.current
		if (host) {
			host.classList.remove('rpv--suppress-native-select')
			host.classList.remove('is-dragging')
		}

		try {
			const sel = window.getSelection()
			if (sel && sel.rangeCount) {
				sel.removeAllRanges()
			}
		} catch { }

		setDraft(null)
	}, [hostRef, setDraft])

	// ✅ CRITICO: Reset completo quando selectMode è false, selectKind non è NATIVE, o isActive è false
	// Questo impedisce che lo stato interno rimanga "sporco" e interferisca con altri viewer
	useEffect(() => {
		// ✅ Se selectMode è false, selectKind non è NATIVE, o isActive è false, resetta TUTTO
		if (!selectMode || selectKind !== 'NATIVE' || !isActive) {
			// ✅ Rimuovi listener di selezione se ancora attivi
			const host = hostRef.current
			if (host) {
				document.removeEventListener('selectionchange', selectionBlocker, true)
			}

			// ✅ Reset completo dello stato
			resetState()
		}
	}, [selectMode, selectKind, isActive, hostRef, selectionBlocker, resetState])

	// ✅ Funzione helper per verificare se il click è dentro un rettangolo persistente
	const isClickOnPersistentSelection = useCallback((x: number, y: number): boolean => {
		for (const selection of persistentSelectionsRef.current) {
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
	}, [pageElsRef])

	// ✅ Sposta le funzioni fuori dal useEffect usando useCallback
	const onMouseDown = useCallback((ev: MouseEvent) => {
		// ✅ CRITICO: Verifica che il viewer sia attivo
		if (!isActive) {
			return
		}

		// ✅ SEMPLIFICAZIONE: useNativeSelection gestisce solo selezione testo nativo
		// Il drag rettangolo è gestito da useRectSelection (sempre attivo quando selectMode=true)
		// Quindi useNativeSelection deve gestire solo quando l'utente seleziona testo con il mouse
		// NON deve gestire il drag rettangolo (quello è gestito da useRectSelection)

		// ✅ Se non è NATIVE, non fare nulla (il drag rettangolo è gestito da useRectSelection)
		if (selectKind !== 'NATIVE') {
			return
		}

		console.log('[NATIVE-SEL][DOWN] Event received', { extractOpen: extractOpenRef.current, selectMode, selectKind })
		if (extractOpenRef.current) return

		// ✅ IMPORTANTE: useNativeSelection gestisce solo la selezione testo nativo
		// NON gestisce il drag rettangolo (quello è gestito da useRectSelection)
		// Quindi qui gestiamo solo quando l'utente seleziona testo con il mouse (non drag)

		const target = ev.target as HTMLElement
		const host = hostRef.current
		if (!host) {
			console.log('[NATIVE-SEL][DOWN] No host, exiting')
			return
		}

		// ✅ CRITICO: Verifica che l'evento sia dentro il nostro host
		if (target && !host.contains(target)) {
			return
		}

		console.log('[NATIVE-SEL][DOWN] Host found, checking overlay')

		// ✅ CRITICO: Se esiste un overlay attivo, blocca l'inizio di un nuovo drag
		const overlayExists = document.querySelector('[data-extract-overlay="true"]')
		if (overlayExists) {
			console.log('[NATIVE-SEL][DOWN] Overlay exists')
			// ✅ Verifica se il click è dentro l'overlay
			const isInsideOverlay = target && (
				target.closest('[data-extract-overlay="true"]') ||
				target.closest('.extract-block-overlay') ||
				overlayExists.contains(target)
			)

			if (isInsideOverlay) {
				console.log('[NATIVE-SEL][DOWN] Click inside overlay, exiting')
				return // ✅ NON iniziare un nuovo drag se l'overlay è attivo
			}

			// ✅ Se l'overlay esiste ma il click è fuori, chiudi l'overlay prima di iniziare un nuovo drag
			setPersistentSelections([])
		}

		const x = ev.clientX
		const y = ev.clientY
		const hostR = host.getBoundingClientRect()
		console.log('[NATIVE-SEL][DOWN] Mouse pos:', { x, y }, 'Host bounds:', hostR)

		if (x < hostR.left || x > hostR.right || y < hostR.top || y > hostR.bottom) {
			console.log('[NATIVE-SEL][DOWN] Click outside viewer bounds, exiting')
			// Click fuori dal viewer: cancella tutto
			if (persistentSelectionsRef.current.length > 0 || draftRef.current) {
				setPersistentSelections([])
				setDraft(null)
				setContextMenu({ x: 0, y: 0, visible: false })
			}
			return
		}

		// ✅ SEMPLIFICAZIONE: useNativeSelection NON gestisce più le persistent selections create da useRectSelection
		// Le persistent selections create da useRectSelection (drag rettangolo) sono gestite da useRectSelection stesso
		// useNativeSelection gestisce solo la selezione testo nativo (quando l'utente seleziona testo con il mouse)
		// Quindi qui NON cancelliamo le persistent selections - quelle sono gestite da useRectSelection

		console.log('[NATIVE-SEL][DOWN] Permettendo selezione testo nativo (non gestiamo persistent selections da useRectSelection)')
		// ✅ NON cancellare persistent selections - quelle sono gestite da useRectSelection
		// ✅ NON gestire mousedown per drag rettangolo - quello è gestito da useRectSelection
		// ✅ La selezione testo nativo viene gestita da onSelChange, non da onMouseDown
		return // ✅ Esci subito - non gestire drag rettangolo o persistent selections qui

		// ✅ SEMPLIFICAZIONE: useNativeSelection NON gestisce più il drag rettangolo
		// Il drag rettangolo è gestito da useRectSelection (sempre attivo quando selectMode=true)
		// useNativeSelection gestisce solo la selezione testo nativo (quando l'utente seleziona testo con il mouse)
		// Quindi qui NON creiamo draft box - lasciamo che il browser gestisca la selezione testo nativa
		// e intercettiamo solo quando l'utente completa la selezione (onSelChange)

		console.log('[NATIVE-SEL][DOWN] Permettendo selezione testo nativo (non drag rettangolo)')
		// ✅ NON bloccare la selezione nativa - lasciamo che il browser la gestisca
		// ✅ NON creare draft box - quello è gestito da useRectSelection
		// ✅ NON impostare isSelectingRef - quello è gestito da useRectSelection
		// ✅ La selezione testo nativo viene gestita da onSelChange, non da onMouseDown
		return // ✅ Esci subito - non gestire drag rettangolo qui

		// ❌ CODICE LEGACY RIMOSSO: La logica di drag rettangolo è stata spostata in useRectSelection
		// Trova la pagina del mouse down
		let pn = 0
		console.log('[NATIVE-SEL][DOWN] Finding page number...')
		const holders = Array.from((host.querySelectorAll('[data-page-number]') as NodeListOf<HTMLElement>))
		console.log('[NATIVE-SEL][DOWN] Found holders:', holders.length)

		for (const h of holders) {
			const layer = h.querySelector('.rpv-core__page-layer') as HTMLElement | null
			if (!layer) continue
			const r = layer.getBoundingClientRect()
			const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
			if (inside) {
				const parsed = parseInt(h.getAttribute('data-page-number') || '', 10)
				if (Number.isFinite(parsed) && parsed > 0) {
					pn = parsed
					console.log('[NATIVE-SEL][DOWN] Found page from holders:', pn)
					break
				}
			}
		}

		if (!pn) {
			console.log('[NATIVE-SEL][DOWN] No page from holders, trying fallback...')
			// fallback to closest
			const t = ev.target as HTMLElement
			const pageLayer = t.closest('.rpv-core__page-layer') as HTMLElement | null
			if (pageLayer) {
				pn = elToPageRef.current.get(pageLayer) || 0
				console.log('[NATIVE-SEL][DOWN] Found page from closest:', pn)
			}
		}

		if (!pn) {
			console.log('[NATIVE-SEL][DOWN] No page from fallback, trying document query...')
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
						console.log('[NATIVE-SEL][DOWN] Found page from document query:', pn)
						break
					}
				}
			}
		}

		if (pn > 0) {
			mouseDownPageRef.current = pn
			console.log('[NATIVE-SEL][DOWN] Set mouseDownPageRef to:', pn)
		} else {
			console.warn('[NATIVE-SEL][DOWN] ⚠️ Could not find page number!')
		}

		// seed a zero-area draft to keep visual highlight persistent from the first pixel
		try {
			const layer = pageElsRef.current.get(mouseDownPageRef.current || 0)
			console.log('[NATIVE-SEL][DOWN] Getting layer for page:', mouseDownPageRef.current, 'Layer found:', !!layer)
			if (layer) {
				const r = layer.getBoundingClientRect()
				const ax = (x - r.left) / r.width
				const ay = (y - r.top) / r.height
				mouseDownPosRef.current = { xPct: ax, yPct: ay }
				console.log('[NATIVE-SEL][DOWN] Calculated percentages:', { ax, ay })

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
				console.log('[NATIVE-SEL][DOWN] Creating initial draft:', initialDraft)
				setDraft(initialDraft)
				lastDraftBoxRef.current = [initialDraft]
				console.log('[NATIVE-SEL][DOWN] ✅ Draft created and set!')
			} else {
				console.warn('[NATIVE-SEL][DOWN] ⚠️ No layer found for page:', mouseDownPageRef.current)
			}
		} catch (err) {
			console.error('[NATIVE-SEL][DOWN] ❌ Error creating draft:', err)
		}
	}, [isActive, selectMode, selectKind, hostRef, pageElsRef, elToPageRef, selectionBlocker, setDraft, setPersistentSelections, setContextMenu, isClickOnPersistentSelection])

	const onMouseUp = useCallback(async (ev: MouseEvent) => {
		// ✅ CRITICO: Verifica che il viewer sia attivo
		if (!isActive) {
			resetState()
			return
		}

		// ✅ CRITICO: Verifica se il click è sul pulsante "Estratto" o dentro l'overlay ExtractBlock prima di processare
		const target = ev.target as HTMLElement
		const host = hostRef.current
		if (!host) {
			resetState()
			return
		}

		// ✅ CRITICO: Verifica che l'evento sia dentro il nostro host
		if (target && !host.contains(target)) {
			resetState()
			return
		}

		// ✅ Verifica più robusta: controlla anche gli elementi a tutti i livelli
		const isInsideOverlay = target && (
			target.closest('button[data-extract-button="true"]') ||
			target.textContent?.includes('Estratto') ||
			target.closest('.extract-button-container') ||
			// ✅ Verifica se il click è dentro l'overlay ExtractBlock (per evitare che sparisce quando si clicca su "Aggiungi titolo" o "Aggiungi osservazione")
			target.closest('[data-extract-overlay="true"]') ||
			target.closest('.extract-block-overlay') ||
			// ✅ Verifica anche se il target stesso ha gli attributi/classe
			target.hasAttribute('data-extract-overlay') ||
			target.classList.contains('extract-block-overlay') ||
			// ✅ Verifica se il target è un elemento figlio dell'overlay (anche se il click passa attraverso)
			document.querySelector('[data-extract-overlay="true"]')?.contains(target) ||
			document.querySelector('.extract-block-overlay')?.contains(target)
		)

		if (isInsideOverlay) {
			return // ✅ NON processare il mouseUp se è dentro l'overlay o sul pulsante
		}

		// ignora click su UI esterne
		const hostR = host.getBoundingClientRect()
		if (ev.clientX < hostR.left || ev.clientX > hostR.right || ev.clientY < hostR.top || ev.clientY > hostR.bottom) return
		if (extractOpenRef.current) return
		if (timerRef.current) window.clearTimeout(timerRef.current)

		// Deactivate native selection suppression
		document.removeEventListener('selectionchange', selectionBlocker, true)
		host.classList.remove('rpv--suppress-native-select')
		window.getSelection?.()?.removeAllRanges()

		// Rimuovi classe dragging
		if (hostRef.current) {
			hostRef.current.classList.remove('is-dragging')
		}

		// ✅ Se NON stava selezionando, verifica se il click è fuori dai rettangoli persistenti
		if (!isSelectingRef.current) {
			// ✅ PRIMA verifica se il click è dentro l'overlay ExtractBlock (che si estende sopra e sotto il rettangolo)
			const isInsideOverlay2 = target && (
				target.closest('[data-extract-overlay="true"]') ||
				target.closest('.extract-block-overlay')
			)

			if (isInsideOverlay2) {
				return // ✅ NON rimuovere la selezione se il click è dentro l'overlay
			}

			// Verifica se il click è dentro un rettangolo persistente
			let clickedOnSelection = false

			for (const selection of persistentSelectionsRef.current) {
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
			if (!clickedOnSelection && (persistentSelectionsRef.current.length > 0 || draftRef.current)) {
				setPersistentSelections([])
				setDraft(null)
				setContextMenu({ x: 0, y: 0, visible: false })
			}

			return
		}

		// ✅ SEMPLIFICAZIONE: useNativeSelection NON gestisce più il drag rettangolo
		// Il drag rettangolo è gestito da useRectSelection (sempre attivo quando selectMode=true)
		// useNativeSelection gestisce solo la selezione testo nativo (quando l'utente seleziona testo con il mouse)
		// Quindi qui NON gestiamo il drag rettangolo - quello è gestito da useRectSelection

		// ✅ Se stava selezionando (drag rettangolo), NON gestirlo qui - è gestito da useRectSelection
		// ✅ Questo codice è legacy e dovrebbe essere rimosso, ma per ora lo disabilitiamo
		if (false && isSelectingRef.current) {
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

					console.log('[DRAG][EXTRACT][TEXT]', {
						hasText: !!text,
						textLength: text?.length || 0,
						textPreview: text?.substring(0, 100) || 'N/A',
						viewportBox
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

								// Rimuovi la selezione dopo un breve delay per evitare che persista
								setTimeout(() => {
									const selAfter = window.getSelection()
									if (selAfter && selAfter.rangeCount > 0) {
										selAfter.removeAllRanges()
									}
								}, 100)
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

					// ✅ Crea una PersistentSelection per mostrare il FloatingExtractButton
					// ✅ Riutilizza pageLayer già dichiarato sopra (riga 317)
					if (pageLayer && viewportBox) {
						const pr = pageLayer.getBoundingClientRect()
						const persistentSelection: PersistentSelection = {
							id: `persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
							page: pageNum,
							x0Pct: viewportBox.x / pr.width,
							y0Pct: viewportBox.y / pr.height,
							x1Pct: (viewportBox.x + viewportBox.w) / pr.width,
							y1Pct: (viewportBox.y + viewportBox.h) / pr.height,
							text: text || '',
							viewportBox: {
								x: viewportBox.x,
								y: viewportBox.y,
								w: viewportBox.w,
								h: viewportBox.h
							},
							source: docId || 'Documento'
						}
						console.log('✅ [NATIVE-SEL] Creando PersistentSelection:', persistentSelection)
						setPersistentSelections(prev => [...prev, persistentSelection])
					}

					// ✅ NON aprire più il context menu - il FloatingExtractButton appare automaticamente
					selectionHandledRef.current = true

				} catch (error) {
					console.error('[DRAG][EXTRACT][ERROR]', error)
				} finally {
					// Pulisci sempre i refs (ma NON rimuovere il draft - rimane visibile)
					lastDraftBoxRef.current = null
					mouseDownPageRef.current = null
					mouseDownPosRef.current = null
				}
			} else {
			}

			// Reset flag
			isSelectingRef.current = false
		}
	}, [isActive, hostRef, selectionBlocker, resetState, pageElsRef, pdfDocRef, setDraft, setExtractPos, setExtractPage, setLastSelection, setPersistentSelections, setContextMenu, docId, selectionHandledRef])

	const onSelChange = useCallback(() => {
		// ✅ CRITICO: Verifica che il viewer sia attivo
		if (!isActive) {
			return
		}

		const host = hostRef.current
		if (!host) return

		// ✅ CRITICO: Verifica che la selezione sia dentro il nostro viewer PDF
		const sel = window.getSelection()
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0)
			// Verifica che il nodo comune della selezione sia dentro il nostro host
			if (!host.contains(range.commonAncestorContainer as Node)) {
				return // La selezione non è nel nostro viewer, ignora
			}
		}

		if (timerRef.current) window.clearTimeout(timerRef.current)
		// ignora gli update mentre si trascina, apri solo su mouseup
		if (!isSelectingRef.current) {
			timerRef.current = window.setTimeout(handleSelection, 30)
		}
		// Ignore while dragging to avoid flicker; we'll handle on mouseup
	}, [isActive, hostRef, handleSelection])

	// During drag across lines, show a stable draft box so the native selection disappearing doesn't cause flicker
	const onDragMove = useCallback((ev: MouseEvent) => {
		// ✅ CRITICO: Verifica che il viewer sia attivo
		if (!isActive) {
			resetState()
			return
		}

		// ✅ Verifica che stiamo effettivamente selezionando
		if (!isSelectingRef.current || !mouseDownPageRef.current || !mouseDownPosRef.current) {
			return
		}

		const target = ev.target as HTMLElement
		const host = hostRef.current
		if (!host) {
			resetState()
			return
		}

		// ✅ CRITICO: Verifica che l'evento sia dentro il nostro host
		if (target && !host.contains(target)) {
			resetState()
			return
		}

		console.log('[NATIVE-SEL][MOVE] ✅ Drag in progress!', {
			page: mouseDownPageRef.current,
			mouseDownPos: mouseDownPosRef.current,
			mouseX: ev.clientX,
			mouseY: ev.clientY
		})

		// ✅ CRITICO: Durante il drag, verifica che siamo ancora dentro o vicino al viewer
		// (permettiamo un margine di 50px per supportare drag leggermente fuori viewport)
		const hostR = host.getBoundingClientRect()
		const x = ev.clientX
		const y = ev.clientY
		console.log('[NATIVE-SEL][MOVE] Mouse pos:', { x, y }, 'Host bounds:', hostR)

		// Se il mouse è completamente fuori dall'host (con margine), interrompi
		if (x < hostR.left - 50 || x > hostR.right + 50 ||
			y < hostR.top - 50 || y > hostR.bottom + 50) {
			console.log('[NATIVE-SEL][MOVE] Mouse outside viewer, resetting state')
			// ✅ Reset stato se mouse esce dal viewer
			isSelectingRef.current = false
			mouseDownPageRef.current = null
			mouseDownPosRef.current = null
			lastDraftBoxRef.current = null
			return
		}

		console.log('[NATIVE-SEL][MOVE] Mouse inside viewer, updating draft')

		// Rimuovi la selezione nativa durante il drag
		const sel = window.getSelection?.()
		if (sel && sel.rangeCount) {
			sel.removeAllRanges()
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
			console.log('[NATIVE-SEL][MOVE] Calculated percentages:', { x, y }, 'from mouseDownPos:', mouseDownPosRef.current)

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
			console.log('[NATIVE-SEL][MOVE] Created draftBox:', draftBox)

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

						// ✅ CRITICO: Se abbiamo trovato span, usa i loro bounds
						// ✅ NON usare fallback 0-1 se non troviamo span - mantieni le coordinate originali
						if (minX !== Infinity && maxX !== -Infinity) {
							draftBox.x0Pct = Math.max(0, minX / r.width)
							draftBox.x1Pct = Math.min(1, maxX / r.width)
						}
						// ✅ RIMOSSO: Fallback che imposta x0Pct: 0 e x1Pct: 1
						// Se non troviamo span, mantieni le coordinate originali del draftBox
					}
				} catch (err) {
					console.error('[DRAG][MULTI-LINE] Error finding text bounds', err)
					// ✅ RIMOSSO: Fallback che imposta x0Pct: 0 e x1Pct: 1
					// Se c'è un errore, mantieni le coordinate originali del draftBox
				}
			}


			// ✅ Aggiorna solo se non è già una selezione multi-pagina
			if (!lastDraftBoxRef.current || lastDraftBoxRef.current.length <= 1) {
				lastDraftBoxRef.current = [draftBox]
			} else {
			}

			// Mostra box stabile durante drag
			console.log('[NATIVE-SEL][MOVE] Updating draft, lastDraftBoxRef length:', lastDraftBoxRef.current?.length)

			if (lastDraftBoxRef.current && lastDraftBoxRef.current.length > 1) {
				console.log('[NATIVE-SEL][MOVE] Setting multi-page draft')
				setDraft(lastDraftBoxRef.current)  // ✅ Array completo per multi-page
			} else {
				console.log('[NATIVE-SEL][MOVE] Setting single-page draft:', draftBox)
				setDraft(draftBox)  // ✅ Singolo box
			}
			console.log('[NATIVE-SEL][MOVE] ✅ Draft updated!')
		} catch (err) {
			console.error('[NATIVE-SEL][MOVE] ❌ Error updating draft:', err)
		}
	}, [isActive, hostRef, pageElsRef, overlayRootsRef, pdfDocRef, resetState, setDraft])

	const onKey = useCallback((e: KeyboardEvent) => {
		// ✅ CRITICO: Verifica che il viewer sia attivo
		if (!isActive) {
			return
		}

		// ✅ CRITICO: Verifica che l'evento sia dentro il nostro viewer PDF
		const host = hostRef.current
		if (!host) return

		const target = e.target as HTMLElement
		if (target && !host.contains(target)) {
			return // Evento non è nel nostro viewer, ignora
		}

		if (e.key === 'Escape') {
			try {
				const s = window.getSelection()
				s && s.removeAllRanges()
			} catch { }
			// setSelectMode(false) - questo sarà gestito dal componente padre
		}
	}, [isActive, hostRef])

	// ✅ Usa useIsolatedGlobalListeners per gestire listener globali isolati
	useIsolatedGlobalListeners({
		viewerId,
		hostRef,
		enabled: selectMode && selectKind === 'NATIVE',
		isActive,
		listeners: {
			onMouseDown,
			onMouseMove: onDragMove,
			onMouseUp,
			onKeyDown: onKey,
			onSelectionChange: onSelChange
		},
		options: {
			capture: true,
			passive: false
		},
		onResetState: resetState
	})

	return {
		isSelectingRef,
		mouseDownPageRef,
		mouseDownPosRef,
		lastDraftBoxRef
	}
}
