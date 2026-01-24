import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Annotation } from '../hooks/usePdfAnnotations'
import type { PersistentSelection } from '../types'
import { ExtractBlockOverlay } from './ExtractBlockOverlay'

interface AnnotationOverlaysProps {
	selectedAnnot: Annotation | null
	annots: Annotation[]
	draft: Annotation | Annotation[] | null  // ✅ Support array for multi-page
	persistentSelections: PersistentSelection[]
	setPersistentSelections: (selections: PersistentSelection[] | ((prev: PersistentSelection[]) => PersistentSelection[])) => void
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	lastSelection: any
	docName?: string
	hasNativeText?: boolean
	ensureOverlayRootForPage?: (pageNum: number) => boolean
}

export const AnnotationOverlays: React.FC<AnnotationOverlaysProps> = ({
	selectedAnnot,
	annots,
	draft,
	persistentSelections,
	setPersistentSelections,
	overlayRootsRef,
	pageElsRef,
	lastSelection,
	docName,
	hasNativeText,
	ensureOverlayRootForPage
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
			{allAnnotations.map((a, idx) => {
				let root = overlayRootsRef.current.get(a.page)

				// ✅ Se il root non esiste o non è nel DOM, prova a ricrearlo
				if (!root || !document.contains(root)) {
					if (a.id === 'draft' || a.id === 'sel') {
						// ✅ Prova a ricreare il root se la funzione è disponibile
						if (ensureOverlayRootForPage) {
							const recreated = ensureOverlayRootForPage(a.page)
							if (recreated) {
								root = overlayRootsRef.current.get(a.page)
								if (root && document.contains(root)) {
									// ✅ Root ricreato con successo, continua il rendering
								} else {
									// ✅ Root non ancora disponibile, salta questo render
									return null
								}
							} else {
								// ✅ Impossibile ricreare il root, salta questo render
								return null
							}
						} else {
							// ✅ Funzione non disponibile, log e salta
							const pageEl = pageElsRef.current.get(a.page)
							let textLayerExists = false
							let textLayerInDOM = false

							if (pageEl) {
								const textLayer = pageEl.querySelector('.rpv-core__text-layer') as HTMLElement | null
								if (!textLayer) {
									const pageContainer = pageEl.closest('[data-page-number]') as HTMLElement | null
									if (pageContainer) {
										const textLayer2 = pageContainer.querySelector('.rpv-core__text-layer') as HTMLElement | null
										textLayerExists = !!textLayer2
										textLayerInDOM = textLayer2 ? document.contains(textLayer2) : false
									}
								} else {
									textLayerExists = true
									textLayerInDOM = document.contains(textLayer)
								}
							}

							console.warn('[ANNOT-OVERLAYS] ⚠️ Root overlay NON TROVATO per pagina:', a.page, {
								allRoots: Array.from(overlayRootsRef.current.keys()),
								annotId: a.id,
								annotPage: a.page,
								pageElExists: !!pageEl,
								textLayerExists,
								textLayerInDOM,
								ensureOverlayRootForPageAvailable: !!ensureOverlayRootForPage
							})
							return null
						}
					} else {
						return null
					}
				}

				// ✅ Verifica finale che il root sia ancora nel DOM (dopo eventuale ricreazione)
				if (!root || !document.contains(root)) {
					return null
				}


				const left = `${a.x0Pct * 100}%`
				const top = `${a.y0Pct * 100}%`
				const width = `${(a.x1Pct - a.x0Pct) * 100}%`
				const height = `${Math.max(0.01, (a.y1Pct - a.y0Pct)) * 100}%`

				let node: React.ReactNode = null
				if (a.type === 'highlight') {
					node = (
						<div
							style={{
								position: 'absolute',
								left,
								top,
								width,
								height,
								pointerEvents: 'none',
								background: a.color ?? (a.id === 'draft' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)'), // ✅ Opacità aumentata per draft (0.4 invece di 0.3)
								border: a.id === 'draft' ? '2px solid rgba(59, 130, 246, 1)' : 'none', // ✅ Bordo più visibile per draft (1 invece di 0.8)
								borderRadius: 2,
								zIndex: a.id === 'draft' ? 9999 : 10, // ✅ Z-index molto alto per draft
								boxSizing: 'border-box' // ✅ Include il bordo nelle dimensioni
							}}
						/>
					)

				}
				if (a.type === 'underline') node = <div style={{ position: 'absolute', left, top, width, height: 2, background: a.color, pointerEvents: 'none' }} />
				if (a.type === 'strike') node = <div style={{ position: 'absolute', left, top, width, height: 2, background: a.color, pointerEvents: 'none' }} />
				if (a.type === 'comment') node = <div style={{ position: 'absolute', left, top, width: 12, height: 12, background: '#f59e0b', borderRadius: 2, pointerEvents: 'none' }} title={a.text} />

				// ✅ Renderizza il portal
				if (!node || !root) return null

				return <React.Fragment key={`${a.id}-${a.page}-${idx}`}>{createPortal(node, root)}</React.Fragment>
			})}

			{/* Render persistent selections with interactivity */}
			{persistentSelections.map((selection, index) => {
				const root = overlayRootsRef.current.get(selection.page)
				if (!root) return null

				// ✅ Nascondi l'ultima selezione se c'è un overlay (ExtractBlockOverlay)
				// L'overlay sostituisce visivamente il rettangolo blu
				const isLastSelection = index === persistentSelections.length - 1
				if (isLastSelection) {
					return null // ✅ Non renderizzare il rettangolo blu per l'ultima selezione
				}

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
					border: isHovered || isDragging ? '2px solid rgba(59,130,246,0.8)' : 'none',
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
							// ✅ Se si clicca sul rettangolo senza aprire il menu, rimuovilo
							setPersistentSelections(prev => prev.filter(s => s.id !== selection.id))
						}}
						title={isHovered || isDragging ? 'Estratto' : undefined}
					/>
				)

				return <React.Fragment key={selection.id}>{createPortal(node, root)}</React.Fragment>
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

			{/* ExtractBlock overlay for the last persistent selection */}
			{persistentSelections.length > 0 && (
				<ExtractBlockOverlay
					selection={persistentSelections[persistentSelections.length - 1]}
					pageElsRef={pageElsRef}
					overlayRootsRef={overlayRootsRef}
					lastSelection={lastSelection}
					onClose={() => {
						setPersistentSelections(prev => prev.slice(0, -1))
					}}
					setPersistentSelections={setPersistentSelections}
					docName={docName}
					hasNativeText={hasNativeText}
					onExtractAdd={(extract) => {
						// ✅ Dispatch evento per aggiungere al cassetto
						window.dispatchEvent(new CustomEvent('app:extract-add', { detail: { extract } }))
					}}
				/>
			)}
		</>
	)
}
