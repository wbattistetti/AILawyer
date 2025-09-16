import React, { useEffect, useRef } from 'react'
import { Worker, Viewer, SpecialZoomLevel, ScrollMode } from '@react-pdf-viewer/core'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/zoom/lib/styles/index.css'


type VLine = { x: number; x1: number; y: number; y1: number; text: string }

export interface VerifyPdfViewerProps {
	fileUrl: string
	page: number
	lines: VLine[] | null
	onPageChange?: (page: number) => void
	hideToolbar?: boolean
}

export const VerifyPdfViewer: React.FC<VerifyPdfViewerProps> = ({ fileUrl, page, lines: _lines, onPageChange, hideToolbar: _hideToolbar }) => {
	const hostRef = useRef<HTMLDivElement | null>(null)
	const scrollMode = scrollModePlugin()
	const zoomPluginInstance = zoomPlugin()
	const scaleRef = useRef<number>(1)
	const lastTsRef = useRef<number>(0)

	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const pageEl = host.querySelector(`[data-page-number="${page}"]`)
		if (pageEl) (pageEl as HTMLElement).scrollIntoView({ block: 'start', inline: 'nearest' })
	}, [page])

	// Ctrl + wheel zoom only this viewer (pane-scoped)
	useEffect(() => {
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return
			const host = hostRef.current
			if (!host) return
			if (!host.contains(e.target as Node)) return
			e.preventDefault()
			const now = Date.now()
			if (now - lastTsRef.current < 50) return
			lastTsRef.current = now
			const dir = e.deltaY < 0 ? 1 : -1
			const curr = typeof scaleRef.current === 'number' ? scaleRef.current : 1
			// Asymmetric fixed step: zoom-in 1.5%, zoom-out 0.8%
			const factorIn = 1.015
			const factorOut = 1.008
			const factor = dir > 0 ? factorIn : factorOut
			const next = Math.max(0.2, Math.min(4, Number((dir > 0 ? curr * factor : curr / factor).toFixed(3))))
			scaleRef.current = next
			;(window as any).__rpvLastZoomScale = next
			try { (zoomPluginInstance as any).zoomTo(next) } catch {}
		}
		document.addEventListener('wheel', onWheel, { passive: false, capture: true })
		return () => document.removeEventListener('wheel', onWheel, { capture: true } as any)
	}, [])

	return (
		<div ref={hostRef} className="h-full w-full relative overflow-hidden">
			<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
				<Viewer
					fileUrl={fileUrl}
					defaultScale={SpecialZoomLevel.PageWidth}
					plugins={[scrollMode, zoomPluginInstance]}
					scrollMode={ScrollMode.Vertical}
					initialPage={Math.max(0, (page || 1) - 1)}
					onPageChange={(e) => { if (onPageChange) onPageChange(e.currentPage + 1) }}
					onZoom={(e: any) => { const s = (e?.scale || e?.zoom) as number; if (typeof s === 'number') { scaleRef.current = s; (window as any).__rpvLastZoomScale = s } }}
				/>
			</Worker>
		</div>
	)
}


