import React, { useEffect, useRef } from 'react'
import { Worker, Viewer, ScrollMode } from '@react-pdf-viewer/core'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { searchPlugin } from '@react-pdf-viewer/search'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/zoom/lib/styles/index.css'
import '@react-pdf-viewer/page-navigation/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist'

import { SvgSelectLayer } from '../../../../features/pdf/SvgSelectLayer'
import { getTextInViewportBox } from '../../../../features/pdf/getTextInViewportBox'
import { getTextInPdfBox } from '../../../../features/pdf/getTextInPdfBox'
import { VLine } from '../types'

interface PdfViewerCoreProps {
	fileUrl: string
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	pdfDocRef: React.MutableRefObject<any>
	hostRef: React.RefObject<HTMLDivElement>
	zoomContainerRef?: React.RefObject<HTMLDivElement>
	onDocumentLoad?: (e: any) => void
	onZoom?: (e: any) => void
	onPageChange?: (page: number) => void
	onSelection?: (data: { pageNumber: number; viewportBox: any; text: string }) => void
}

export const PdfViewerCore: React.FC<PdfViewerCoreProps> = ({
	fileUrl,
	selectMode,
	selectKind,
	pdfDocRef,
	hostRef,
	zoomContainerRef,
	onDocumentLoad,
	onZoom,
	onPageChange,
	onSelection
}) => {
	const scrollMode = scrollModePlugin()
	const pageNav = pageNavigationPlugin()
	const zoomPluginInstance = zoomPlugin()
	const searchPluginInstance = searchPlugin()
	const { zoomTo } = zoomPluginInstance
	const scaleRef = useRef<number>(1)
	const zoomDebounceRef = useRef<number | null>(null)

	// Load PDF document
	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const loadingTask = (pdfjsLib as any).getDocument({ url: fileUrl, disableWorker: true })
				const doc = await loadingTask.promise
				if (!cancelled) pdfDocRef.current = doc
			} catch {}
		})()
		return () => { cancelled = true }
	}, [fileUrl])

	const handleZoom = (e: any) => {
		const s = (e?.scale || e?.zoom) as number
		if (typeof s === 'number') {
			scaleRef.current = s
			onZoom?.(e)
			const viewer = hostRef.current?.querySelector('.rpv-core__viewer') as HTMLElement | undefined
			if (viewer) viewer.style.setProperty('--scale-factor', String(s))
		}
	}

	return (
		<div ref={(el) => {
			hostRef.current = el
			if (zoomContainerRef) (zoomContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
		}} className="flex-1 overflow-hidden relative" style={{
			['--scale-factor' as any]: String(scaleRef.current || 1)
		}}>
			<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
				<Viewer
					fileUrl={fileUrl}
					defaultScale={0.75}
					plugins={[scrollMode, pageNav, searchPluginInstance, zoomPluginInstance]}
					scrollMode={ScrollMode.Vertical}
					initialPage={0}
					onDocumentLoad={onDocumentLoad}
					onZoom={handleZoom}
					onPageChange={(e) => onPageChange?.(e.currentPage + 1)}
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
											const host = hostRef.current as HTMLElement | null
											if (!host) return
											const r = host.getBoundingClientRect()
											const pageRoot = host.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null
											const pr = pageRoot?.getBoundingClientRect() || r
											const panelW = 460, panelH = 260
											const boxLeft = pr.left + viewportBox.x
											const boxTop = pr.top + viewportBox.y
											const boxRight = boxLeft + viewportBox.w
											const boxBottom = boxTop + viewportBox.h
											let px = boxLeft + (viewportBox.w - panelW) / 2
											let py = boxTop + (viewportBox.h - panelH) / 2
											const fitsInside = viewportBox.w >= panelW && viewportBox.h >= panelH
											if (fitsInside) {
												px = Math.max(boxLeft, Math.min(px, boxRight - panelW))
												py = Math.max(boxTop, Math.min(py, boxBottom - panelH))
											} else {
												px = Math.max(8, Math.min(px, (window.innerWidth||1200) - panelW - 8))
												py = Math.max(8, Math.min(py, (window.innerHeight||800) - panelH - 8))
											}

											// OCR mode: per ora DOM preview; con OCR useremo i box parola
											const { text: preview } = await getTextInViewportBox(host, pageNumber, viewportBox)
											let canonical = preview

											// PDF-based opzionale
											try {
												if (pdfDocRef.current) {
													const page = await pdfDocRef.current.getPage(pageNumber)
													const base = page.getViewport({ scale: 1 })
													const domW = pr.width
													const scale = Math.max(0.1, domW / base.width)
													const vp = page.getViewport({ scale })
													const [x0, y0] = vp.convertToPdfPoint(viewportBox.x, viewportBox.y + viewportBox.h)
													const [x1, y1] = vp.convertToPdfPoint(viewportBox.x + viewportBox.w, viewportBox.y)
													const res = await getTextInPdfBox(page, { x0, y0, x1, y1 })
													if (res.text && res.text.trim()) canonical = res.text
												}
											} catch {}

											onSelection?.({
												pageNumber,
												viewportBox,
												text: canonical
											})
										}}
									/>
								</div>
							)}
						</div>
					)}
				/>
			</Worker>
		</div>
	)
}
