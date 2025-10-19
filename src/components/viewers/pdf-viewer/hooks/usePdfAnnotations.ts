import { useState, useRef, useCallback } from 'react'
import { Annotation, Tool } from '../types'

interface UsePdfAnnotationsProps {
	colorH: string
	colorU: string
	colorS: string
}

interface UsePdfAnnotationsReturn {
	annots: Annotation[]
	setAnnots: (annots: Annotation[]) => void
	draft: Annotation | null
	setDraft: (draft: Annotation | null) => void
	tool: Tool
	setTool: (tool: Tool) => void
	drawingRef: React.MutableRefObject<{ page: number; startX: number; startY: number; x: number; y: number } | null>
}

export const usePdfAnnotations = ({ colorH, colorU, colorS }: UsePdfAnnotationsProps): UsePdfAnnotationsReturn => {
	const [annots, setAnnots] = useState<Annotation[]>([])
	const [draft, setDraft] = useState<Annotation | null>(null)
	const [tool, setTool] = useState<Tool>('none')
	const drawingRef = useRef<{ page: number; startX: number; startY: number; x: number; y: number } | null>(null)

	return {
		annots,
		setAnnots,
		draft,
		setDraft,
		tool,
		setTool,
		drawingRef
	}
}
