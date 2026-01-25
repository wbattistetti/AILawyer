import React, { useRef, useEffect, useLayoutEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Worker, Viewer, ScrollMode, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/zoom/lib/styles/index.css'
import '@react-pdf-viewer/page-navigation/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
import '@react-pdf-viewer/highlight/lib/styles/index.css'
import { getTextInViewportBox } from '../../../../features/pdf/getTextInViewportBox';
import { getTextInPdfBox } from '../../../../features/pdf/getTextInPdfBox';
import { SvgSelectLayer } from '../../../../features/pdf/SvgSelectLayer';
import { useToast } from '@/hooks/use-toast';

export type PdfViewerHandle = {
	jumpToPage: (page1Based: number) => void;
	zoomTo: (scale: number) => void;
	find: (keyword: string) => void;
	isReady: () => boolean;
};

interface PdfViewerCoreProps {
	fileUrl: string
	page?: number
	onPageChange?: (page: number) => void
	scrollMode: any
	pageNav: any
	searchPluginInstance: any
	highlight: any
	zoomPluginInstance: any
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	hostRef: React.RefObject<HTMLElement>
	pdfDocRef: React.MutableRefObject<any>
	scaleRef: React.MutableRefObject<number>
	setPageInput: (page: string) => void
	setTotalPages: (pages: number) => void
	setZoomPct: (zoom: number) => void
	setExtractPos: (pos: { x: number; y: number }) => void
	setExtractPage: (page: number) => void
	setLastSelection: (selection: any) => void
	setExtractOpen: (open: boolean) => void
	docId?: string
	scrollRef?: React.RefObject<HTMLElement>
	onViewerReady?: () => void
}

function PdfViewerCoreInner(props: PdfViewerCoreProps, ref: React.Ref<PdfViewerHandle>) {
	const {
		fileUrl,
		page,
		onPageChange,
		scrollMode,
		pageNav,
		searchPluginInstance,
		highlight,
		zoomPluginInstance,
		selectMode,
		selectKind,
		hostRef,
		pdfDocRef,
		scaleRef,
		setPageInput,
		setTotalPages,
		setZoomPct,
		setExtractPos,
		setExtractPage,
		setLastSelection,
		setExtractOpen,
		docId,
		scrollRef,
		onViewerReady
	} = props
	const [ready, setReady] = useState(false);
	const queueRef = useRef<Array<() => void>>([]);
	const lastViewerRef = useRef<HTMLElement | null>(null);
	const { toast } = useToast();

	const getScrollContainer = () =>
		(scrollRef?.current as HTMLElement | null) ||
		(hostRef.current?.parentElement as HTMLElement | null)

	const syncViewerRef = () => {
		const container = getScrollContainer()
		if (!container) return
		const viewer = container.querySelector('.rpv-core__viewer') as HTMLElement | null
		if (viewer) {
			if (lastViewerRef.current !== viewer) {
				lastViewerRef.current = viewer
				hostRef.current = viewer as any
				onViewerReady?.()
			} else {
				hostRef.current = viewer as any
			}
		}
	}

	const execOrQueue = (fn: () => void) => {
		if (ready) fn();
		else queueRef.current.push(fn);
	};

	// ✅ Sopprimi il warning di --scale-factor se persiste (non è critico, il CSS globale lo gestisce)
	// IMPORTANTE: Deve essere eseguito PRIMA che PDF.js venga caricato
	useLayoutEffect(() => {
		const originalWarn = console.warn
		const originalError = console.error

		// ✅ Intercetta console.warn
		console.warn = (...args: any[]) => {
			const message = String(args[0] || '')
			// ✅ Sopprimi solo il warning specifico di --scale-factor
			if (message.includes('--scale-factor') ||
			    message.includes('scale-factor') ||
			    message.includes('CSS-variable must be set')) {
				return // ✅ Ignora il warning
			}
			originalWarn.apply(console, args)
		}

		// ✅ Intercetta anche console.error (alcune versioni di PDF.js potrebbero usarlo)
		console.error = (...args: any[]) => {
			const message = String(args[0] || '')
			if (message.includes('--scale-factor') ||
			    message.includes('scale-factor') ||
			    message.includes('CSS-variable must be set')) {
				return // ✅ Ignora l'errore
			}
			originalError.apply(console, args)
		}

		return () => {
			console.warn = originalWarn
			console.error = originalError
		}
	}, []) // ✅ Esegui solo al mount, in modo sincrono

	// ✅ Associa hostRef al vero viewer PDF (.rpv-core__viewer)
	useLayoutEffect(() => {
		syncViewerRef()
	}, [ready, scrollRef])

	// ✅ Imposta --scale-factor sul container principale IMMEDIATAMENTE al mount (sincrono)
	// Questo assicura che la variabile CSS sia disponibile PRIMA che i text layer vengano renderizzati
	useLayoutEffect(() => {
		const container = getScrollContainer()
		const viewer = hostRef.current as HTMLElement | null
		const scale = scaleRef.current || 1
		if (container) {
			container.style.setProperty('--scale-factor', String(scale))
		}
		if (viewer) {
			viewer.style.setProperty('--scale-factor', String(scale))
		}
	}, []) // ✅ Esegui solo al mount, in modo sincrono prima del paint

	// ✅ CENTRATURA SEMPLICE: Solo quando il documento è caricato
	useEffect(() => {
		if (!ready) return

		const viewer = hostRef.current as HTMLElement | null
		if (viewer) {
			// Aspetta un po' per il DOM
			setTimeout(() => {
				viewer.style.textAlign = 'center'
			}, 100)
		}
	}, [ready])

	// ✅ Aggiorna --scale-factor su tutti i container quando cambia lo zoom
	useEffect(() => {
		if (!ready) return

		const updateScaleFactor = () => {
			const scale = scaleRef.current || 1
			const container = getScrollContainer()
			const viewer = hostRef.current as HTMLElement | null
			const scope = (container || viewer) as HTMLElement | null
			if (container) {
				// ✅ Imposta sul container principale
				container.style.setProperty('--scale-factor', String(scale))
			}
			if (viewer) {
				// ✅ Imposta sul viewer
				viewer.style.setProperty('--scale-factor', String(scale))
			}
			if (scope) {
				// ✅ Imposta su tutti i page-layer
				const pageLayers = scope.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement>
				pageLayers.forEach((layer) => {
					layer.style.setProperty('--scale-factor', String(scale))
				})

				// ✅ Imposta su tutti i text-layer (sia .rpv-core__text-layer che .textLayer)
				const textLayers = scope.querySelectorAll('.rpv-core__text-layer, .textLayer') as NodeListOf<HTMLElement>
				textLayers.forEach((layer) => {
					layer.style.setProperty('--scale-factor', String(scale))
				})
			}
		}

		// Aggiorna immediatamente
		updateScaleFactor()
		syncViewerRef()

		// ✅ MutationObserver minimale: aggiorna solo quando vengono aggiunti nuovi text layer
		const observer = new MutationObserver((mutations) => {
			let hasNewTextLayer = false
			let hasViewer = false
			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					for (const node of mutation.addedNodes) {
						if (node instanceof HTMLElement) {
							if (node.classList?.contains('rpv-core__viewer') || node.querySelector?.('.rpv-core__viewer')) {
								hasViewer = true
							}
							// ✅ Verifica se è un text layer o contiene un text layer
							if (node.classList?.contains('textLayer') ||
							    node.classList?.contains('rpv-core__text-layer') ||
							    node.querySelector?.('.textLayer') ||
							    node.querySelector?.('.rpv-core__text-layer')) {
								hasNewTextLayer = true
								break
							}
						}
					}
				}
			}
			if (hasViewer) {
				syncViewerRef()
			}
			// ✅ Aggiorna solo se è stato aggiunto un nuovo text layer
			if (hasNewTextLayer) {
				updateScaleFactor()
			}
		})

		const observerTarget = (getScrollContainer() || hostRef.current) as HTMLElement | null
		if (observerTarget) {
			observer.observe(observerTarget, {
				subtree: true,
				childList: true
			})
		}

		return () => {
			observer.disconnect()
		}
	}, [ready, hostRef])

	useImperativeHandle(ref, () => ({
		jumpToPage: (page1Based: number) => {
			const zero = Math.max(0, page1Based - 1);
			execOrQueue(() => (pageNav as any).jumpToPage?.(zero));
		},
		zoomTo: (scale: number) => {
			execOrQueue(() => (zoomPluginInstance as any).zoomTo?.(scale));
		},
		find: (keyword: string) => {
			execOrQueue(() => (searchPluginInstance as any).jumpToNextMatch?.({
				keyword, matchCase: false, wholeWords: false
			}));
		},
		isReady: () => ready
	}), [ready, pageNav, searchPluginInstance, zoomPluginInstance]);

	useEffect(() => {
		if (!ready) return;
		const tasks = queueRef.current.splice(0);
		tasks.forEach((fn) => fn());
	}, [ready]);

	return (
		<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
			<Viewer
				fileUrl={fileUrl}
				defaultScale={SpecialZoomLevel.PageWidth}
				plugins={[scrollMode, pageNav, searchPluginInstance, highlight, zoomPluginInstance]}
				scrollMode={ScrollMode.Vertical}
				initialPage={Math.max(0, (page || 1) - 1)}
				onPageChange={(e) => {
					const cp = e.currentPage + 1;
					setPageInput(String(cp));
					onPageChange?.(cp);
				}}
				onDocumentLoad={(e) => {
					const doc = (e as any).doc || (e as any).document
					const total = doc?.numPages || 0
					if (doc) pdfDocRef.current = doc  // ✅ Salva reference per hook
					if (total) { setTotalPages(total); setPageInput('1') }
					syncViewerRef()

					// ✅ Imposta --scale-factor su tutti i container necessari
					const scale = scaleRef.current || 1
					const updateScale = () => {
						const container = getScrollContainer()
						const viewer = hostRef.current as HTMLElement | null
						const scope = (container || viewer) as HTMLElement | null
						if (container) {
							container.style.setProperty('--scale-factor', String(scale))
						}
						if (viewer) {
							viewer.style.setProperty('--scale-factor', String(scale))
						}
						// ✅ Imposta anche su tutti i page-layer e text-layer
						const pageLayers = scope?.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement> | undefined
						if (pageLayers) {
							pageLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(scale))
							})
						}
						// ✅ Imposta su tutti i text-layer (sia .rpv-core__text-layer che .textLayer)
						const textLayers = scope?.querySelectorAll('.rpv-core__text-layer, .textLayer') as NodeListOf<HTMLElement> | undefined
						if (textLayers) {
							textLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(scale))
							})
						}
					}

					// Aggiorna immediatamente
					updateScale()

					// ✅ Aggiorna anche dopo un breve delay per catturare i text-layer renderizzati in modo asincrono
					setTimeout(() => updateScale(), 100)
					setTimeout(() => updateScale(), 500)

					try { window.dispatchEvent(new CustomEvent('app:viewer-ready', { detail: { docId: docId || 'current' } })) } catch { }
					setReady(true);
				}}
				onZoom={(e: any) => {
					const s = (e?.scale || e?.zoom) as number
					if (typeof s === 'number') {
						const prevScale = scaleRef.current
						scaleRef.current = s
						setZoomPct(Math.round(s * 100))
						; (window as any).__rpvLastZoomScale = s

						console.log('[PDF-ZOOM][onZoom] Chiamato', {
							timestamp: Date.now(),
							prevScale: prevScale.toFixed(3),
							newScale: s.toFixed(3),
							delta: Math.abs(s - prevScale).toFixed(3)
						})

						// ✅ Aggiorna --scale-factor su tutti i container necessari
						const container = getScrollContainer()
						const viewer = hostRef.current as HTMLElement | null
						const scope = (container || viewer) as HTMLElement | null

						if (container) {
							const beforeRect = container.getBoundingClientRect()
							console.log('[PDF-ZOOM][onZoom] Prima di aggiornare CSS variable (container)', {
								containerRect: {
									width: beforeRect.width.toFixed(2),
									height: beforeRect.height.toFixed(2)
								},
								currentScaleFactor: container.style.getPropertyValue('--scale-factor')
							})

							container.style.setProperty('--scale-factor', String(s))

							requestAnimationFrame(() => {
								const afterRect = container.getBoundingClientRect()
								console.log('[PDF-ZOOM][onZoom] Dopo aggiornamento CSS variable (container)', {
									containerRect: {
										width: afterRect.width.toFixed(2),
										height: afterRect.height.toFixed(2)
									},
									widthChanged: Math.abs(afterRect.width - beforeRect.width) > 0.1,
									heightChanged: Math.abs(afterRect.height - beforeRect.height) > 0.1,
									newScaleFactor: container.style.getPropertyValue('--scale-factor')
								})
							})
						}

						if (viewer) {
							const beforeRect = viewer.getBoundingClientRect()
							console.log('[PDF-ZOOM][onZoom] Prima di aggiornare CSS variable (viewer)', {
								viewerRect: {
									width: beforeRect.width.toFixed(2),
									height: beforeRect.height.toFixed(2)
								},
								currentScaleFactor: viewer.style.getPropertyValue('--scale-factor')
							})

							viewer.style.setProperty('--scale-factor', String(s))

							requestAnimationFrame(() => {
								const afterRect = viewer.getBoundingClientRect()
								console.log('[PDF-ZOOM][onZoom] Dopo aggiornamento CSS variable (viewer)', {
									viewerRect: {
										width: afterRect.width.toFixed(2),
										height: afterRect.height.toFixed(2)
									},
									widthChanged: Math.abs(afterRect.width - beforeRect.width) > 0.1,
									heightChanged: Math.abs(afterRect.height - beforeRect.height) > 0.1,
									newScaleFactor: viewer.style.getPropertyValue('--scale-factor')
								})
							})
						}

						// ✅ Aggiorna anche su tutti i page-layer (dove viene renderizzato il text layer)
						const pageLayers = scope?.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement> | undefined
						if (pageLayers) {
							console.log('[PDF-ZOOM][onZoom] Aggiornamento page-layers', {
								count: pageLayers.length,
								scale: s.toFixed(3)
							})
							pageLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(s))
							})
						}

						// ✅ Aggiorna anche su tutti i text-layer (sia .rpv-core__text-layer che .textLayer)
						const textLayers = scope?.querySelectorAll('.rpv-core__text-layer, .textLayer') as NodeListOf<HTMLElement> | undefined
						if (textLayers) {
							console.log('[PDF-ZOOM][onZoom] Aggiornamento text-layers', {
								count: textLayers.length,
								scale: s.toFixed(3)
							})
							textLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(s))
							})
						}

						try { requestAnimationFrame(() => { try { (window as any).__deskewApply?.() } catch { } }) } catch { }
					}
				}}
				renderPage={(p: any) => {
					const pageNumber = p.pageIndex + 1; // Convert 0-based to 1-based

					// ✅ Imposta --scale-factor sul container della pagina PRIMA che il text layer venga renderizzato
					const scale = scaleRef.current || 1
					// ✅ Usa requestAnimationFrame per assicurarsi che il DOM sia pronto
					requestAnimationFrame(() => {
						const container = getScrollContainer()
						const viewer = hostRef.current as HTMLElement | null
						const scope = (container || viewer) as HTMLElement | null
						if (container) {
							// ✅ Imposta sul container principale
							container.style.setProperty('--scale-factor', String(scale))
						}
						if (viewer) {
							// ✅ Imposta sul viewer
							viewer.style.setProperty('--scale-factor', String(scale))
						}
						if (scope) {
							// ✅ Imposta su tutti i page-layer
							const pageLayers = scope.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement>
							pageLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(scale))
							})
							// ✅ Imposta su tutti i text-layer (sia .rpv-core__text-layer che .textLayer)
							const textLayers = scope.querySelectorAll('.rpv-core__text-layer, .textLayer') as NodeListOf<HTMLElement>
							textLayers.forEach((layer) => {
								layer.style.setProperty('--scale-factor', String(scale))
							})
						}
					})

					const handleDoubleClick = async (e: React.MouseEvent) => {
						// Evita di copiare se si sta selezionando testo
						if (window.getSelection()?.toString().trim()) {
							return;
						}

						e.preventDefault();
						e.stopPropagation();

						if (!docId) {
							toast({
								title: 'Errore',
								description: 'Documento non disponibile',
								variant: 'destructive'
							});
							return;
						}

						try {
							// Estrai il testo della pagina
							const { extractPageText } = await import('@/utils/extractPageText');
							const pageText = await extractPageText(docId, pageNumber);

							if (!pageText || !pageText.trim()) {
								toast({
									title: 'Attenzione',
									description: `Nessun testo OCR disponibile per la pagina ${pageNumber}`,
									variant: 'destructive'
								});
								return;
							}

							// Copia nella clipboard
							await navigator.clipboard.writeText(pageText);

							toast({
								title: 'Testo copiato',
								description: `Testo della pagina ${pageNumber} copiato nella clipboard`,
							});
						} catch (err) {
							console.error('[PdfViewerCore] Error copying page text:', err);
							toast({
								title: 'Errore',
								description: 'Impossibile copiare il testo della pagina',
								variant: 'destructive'
							});
						}
					};

					return (
						<div
							data-page-number={pageNumber}
							data-page={pageNumber}
							className="ai-pdf-page-root"
							style={{ position: 'relative', width: '100%', height: '100%' }}
							onDoubleClick={handleDoubleClick}
							title="Doppio clic per copiare il testo della pagina nella clipboard"
						>
							{p.canvasLayer.children}
							{p.annotationLayer.children}
							{p.textLayer.children}
							{selectMode && selectKind === 'OCR' && (
							<div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
								<SvgSelectLayer
									enabled={true}
									pageIndex={p.pageIndex}
									onSelect={async ({ pageNumber, viewportBox }) => {
										const host = hostRef.current as HTMLElement | null; if (!host) return
										const r = host.getBoundingClientRect()
										const pageRoot = host.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null
										const pr = pageRoot?.getBoundingClientRect() || r
										const panelW = 460, panelH = 260
										const boxLeft = pr.left + viewportBox.x
										const boxTop = pr.top + viewportBox.y
										const boxRight = boxLeft + viewportBox.w
										const boxBottom = boxTop + viewportBox.h
										// Posizione centrata rispetto al rettangolo
										let px = boxLeft + (viewportBox.w - panelW) / 2
										let py = boxTop + (viewportBox.h - panelH) / 2
										// Se il pannello ci sta dentro al box, clamp all'interno; altrimenti clamp a viewport
										const fitsInside = viewportBox.w >= panelW && viewportBox.h >= panelH
										if (fitsInside) {
											px = Math.max(boxLeft, Math.min(px, boxRight - panelW))
											py = Math.max(boxTop, Math.min(py, boxBottom - panelH))
										} else {
											px = Math.max(8, Math.min(px, (window.innerWidth || 1200) - panelW - 8))
											py = Math.max(8, Math.min(py, (window.innerHeight || 800) - panelH - 8))
										}
										setExtractPos({ x: px, y: py })
										setExtractPage(pageNumber)
										// OCR mode: per ora DOM preview; con OCR useremo i box parola
										const { text: preview } = await getTextInViewportBox(host, pageNumber, viewportBox)
										let canonical = preview
										// PDF-based opzionale
										try {
											if (pdfDocRef.current) {
												const page = await pdfDocRef.current.getPage(pageNumber)
												// Viewport coerente con le dimensioni DOM della pagina
												const base = page.getViewport({ scale: 1 })
												const domW = pr.width
												const scale = Math.max(0.1, domW / base.width)
												const vp = page.getViewport({ scale })
												const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
												const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
												const res = await getTextInPdfBox(page, { x0, y0, x1, y1 })
												if (res.text && res.text.trim()) canonical = res.text
												try { console.log('[EXTRACT][PDF_BOX]', { pageNumber, domW, baseW: base.width, scale, pdfBox: { x0, y0, x1, y1 } }) } catch { }
											}
										} catch { }
										try { console.log('[EXTRACT][TEXT]', { pageNumber, viewportBox, preview, canonical }) } catch { }
										setLastSelection({ pdfPageNumber: pageNumber, bboxPdf: undefined, viewportBox, text: canonical })
										setExtractOpen(true)
									}}
								/>
							</div>
						)}
					</div>
					)
				}}
			/>
		</Worker>
	)
}

export const PdfViewerCore = forwardRef<PdfViewerHandle, PdfViewerCoreProps>(PdfViewerCoreInner)
