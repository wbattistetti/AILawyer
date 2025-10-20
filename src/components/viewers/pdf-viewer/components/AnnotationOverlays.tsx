import React from 'react'
import { createPortal } from 'react-dom'
import type { Annotation } from '../hooks/usePdfAnnotations'

interface AnnotationOverlaysProps {
	selectedAnnot: Annotation | null
	annots: Annotation[]
	draft: Annotation | Annotation[] | null  // ✅ Support array for multi-page
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
}

export const AnnotationOverlays: React.FC<AnnotationOverlaysProps> = ({
	selectedAnnot,
	annots,
	draft,
	overlayRootsRef
}) => {
	// ✅ Convert draft to array (single or multi-page)
	const draftArray = Array.isArray(draft) ? draft : (draft ? [draft] : [])
	
	// ✅ Combine all annotations including multi-page drafts
	const allAnnotations = [
		...(selectedAnnot ? [selectedAnnot] : []), 
		...annots, 
		...draftArray
	]

	return (
		<>
			{allAnnotations.map(a => {
				const root = overlayRootsRef.current.get(a.page)
				if (a.id === 'draft') {
					console.log('[OVERLAY][RENDER][DRAFT]', { 
						page: a.page, 
						type: a.type,
						color: a.color,
						box: { x0: a.x0Pct, y0: a.y0Pct, x1: a.x1Pct, y1: a.y1Pct },
						hasRoot: !!root,
						allRoots: Array.from(overlayRootsRef.current.keys())
					})
				}
				if (!root) return null
				const left = `${a.x0Pct * 100}%`
				const top = `${a.y0Pct * 100}%`
				const width = `${(a.x1Pct - a.x0Pct) * 100}%`
				const height = `${Math.max(0.01, (a.y1Pct - a.y0Pct)) * 100}%`
				const style: React.CSSProperties = { position:'absolute', left, top, width, height, pointerEvents:'none' }
				let node: React.ReactNode = null
				if (a.type==='highlight') node = <div style={{ ...style, background:a.color, borderRadius:2 }} />
				if (a.type==='underline') node = <div style={{ ...style, height:2, background:a.color }} />
				if (a.type==='strike') node = <div style={{ ...style, height:2, background:a.color }} />
				if (a.type==='comment') node = <div style={{ ...style, width:12, height:12, background:'#f59e0b', borderRadius:2 }} title={a.text} />
				return createPortal(node, root)
			})}
		</>
	)
}
