import { useEffect, useRef, useState } from 'react'

export interface UsePdfOverlaysProps {
	hostRef: React.RefObject<HTMLElement>
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	viewerReadyTick?: number
}

export interface UsePdfOverlaysReturn {
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	selectRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	selectTick: number
	setSelectTick: (tick: number | ((prev: number) => number)) => void
	ensureOverlayRootForPage: (pageNum: number) => boolean
}

export function usePdfOverlays({ hostRef, selectMode, selectKind, viewerReadyTick = 0 }: UsePdfOverlaysProps): UsePdfOverlaysReturn {
	const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const selectRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
	const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
	const [selectTick, setSelectTick] = useState<number>(0)
	const lastLogTimeRef = useRef<Map<number, number>>(new Map())

	// ✅ Funzione helper per creare overlay root quando textLayer è pronto
	// ✅ Attacca il root al pageLayer per evitare l'opacità del textLayer
	const createOverlayRootForPage = (pageNum: number, pageLayer: HTMLElement, textLayer: HTMLElement) => {
		const pageRect = pageLayer.getBoundingClientRect()
		const textRect = textLayer.getBoundingClientRect()
		const left = textRect.left - pageRect.left
		const top = textRect.top - pageRect.top

		// Verifica che non esista già
		if (overlayRootsRef.current.has(pageNum)) {
			const existing = overlayRootsRef.current.get(pageNum)!
			if (document.contains(existing)) {
				Object.assign(existing.style, {
					position: 'absolute',
					left: `${left}px`,
					top: `${top}px`,
					width: `${textRect.width}px`,
					height: `${textRect.height}px`,
					pointerEvents: 'none',
					zIndex: '100'
				})
				return false // Già esiste e aggiornato
			}
			// Rimuovi se non è più nel DOM
			overlayRootsRef.current.delete(pageNum)
		}

		// Crea il root solo se textLayer è nel DOM
		if (document.contains(textLayer)) {
			const over = document.createElement('div')
			over.className = 'ai-overlay-root'
			Object.assign(over.style, {
				position: 'absolute',
				left: `${left}px`,
				top: `${top}px`,
				width: `${textRect.width}px`,
				height: `${textRect.height}px`,
				pointerEvents: 'none',
				zIndex: '100'
			})
			if (!pageLayer.style.position) pageLayer.style.position = 'relative'
			pageLayer.appendChild(over)
			overlayRootsRef.current.set(pageNum, over)
			return true
		}
		return false
	}

	// ✅ Funzione helper per creare select root quando pageLayer è pronto
	const createSelectRootForPage = (pageNum: number, pageLayer: HTMLElement) => {
		// Verifica che non esista già
		if (selectRootsRef.current.has(pageNum)) {
			const existing = selectRootsRef.current.get(pageNum)!
			if (document.contains(existing)) {
				return false // Già esiste e è valido
			}
			// Rimuovi se non è più nel DOM
			selectRootsRef.current.delete(pageNum)
		}

		// Crea il root solo se pageLayer è nel DOM
		if (document.contains(pageLayer)) {
			const sel = document.createElement('div')
			sel.className = 'ai-select-root'
			if (!pageLayer.style.position) pageLayer.style.position = 'relative'
			pageLayer.appendChild(sel)
			selectRootsRef.current.set(pageNum, sel)
			Object.assign(sel.style, {
				position: 'absolute',
				inset: '0',
				zIndex: '2000',
				userSelect: 'none',
				cursor: (selectMode && selectKind === 'OCR') ? 'crosshair' : '',
				pointerEvents: (selectMode && selectKind === 'OCR') ? 'auto' : 'none',
				touchAction: (selectMode && selectKind === 'OCR') ? ('none' as any) : ''
			} as any)
			return true
		}
		return false
	}

	// ✅ Funzione helper per estrarre il numero di pagina da un elemento
	const getPageNumber = (element: HTMLElement): number | null => {
		// Prova a trovare data-page-number
		const holder = element.closest('[data-page-number]') as HTMLElement | null
		if (holder) {
			const parsed = parseInt(holder.getAttribute('data-page-number') || '', 10)
			if (Number.isFinite(parsed) && parsed > 0) return parsed
		}
		// Prova a estrarre da aria-label
		let p: HTMLElement | null = element
		for (let i = 0; i < 5 && p; i++) {
			const aria = p.getAttribute('aria-label') || ''
			const m = aria.match(/\bP(?:age|agina)\s+(\d+)/i)
			if (m) {
				const parsed = parseInt(m[1], 10)
				if (Number.isFinite(parsed) && parsed > 0) return parsed
			}
			p = p.parentElement as HTMLElement | null
		}
		return null
	}

	// Track page layers and ensure overlay/select roots
	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		let added = 0

		// ✅ Funzione per aggiornare pageElsRef e creare select roots
		const ensurePageLayers = () => {
			const holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
			const layers = holders.length === 0
				? Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
				: []

			for (const holder of holders.length > 0 ? holders : layers) {
				const pageNum = holders.length > 0
					? parseInt(holder.getAttribute('data-page-number') || '', 10)
					: getPageNumber(holder)

				if (!pageNum || pageNum <= 0) continue

				const pageLayer = holders.length > 0
					? (holder as any).querySelector('.rpv-core__page-layer') as HTMLElement | null
					: holder

				if (!pageLayer) continue

				pageElsRef.current.set(pageNum, pageLayer)
				elToPageRef.current.set(pageLayer, pageNum)

				// ✅ Crea select root quando pageLayer è pronto
				if (createSelectRootForPage(pageNum, pageLayer)) {
					added++
				}
			}
		}

		// ✅ Observer dedicato per textLayer: crea overlay root quando textLayer viene aggiunto
		const textLayerObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				// ✅ Gestisci anche la rimozione di textLayer per pulire root orfani
				for (const node of mutation.removedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue
					const el = node as HTMLElement
					if (el.classList?.contains('rpv-core__text-layer')) {
						// ✅ Se un textLayer viene rimosso, verifica se ci sono root orfani
						const pageLayer = el.closest('.rpv-core__page-layer') as HTMLElement | null
						if (pageLayer) {
							const pageNum = getPageNumber(pageLayer)
							if (pageNum) {
								const existingRoot = overlayRootsRef.current.get(pageNum)
								if (existingRoot && !document.contains(existingRoot)) {
									overlayRootsRef.current.delete(pageNum)
								}
							}
						}
					}
				}

				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue
					const el = node as HTMLElement

					// ✅ Controlla se il nodo aggiunto è un textLayer
					if (el.classList?.contains('rpv-core__text-layer')) {
						const pageLayer = el.closest('.rpv-core__page-layer') as HTMLElement | null
						if (pageLayer) {
							const pageNum = getPageNumber(pageLayer)
							if (pageNum) {
								// ✅ Evento: textLayer è stato aggiunto, crea overlay root
								if (createOverlayRootForPage(pageNum, pageLayer, el)) {
									added++
								}
							}
						}
					}

					// ✅ Controlla se dentro il nodo aggiunto c'è un textLayer
					const textLayers = el.querySelectorAll?.('.rpv-core__text-layer') as NodeListOf<HTMLElement> | undefined
					if (textLayers) {
						for (const textLayer of Array.from(textLayers)) {
							const pageLayer = textLayer.closest('.rpv-core__page-layer') as HTMLElement | null
							if (pageLayer) {
								const pageNum = getPageNumber(pageLayer)
								if (pageNum) {
									// ✅ Evento: textLayer è stato aggiunto, crea overlay root
									if (createOverlayRootForPage(pageNum, pageLayer, textLayer)) {
										added++
									}
								}
							}
						}
					}
				}
			}
			if (added > 0) {
				setSelectTick(t => t + 1)
				added = 0
			}
		})

		// ✅ Observer generale per aggiornare pageLayers e select roots
		const generalObserver = new MutationObserver(() => {
			ensurePageLayers()
			// ✅ Verifica anche textLayer esistenti che potrebbero non essere stati rilevati
			const existingTextLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
			for (const textLayer of existingTextLayers) {
				const pageLayer = textLayer.closest('.rpv-core__page-layer') as HTMLElement | null
				if (pageLayer) {
					const pageNum = getPageNumber(pageLayer)
					if (pageNum) {
						// ✅ CRITICO: Verifica se il root esiste ma non è nel DOM (root orfano)
						const existingRoot = overlayRootsRef.current.get(pageNum)
						if (existingRoot && !document.contains(existingRoot)) {
							// Root esiste ma non è nel DOM - rimuovilo e ricrealo
							overlayRootsRef.current.delete(pageNum)
						}
						// ✅ Crea root se non esiste o se è stato appena rimosso
						if (!overlayRootsRef.current.has(pageNum)) {
							if (createOverlayRootForPage(pageNum, pageLayer, textLayer)) {
								added++
							}
						} else {
							// ✅ Aggiorna il root esistente per mantenere allineamento con textLayer
							createOverlayRootForPage(pageNum, pageLayer, textLayer)
						}
					}
				}
			}
			if (added > 0) {
				setSelectTick(t => t + 1)
				added = 0
			}
		})

		// ✅ Inizializza
		ensurePageLayers()

		// ✅ Verifica textLayer esistenti al mount
		const existingTextLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
		for (const textLayer of existingTextLayers) {
			const pageLayer = textLayer.closest('.rpv-core__page-layer') as HTMLElement | null
			if (pageLayer) {
				const pageNum = getPageNumber(pageLayer)
				if (pageNum) {
					if (createOverlayRootForPage(pageNum, textLayer)) {
						added++
					}
				}
			}
		}
		if (added > 0) {
			setSelectTick(t => t + 1)
			added = 0
		}

		// ✅ Osserva l'host per textLayer che vengono aggiunti
		textLayerObserver.observe(host, {
			subtree: true,
			childList: true
		})

		// ✅ Osserva l'host per aggiornamenti generali
		generalObserver.observe(host, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['style', 'class']
		})

		// ✅ Aggiorna anche su scroll/zoom e resize
		const onAny = () => {
			ensurePageLayers()
		}
		const scs = [
			host.querySelector('.rpv-core__inner') as HTMLElement | null,
			host.querySelector('.rpv-core__pages') as HTMLElement | null,
			host.querySelector('.rpv-core__viewer') as HTMLElement | null,
		].filter(Boolean) as HTMLElement[]
		scs.forEach(sc => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
		window.addEventListener('resize', onAny)

		return () => {
			textLayerObserver.disconnect()
			generalObserver.disconnect()
			scs.forEach(sc => sc.removeEventListener('scroll', onAny, { capture: true } as any))
			window.removeEventListener('resize', onAny)
		}
	}, [selectMode, selectKind, hostRef, viewerReadyTick])

	// ✅ Funzione per forzare la ricreazione di un overlay root quando viene rilevato orfano
	const ensureOverlayRootForPage = (pageNum: number): boolean => {
		const host = hostRef.current
		if (!host) {
			console.warn('[OVERLAYS] ⚠️ Host non disponibile per ensureOverlayRootForPage:', pageNum)
			return false
		}

		// ✅ CRITICO: Rimuovi prima il root orfano dalla mappa se esiste ma non è nel DOM
		if (overlayRootsRef.current.has(pageNum)) {
			const existingRoot = overlayRootsRef.current.get(pageNum)!
			if (!document.contains(existingRoot)) {
				overlayRootsRef.current.delete(pageNum)
			} else {
				// ✅ Root esiste ed è nel DOM, non serve ricrearlo
				return false
			}
		}

		// ✅ Cerca il textLayer in modo robusto
		let textLayer: HTMLElement | null = null
		let pageLayer: HTMLElement | null = null

		// ✅ Strategia 1: Usa pageElsRef se disponibile E valido nel DOM
		const pageEl = pageElsRef.current.get(pageNum)
		if (pageEl) {
			if (document.contains(pageEl)) {
				pageLayer = pageEl
				textLayer = pageEl.querySelector('.rpv-core__text-layer') as HTMLElement | null
			} else {
				// ✅ CRITICO: Rimuovi riferimento obsoleto se pageEl non è più nel DOM
				pageElsRef.current.delete(pageNum)
			}
		}

		// ✅ Strategia 2: Cerca nel DOM usando data-page-number
		if (!textLayer || !document.contains(textLayer)) {
			const holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
			let foundHolder = false
			for (const holder of holders) {
				const pageNumAttr = parseInt(holder.getAttribute('data-page-number') || '', 10)
				if (pageNumAttr === pageNum) {
					foundHolder = true
					const foundPageLayer = (holder as any).querySelector('.rpv-core__page-layer') as HTMLElement | null
					if (foundPageLayer && document.contains(foundPageLayer)) {
						pageLayer = foundPageLayer
						pageElsRef.current.set(pageNum, foundPageLayer)
						const foundTextLayer = foundPageLayer.querySelector('.rpv-core__text-layer') as HTMLElement | null
						if (foundTextLayer && document.contains(foundTextLayer)) {
							textLayer = foundTextLayer
							break
						}
					}
					// ✅ Prova anche a cercare textLayer direttamente nel holder
					const foundTextLayer2 = holder.querySelector('.rpv-core__text-layer') as HTMLElement | null
					if (foundTextLayer2 && document.contains(foundTextLayer2)) {
						textLayer = foundTextLayer2
						if (!pageLayer) {
							pageLayer = foundTextLayer2.closest('.rpv-core__page-layer') as HTMLElement | null
							if (pageLayer) {
								pageElsRef.current.set(pageNum, pageLayer)
							}
						}
						break
					}
				}
			}
		}

		// ✅ Strategia 3: Cerca tutti i textLayer e verifica quale appartiene alla pagina
		if (!textLayer || !document.contains(textLayer)) {
			const allTextLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
			for (const tl of allTextLayers) {
				if (!document.contains(tl)) continue
				const parentPageLayer = tl.closest('.rpv-core__page-layer') as HTMLElement | null
				if (parentPageLayer) {
					const foundPageNum = getPageNumber(parentPageLayer)
					if (foundPageNum === pageNum) {
						textLayer = tl
						pageLayer = parentPageLayer
						pageElsRef.current.set(pageNum, parentPageLayer)
						break
					}
				}
			}
		}

		// ✅ Se abbiamo trovato un textLayer valido, crea/aggiorna il root
		if (textLayer && pageLayer && document.contains(textLayer)) {
			return createOverlayRootForPage(pageNum, pageLayer, textLayer)
		}

		// ✅ Log throttled (solo ogni 2 secondi per pagina) se non riusciamo a trovare il textLayer
		const now = Date.now()
		const lastLogTime = lastLogTimeRef.current.get(pageNum) || 0
		if (now - lastLogTime > 2000) {
			lastLogTimeRef.current.set(pageNum, now)
			const holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
			const holdersForPage = holders.filter(h => parseInt(h.getAttribute('data-page-number') || '', 10) === pageNum)
			const allTextLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
			const textLayersInDOM = allTextLayers.filter(tl => document.contains(tl))
			const pageLayers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
			const pageLayersInDOM = pageLayers.filter(pl => document.contains(pl))

			console.warn('[OVERLAYS] ⚠️ TextLayer non trovato per pagina:', pageNum, {
				pageElExists: !!pageEl,
				pageElInDOM: pageEl ? document.contains(pageEl) : false,
				hostInDOM: document.contains(host),
				totalHolders: holders.length,
				holdersForPage: holdersForPage.length,
				totalTextLayers: allTextLayers.length,
				textLayersInDOM: textLayersInDOM.length,
				totalPageLayers: pageLayers.length,
				pageLayersInDOM: pageLayersInDOM.length
			})
		}
		return false
	}

	return {
		overlayRootsRef,
		selectRootsRef,
		pageElsRef,
		elToPageRef,
		selectTick,
		setSelectTick,
		ensureOverlayRootForPage
	}
}
