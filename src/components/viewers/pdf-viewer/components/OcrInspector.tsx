import React from 'react'

interface OcrInspectorProps {
	ocrInspectOpen: boolean
	contextMenuVisible: boolean
	ocrInspect: { page: number; text: string } | null
	ocrDrag: { x: number; y: number; dx: number; dy: number; dragging: boolean }
	onOcrDragChange: (drag: { x: number; y: number; dx: number; dy: number; dragging: boolean }) => void
	onOcrInspectOpenChange: (open: boolean) => void
}

export const OcrInspector: React.FC<OcrInspectorProps> = ({
	ocrInspectOpen,
	contextMenuVisible,
	ocrInspect,
	ocrDrag,
	onOcrDragChange,
	onOcrInspectOpenChange
}) => {
	if (!ocrInspectOpen || contextMenuVisible) return null

	return (
		<div
			className="fixed z-[99999] bg-white shadow-xl border rounded"
			style={{ left: ocrDrag.x, top: ocrDrag.y, width: 520, maxHeight: 420, overflow: 'auto' }}
		>
			<div
				className="cursor-move px-3 py-2 border-b bg-gray-50 select-none flex items-center justify-between"
				onMouseDown={(e) => {
					onOcrDragChange({ ...ocrDrag, dragging: true, dx: e.clientX - ocrDrag.x, dy: e.clientY - ocrDrag.y })
				}}
			>
				<div className="text-sm font-semibold">OCR pagina {ocrInspect?.page || ''}</div>
				<div className="flex items-center gap-2">
					<button
						className="text-xs px-2 py-1 border rounded"
						onClick={() => onOcrInspectOpenChange(false)}
					>
						Chiudi
					</button>
				</div>
			</div>
			<div className="p-3 text-xs whitespace-pre-wrap">
				{(ocrInspect?.text && ocrInspect.text.slice(0, 20000)) || '<vuoto>'}
			</div>
		</div>
	)
}
