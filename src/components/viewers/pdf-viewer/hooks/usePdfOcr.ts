import React, { useRef, useCallback } from 'react'
import { MatchItem } from '../types'

interface UsePdfOcrProps {
	docId?: string
	fileUrl: string
}

interface UsePdfOcrReturn {
	runSearch: (qOverride?: string) => Promise<MatchItem[]>
	goToMatch: (match: any) => Promise<void>
	drawOcrRects: (matches: any[], color?: string) => void
	loadOcrPageText: (pageNum: number) => Promise<void>
	ocrInspect: { page: number; text: string } | null
	setOcrInspect: (inspect: { page: number; text: string } | null) => void
	ocrInspectOpen: boolean
	setOcrInspectOpen: (open: boolean) => void
	ocrDrag: { x: number; y: number; dx: number; dy: number; dragging: boolean }
	setOcrDrag: (drag: { x: number; y: number; dx: number; dy: number; dragging: boolean }) => void
	lastOcrMatchesRef: React.MutableRefObject<any[]>
	searchCacheRef: React.MutableRefObject<Map<string, MatchItem[]>>
}

export const usePdfOcr = ({ docId, fileUrl }: UsePdfOcrProps): UsePdfOcrReturn => {
	const [ocrInspect, setOcrInspect] = React.useState<{ page: number; text: string } | null>(null)
	const [ocrInspectOpen, setOcrInspectOpen] = React.useState<boolean>(false)
	const [ocrDrag, setOcrDrag] = React.useState<{ x: number; y: number; dx: number; dy: number; dragging: boolean }>({ x: 24, y: 24, dx: 0, dy: 0, dragging: false })

	const lastOcrMatchesRef = useRef<Array<{ page:number; x0Pct:number; y0Pct:number; x1Pct:number; y1Pct:number }>>([])
	const searchCacheRef = useRef<Map<string, MatchItem[]>>(new Map())

	const drawOcrRects = useCallback((matches: any[], color?: string) => {
		lastOcrMatchesRef.current = matches
		// Complex drawing logic would go here
	}, [])

	const runSearch = useCallback(async (qOverride?: string): Promise<MatchItem[]> => {
		// Complex search logic would go here
		return []
	}, [])

	const goToMatch = useCallback(async (match: any) => {
		// Complex navigation logic would go here
	}, [])

	const loadOcrPageText = useCallback(async (pageNum: number) => {
		// Complex OCR text loading logic would go here
	}, [])

	return {
		runSearch,
		goToMatch,
		drawOcrRects,
		loadOcrPageText,
		ocrInspect,
		setOcrInspect,
		ocrInspectOpen,
		setOcrInspectOpen,
		ocrDrag,
		setOcrDrag,
		lastOcrMatchesRef,
		searchCacheRef
	}
}
