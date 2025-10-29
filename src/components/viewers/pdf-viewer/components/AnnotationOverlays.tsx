import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Annotation } from '../hooks/usePdfAnnotations'
import type { PersistentSelection } from '../types'

interface AnnotationOverlaysProps {
	selectedAnnot: Annotation | null
	annots: Annotation[]
	draft: Annotation | Annotation[] | null  // ✅ Support array for multi-page
	persistentSelections: PersistentSelection[]
	setPersistentSelections: (selections: PersistentSelection[]) => void
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
}

export const AnnotationOverlays: React.FC<AnnotationOverlaysProps> = ({
	selectedAnnot,
	annots,
	draft,
	persistentSelections,
	setPersistentSelections,
	overlayRootsRef
}) => {
	const [hoveredSelectionId, setHoveredSelectionId] = useState<string | null>(null)
	const [draggingSelectionId, setDraggingSelectionId] = useState<string | null>(null)
	const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
	const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

	// Track mouse position during drag
	useEffect(() => {
		if (!draggingSelectionId) {
			setDragPos(null)
			return
		}

		const handleMouseMove = (e: MouseEvent) => {
			setDragPos({ x: e.clientX + 10, y: e.clientY - 10 })
		}

		document.addEventListener('mousemove', handleMouseMove)
		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
		}
	}, [draggingSelectionId])

	// ✅ Convert draft to array (single or multi-page)
	const draftArray = Array.isArray(draft) ? draft : (draft ? [draft] : [])

	// ✅ Combine all annotations including multi-page drafts
	const allAnnotations = [
		...(selectedAnnot ? [selectedAnnot] : []),
		...annots,
		...draftArray
	]

	// Handle drag start for persistent selections
	const handlePersistentSelectionDragStart = (e: React.DragEvent, selection: PersistentSelection) => {
		setDraggingSelectionId(selection.id)
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('application/json', JSON.stringify({
			type: 'extract',
			content: selection.text,
			source: selection.source || 'Documento',
			page: selection.page,
			bbox: {
				x0Pct: selection.x0Pct,
				y0Pct: selection.y0Pct,
				x1Pct: selection.x1Pct,
				y1Pct: selection.y1Pct
			}
		}))
	}

	const handlePersistentSelectionDragEnd = () => {
		setDraggingSelectionId(null)
	}

	return (
		<>
			{allAnnotations.map(a => {
				const root = overlayRootsRef.current.get(a.page)
				if (a.id === 'draft') {
				}
				if (!root) return null
				const left = `${a.x0Pct * 100}%`
				const top = `${a.y0Pct * 100}%`
				const width = `${(a.x1Pct - a.x0Pct) * 100}%`
				const height = `${Math.max(0.01, (a.y1Pct - a.y0Pct)) * 100}%`
				const style: React.CSSProperties = { position: 'absolute', left, top, width, height, pointerEvents: 'none' }
				let node: React.ReactNode = null
				if (a.type === 'highlight') node = <div style={{ ...style, background: a.color, borderRadius: 2 }} />
				if (a.type === 'underline') node = <div style={{ ...style, height: 2, background: a.color }} />
				if (a.type === 'strike') node = <div style={{ ...style, height: 2, background: a.color }} />
				if (a.type === 'comment') node = <div style={{ ...style, width: 12, height: 12, background: '#f59e0b', borderRadius: 2 }} title={a.text} />
				return createPortal(node, root)
			})}

			{/* Render persistent selections with interactivity */}
			{persistentSelections.map(selection => {
				const root = overlayRootsRef.current.get(selection.page)
				if (!root) return null

				const left = `${selection.x0Pct * 100}%`
				const top = `${selection.y0Pct * 100}%`
				const width = `${(selection.x1Pct - selection.x0Pct) * 100}%`
				const height = `${Math.max(0.01, (selection.y1Pct - selection.y0Pct)) * 100}%`

				const isHovered = hoveredSelectionId === selection.id
				const isDragging = draggingSelectionId === selection.id

				const style: React.CSSProperties = {
					position: 'absolute',
					left,
					top,
					width,
					height,
					background: 'rgba(59,130,246,0.3)',
					border: isHovered || isDragging ? '2px solid rgba(59,130,246,0.8)' : '2px solid rgba(59,130,246,0.5)',
					borderRadius: 2,
					cursor: isDragging ? 'grabbing' : 'grab',
					pointerEvents: 'auto',
					transition: isDragging ? 'none' : 'border-color 0.2s'
				}

				const node = (
					<div
						style={style}
						draggable
						onDragStart={(e) => handlePersistentSelectionDragStart(e, selection)}
						onDragEnd={handlePersistentSelectionDragEnd}
						onMouseEnter={() => setHoveredSelectionId(selection.id)}
						onMouseLeave={() => {
							setHoveredSelectionId(null)
							setCursorPos(null)
						}}
						onMouseMove={(e) => {
							if (hoveredSelectionId === selection.id) {
								setCursorPos({ x: e.clientX + 10, y: e.clientY - 10 })
							}
						}}
						onClick={(e) => {
							e.stopPropagation()
							// Click handler per aprire menu contestuale
						}}
						title={isHovered || isDragging ? 'Estratto' : undefined}
					/>
				)

				return createPortal(node, root)
			})}

			{/* Custom cursor label when hovering over persistent selection */}
			{hoveredSelectionId && cursorPos && !draggingSelectionId && (
				<div
					style={{
						position: 'fixed',
						left: cursorPos.x,
						top: cursorPos.y,
						pointerEvents: 'none',
						zIndex: 10000,
						background: 'rgba(0,0,0,0.8)',
						color: 'white',
						padding: '4px 8px',
						borderRadius: 4,
						fontSize: '12px',
						fontWeight: 'bold',
						whiteSpace: 'nowrap'
					}}
				>
					Estratto
				</div>
			)}

			{/* Custom cursor label during drag */}
			{draggingSelectionId && dragPos && (
				<div
					style={{
						position: 'fixed',
						left: dragPos.x,
						top: dragPos.y,
						pointerEvents: 'none',
						zIndex: 10000,
						background: 'rgba(59,130,246,0.9)',
						color: 'white',
						padding: '6px 10px',
						borderRadius: 4,
						fontSize: '12px',
						fontWeight: 'bold',
						whiteSpace: 'nowrap',
						display: 'flex',
						alignItems: 'center',
						gap: '6px',
						boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
					}}
				>
					<span>↔</span>
					<span>Estratto</span>
				</div>
			)}
		</>
	)
}
