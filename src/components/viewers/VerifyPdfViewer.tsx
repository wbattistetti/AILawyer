import React, { useEffect, useRef } from 'react'
import { Worker, Viewer, SpecialZoomLevel, ScrollMode } from '@react-pdf-viewer/core'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import '@react-pdf-viewer/core/lib/styles/index.css'


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

	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const pageEl = host.querySelector(`[data-page-number="${page}"]`)
		if (pageEl) (pageEl as HTMLElement).scrollIntoView({ block: 'start', inline: 'nearest' })
	}, [page])

	return (
		<div ref={hostRef} className="h-full w-full relative overflow-hidden">
			<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js">
				<Viewer
					fileUrl={fileUrl}
					defaultScale={SpecialZoomLevel.PageWidth}
					plugins={[scrollMode]}
					scrollMode={ScrollMode.Vertical}
					initialPage={Math.max(0, (page || 1) - 1)}
					onPageChange={(e) => { if (onPageChange) onPageChange(e.currentPage + 1) }}
				/>
			</Worker>
		</div>
	)
}


