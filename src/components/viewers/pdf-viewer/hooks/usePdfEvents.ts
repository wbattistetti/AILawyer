import { useEffect, useRef } from 'react'

interface UsePdfEventsProps {
	hostRef: React.RefObject<HTMLDivElement>
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
	extractOpen: boolean
	tool: any
	drawingRef: React.MutableRefObject<any>
	draft: any
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	mouseDownPageRef: React.MutableRefObject<number | null>
	mouseDownPosRef: React.MutableRefObject<any>
	onDraftChange: (draft: any) => void
	onAnnotsChange: (annots: any[]) => void
	onOcrDragChange: (drag: any) => void
	onContextMenuChange: (menu: any) => void
	onExtractPosChange: (pos: any) => void
	onExtractPageChange: (page: number) => void
	onExtractOpenChange: (open: boolean) => void
	onLastSelectionChange: (selection: any) => void
	colorH: string
	colorU: string
	colorS: string
}

export const usePdfEvents = ({
	hostRef,
	selectMode,
	selectKind,
	extractOpen,
	tool,
	drawingRef,
	draft,
	pageElsRef,
	elToPageRef,
	mouseDownPageRef,
	mouseDownPosRef,
	onDraftChange,
	onAnnotsChange,
	onOcrDragChange,
	onContextMenuChange,
	onExtractPosChange,
	onExtractPageChange,
	onExtractOpenChange,
	onLastSelectionChange,
	colorH,
	colorU,
	colorS
}: UsePdfEventsProps) => {

	// OCR Drag events
	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			onOcrDragChange(prev => prev.dragging ? { ...prev, x: e.clientX - prev.dx, y: e.clientY - prev.dy } : prev)
		}
		const onUp = () => onOcrDragChange(prev => prev.dragging ? { ...prev, dragging: false } : prev)
		window.addEventListener('mousemove', onMove)
		window.addEventListener('mouseup', onUp)
		return () => {
			window.removeEventListener('mousemove', onMove)
			window.removeEventListener('mouseup', onUp)
		}
	}, [])

	// Native selection capture (digital text)
	useEffect(() => {
		if (!(selectMode && selectKind === 'NATIVE')) return
		const host = hostRef.current
		if (!host) return

		let timer: number | null = null
		const handleSelection = async () => {
			try {
				if (extractOpen) return
				const sel = window.getSelection()
				const raw = String(sel || '')
				if (!sel || sel.rangeCount === 0 || !raw || !raw.trim()) return

				// Complex page detection and bbox calculation logic would go here
				// For now, simplified version

			} catch {}
		}

		const onMouseDown = (ev: MouseEvent) => {
			if (extractOpen) return
			// Complex mouse down logic would go here
		}

		const onMouseUp = async (ev: MouseEvent) => {
			if (extractOpen || timer) window.clearTimeout(timer)
			// Complex mouse up logic would go here
		}

		const onSelChange = () => {
			if (timer) window.clearTimeout(timer)
			if (!extractOpen) timer = window.setTimeout(handleSelection, 30)
		}

		document.addEventListener('mousedown', onMouseDown, true)
		document.addEventListener('mouseup', onMouseUp, true)
		document.addEventListener('selectionchange', onSelChange, true)

		return () => {
			if (timer) window.clearTimeout(timer)
			document.removeEventListener('mousedown', onMouseDown, true)
			document.removeEventListener('mouseup', onMouseUp, true)
			document.removeEventListener('selectionchange', onSelChange, true)
		}
	}, [selectMode, selectKind, extractOpen])

	// OCR Click handler for inspector
	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		const onClick = (ev: MouseEvent) => {
			// Complex OCR page detection logic would go here
			// For now, simplified version
		}

		host.addEventListener('click', onClick)
		return () => host.removeEventListener('click', onClick)
	}, [])

	// Keyboard shortcuts
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				try { const s = window.getSelection(); s && s.removeAllRanges() } catch {}
			}
		}
		document.addEventListener('keydown', onKey, true)
		return () => document.removeEventListener('keydown', onKey, true)
	}, [])
}
