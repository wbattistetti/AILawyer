import { useState, useEffect, useRef } from 'react'
import { cryptoRandom } from '../../../../utils/misc'

export type Tool = 'none' | 'highlight' | 'underline' | 'strike' | 'comment'

export type Annotation = {
	id: string
	page: number
	type: 'highlight' | 'underline' | 'strike' | 'comment'
	color: string
	x0Pct: number
	y0Pct: number
	x1Pct: number
	y1Pct: number
	text?: string
}

export interface UsePdfAnnotationsProps {
	hostRef: React.MutableRefObject<HTMLDivElement | null>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
}

export const usePdfAnnotations = ({ hostRef, pageElsRef, elToPageRef }: UsePdfAnnotationsProps) => {
	const [tool, setTool] = useState<Tool>('none')
	const [annots, setAnnots] = useState<Annotation[]>([])
	const [draft, setDraft] = useState<Annotation | null>(null)
	const drawingRef = useRef<{ page:number; startX:number; startY:number; x:number; y:number }|null>(null)

	// Colors for different annotation types
	const colorH = '#ffeb3b80'
	const colorU = '#0ea5e9'
	const colorS = '#ef4444'

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
			
			const r = target.getBoundingClientRect()
			const x = (ev.clientX - r.left) / r.width
			const y = (ev.clientY - r.top) / r.height
			
			if (tool === 'comment') {
				const text = prompt('Commento:') || ''
				if (text) setAnnots(a => [...a, { id: cryptoRandom(), page: pageNum, type: 'comment', color: '#f59e0b', x0Pct: x, y0Pct: y, x1Pct: x, y1Pct: y, text }])
				return
			}
			
			drawingRef.current = { page: pageNum, startX: x, startY: y, x, y }
			setDraft(null)
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
			
			if (tool === 'highlight') setDraft({ id: 'draft', page: d.page, type: 'highlight', color: colorH, x0Pct: x0, y0Pct: y0, x1Pct: x1, y1Pct: y1 })
			if (tool === 'underline') setDraft({ id: 'draft', page: d.page, type: 'underline', color: colorU, x0Pct: x0, y0Pct: y1, x1Pct: x1, y1Pct: y1 })
			if (tool === 'strike') setDraft({ id: 'draft', page: d.page, type: 'strike', color: colorS, x0Pct: x0, y0Pct: (y0 + y1) / 2, x1Pct: x1, y1Pct: (y0 + y1) / 2 })
		}
		
		const onUp = () => {
			const d = drawingRef.current
			if (!d) return
			drawingRef.current = null
			if (draft) { setAnnots(a => [...a, { ...draft, id: cryptoRandom() }]); setDraft(null) }
		}
		
		host.addEventListener('pointerdown', onDown)
		document.addEventListener('pointermove', onMove)
		document.addEventListener('pointerup', onUp)
		
		return () => {
			host.removeEventListener('pointerdown', onDown)
			document.removeEventListener('pointermove', onMove)
			document.removeEventListener('pointerup', onUp)
		}
	}, [tool, draft])

	return {
		tool,
		setTool,
		annots,
		setAnnots,
		draft,
		setDraft
	}
}