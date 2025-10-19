import React from 'react'
import { Worker, Viewer, ScrollMode } from '@react-pdf-viewer/core'
import { getTextInViewportBox } from '../../../../features/pdf/getTextInViewportBox'
import { getTextInPdfBox } from '../../../../features/pdf/getTextInPdfBox'
import { SvgSelectLayer } from '../../../../features/pdf/SvgSelectLayer'

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
}

export const PdfViewerCore: React.FC<PdfViewerCoreProps> = ({
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
	docId
}) => {
	return (
		<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
			<Viewer
				fileUrl={fileUrl}
				defaultScale={0.75}
				plugins={[scrollMode, pageNav, searchPluginInstance, highlight, zoomPluginInstance]}
				scrollMode={ScrollMode.Vertical}
				initialPage={Math.max(0, (page || 1) - 1)}
				onPageChange={(e) => { const cp = e.currentPage + 1; setPageInput(String(cp)); onPageChange?.(cp) }}
				onDocumentLoad={(e) => { 
					const doc = (e as any).doc || (e as any).document
					const total = doc?.numPages || 0
					if (doc) pdfDocRef.current = doc  // ✅ Salva reference per hook
					if (total) { setTotalPages(total); setPageInput('1') }
					const container = hostRef.current as HTMLElement | null
					if (container) container.style.setProperty('--scale-factor', String(scaleRef.current || 1))
					const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
					if (viewer) viewer.style.setProperty('--scale-factor', String(scaleRef.current || 1))
					try { window.dispatchEvent(new CustomEvent('app:viewer-ready', { detail: { docId: docId || 'current' } })) } catch {}
					try { console.log('[VIEWER][ready]', { docId: docId || 'current', total }) } catch {}
				}}
				onZoom={(e: any) => { 
					const s = (e?.scale || e?.zoom) as number
					if (typeof s === 'number') { 
						console.log('[ZOOM][viewer-onZoom] FIRED', { 
							scale: s.toFixed(3), 
							pct: Math.round(s*100),
							scaleRefBefore: scaleRef.current.toFixed(3)
						})
						scaleRef.current = s
						setZoomPct(Math.round(s*100))
						;(window as any).__rpvLastZoomScale = s
						const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
						if (viewer) {
							viewer.style.setProperty('--scale-factor', String(s))
							console.log('[ZOOM][viewer-onZoom] CSS var set', { 
								scaleFactor: s.toFixed(3),
								viewerExists: !!viewer
							})
						}
						try { requestAnimationFrame(()=>{ try { (window as any).__deskewApply?.() } catch {} }) } catch {} 
					} 
				}}
				renderPage={(p: any) => (
					<div style={{ position: 'relative', width: '100%', height: '100%' }}>
						{p.canvasLayer.children}
						{p.annotationLayer.children}
						{p.textLayer.children}
						{selectMode && selectKind==='OCR' && (
							<div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
								<SvgSelectLayer
									enabled={true}
									pageIndex={p.pageIndex}
									onSelect={async ({ pageNumber, viewportBox })=>{
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
										px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
										py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
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
											try { console.log('[EXTRACT][PDF_BOX]', { pageNumber, domW, baseW: base.width, scale, pdfBox: { x0, y0, x1, y1 } }) } catch {}
										}
									} catch {}
									try { console.log('[EXTRACT][TEXT]', { pageNumber, viewportBox, preview, canonical }) } catch {}
									setLastSelection({ pdfPageNumber: pageNumber, bboxPdf: undefined, viewportBox, text: canonical })
									setExtractOpen(true)
								}}
								/>
							</div>
						)}
					</div>
				)}
			/>
		</Worker>
	)
}