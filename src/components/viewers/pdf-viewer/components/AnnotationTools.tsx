import React, { useEffect, useRef } from 'react'
import { Tool, Annotation } from '../types'

interface AnnotationToolsProps {
	tool: Tool
	drawingRef: React.MutableRefObject<{ page: number; startX: number; startY: number; x: number; y: number } | null>
	draft: Annotation | null
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	mouseDownPageRef: React.MutableRefObject<number | null>
	mouseDownPosRef: React.MutableRefObject<{ xPct: number; yPct: number } | null>
	hostRef: React.RefObject<HTMLDivElement>
	onDraftChange: (draft: Annotation | null) => void
	onAnnotsChange: (annots: Annotation[]) => void
	colorH: string
	colorU: string
	colorS: string
}

export const AnnotationTools: React.FC<AnnotationToolsProps> = ({
	tool,
	drawingRef,
	draft,
	pageElsRef,
	elToPageRef,
	mouseDownPageRef,
	mouseDownPosRef,
	hostRef,
	onDraftChange,
	onAnnotsChange,
	colorH,
	colorU,
	colorS
}) => {
	// Pointer drawing handlers with live draft
	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		const onDown = (ev: PointerEvent) => {
			if (tool === 'none') return
			const target = (ev.target as HTMLElement).closest('.rpv-core__page-layer') as HTMLElement | null
			if (!target) return
			const pageNum = elToPageRef.current.get(target) || 0
			if (pageNum <= 0) return
			mouseDownPageRef.current = pageNum
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
			mouseDownPosRef.current = { xPct: x, yPct: y }
			if (tool === 'comment') {
				const text = prompt('Commento:') || ''
				if (text) onAnnotsChange([{ id: cryptoRandom(), page: pageNum, type: 'comment', color: '#f59e0b', x0Pct: x, y0Pct: y, x1Pct: x, y1Pct: y, text }])
				return
			}
			drawingRef.current = { page: pageNum, startX: x, startY: y, x, y }
			onDraftChange(null)
			;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
		}

		const onMove = (ev: PointerEvent) => {
			if (!drawingRef.current) return
			const target = pageElsRef.current.get(drawingRef.current.page)
			if (!target) return
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
			drawingRef.current.x = x
			drawingRef.current.y = y
			const d = drawingRef.current
			const x0 = Math.min(d.startX, d.x)
			const x1 = Math.max(d.startX, d.x)
			const y0 = Math.min(d.startY, d.y)
			const y1 = Math.max(d.startY, d.y)
			if (tool === 'highlight') onDraftChange({ id: 'draft', page: d.page, type: 'highlight', color: colorH, x0Pct: x0, y0Pct: y0, x1Pct: x1, y1Pct: y1 })
			if (tool === 'underline') onDraftChange({ id: 'draft', page: d.page, type: 'underline', color: colorU, x0Pct: x0, y0Pct: y1, x1Pct: x1, y1Pct: y1 })
			if (tool === 'strike') onDraftChange({ id: 'draft', page: d.page, type: 'strike', color: colorS, x0Pct: x0, y0Pct: (y0 + y1) / 2, x1Pct: x1, y1Pct: (y0 + y1) / 2 })
		}

		const onUp = () => {
			const d = drawingRef.current
			if (!d) return
			drawingRef.current = null
			if (draft) { onAnnotsChange([draft]); onDraftChange(null) }
		}

		host.addEventListener('pointerdown', onDown)
		document.addEventListener('pointermove', onMove)
		document.addEventListener('pointerup', onUp)

		return () => {
			host.removeEventListener('pointerdown', onDown)
			document.removeEventListener('pointermove', onMove)
			document.removeEventListener('pointerup', onUp)
		}
	}, [tool, drawingRef, draft, pageElsRef, elToPageRef, mouseDownPageRef, mouseDownPosRef, hostRef, onDraftChange, onAnnotsChange, colorH, colorU, colorS])

	return null // Questo componente non renderizza nulla, gestisce solo la logica
}
