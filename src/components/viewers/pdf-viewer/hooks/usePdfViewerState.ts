import { useState, useRef } from 'react'

interface UsePdfViewerStateReturn {
	totalPages: number
	setTotalPages: (pages: number) => void
	pageInput: string
	setPageInput: (page: string) => void
	zoomPct: number
	setZoomPct: (zoom: number) => void
	audit: boolean
	setAudit: (audit: boolean) => void
	autoDeskew: boolean
	setAutoDeskew: (deskew: boolean) => void
	skewAngles: Record<number, number>
	setSkewAngles: (angles: Record<number, number>) => void
	selectMode: boolean
	setSelectMode: (mode: boolean) => void
	selectKind: 'NATIVE' | 'OCR'
	setSelectKind: (kind: 'NATIVE' | 'OCR') => void
	panelW: number
	setPanelW: (width: number) => void
	showAdvanced: boolean
	setShowAdvanced: (show: boolean) => void
	contextMenu: { x: number; y: number; visible: boolean }
	setContextMenu: (menu: { x: number; y: number; visible: boolean }) => void
	extractOpen: boolean
	setExtractOpen: (open: boolean) => void
	extractTitle: string
	setExtractTitle: (title: string) => void
	extractType: string
	setExtractType: (type: string) => void
	extractNotes: string
	setExtractNotes: (notes: string) => void
	showNotes: boolean
	setShowNotes: (show: boolean) => void
	extractPage: number
	setExtractPage: (page: number) => void
	extractPos: { x: number; y: number }
	setExtractPos: (pos: { x: number; y: number }) => void
	lastSelection: any
	setLastSelection: (selection: any) => void
	ocrInspectOpen: boolean
	setOcrInspectOpen: (open: boolean) => void
	ocrInspect: { page: number; text: string } | null
	setOcrInspect: (inspect: { page: number; text: string } | null) => void
	ocrDrag: { x: number; y: number; dx: number; dy: number; dragging: boolean }
	setOcrDrag: (drag: { x: number; y: number; dx: number; dy: number; dragging: boolean }) => void
	selectedAnnot: Annotation | null
	setSelectedAnnot: (annot: Annotation | null) => void
	selectTick: number
	setSelectTick: (tick: number) => void
	searchQ: string
	setSearchQ: (q: string) => void
	matches: MatchItem[]
	setMatches: (matches: MatchItem[]) => void
	_selBox: { x: number; y: number; w: number; h: number } | null
	setSelBox: (box: { x: number; y: number; w: number; h: number } | null) => void
	scaleRef: React.MutableRefObject<number>
	zoomDebounceRef: React.MutableRefObject<number | null>
	// pdfDocRef ora gestito dal hook usePdfDocument
	// pageElsRef ora gestito dal hook usePdfOverlays
	// overlayRootsRef, selectRootsRef, elToPageRef ora gestiti dal hook usePdfOverlays
	mouseDownPageRef: React.MutableRefObject<number | null>
	mouseDownPosRef: React.MutableRefObject<{ xPct: number; yPct: number } | null>
	openedAtRef: React.MutableRefObject<number>
	selectionHandledRef: React.MutableRefObject<boolean>
	isSelectingRef: React.MutableRefObject<boolean>
	lastNativeRangeRef: React.MutableRefObject<Range | null>
	lastDraftBoxRef: React.MutableRefObject<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } | null>
	suppressClearRef: React.MutableRefObject<boolean>
	resizingRef: React.MutableRefObject<boolean>
}

export const usePdfViewerState = (): UsePdfViewerStateReturn => {
	const [totalPages, setTotalPages] = useState<number>(0)
	const [pageInput, setPageInput] = useState<string>('1')
	const [zoomPct, setZoomPct] = useState<number>(100)
	const [audit, setAudit] = useState<boolean>(false)
	const [autoDeskew, setAutoDeskew] = useState<boolean>(false)
	const [skewAngles, setSkewAngles] = useState<Record<number, number>>({})
	const [selectMode, setSelectMode] = useState<boolean>(true)
	const [selectKind, setSelectKind] = useState<'NATIVE' | 'OCR'>('NATIVE')
	const [panelW, setPanelW] = useState<number>(320)
	const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false })
	const [extractOpen, setExtractOpen] = useState<boolean>(false)
	const [extractTitle, setExtractTitle] = useState<string>('')
	const [extractType, setExtractType] = useState<string>('verbale')
	const [extractNotes, setExtractNotes] = useState<string>('')
	const [showNotes, setShowNotes] = useState<boolean>(false)
	const [extractPage, setExtractPage] = useState<number>(1)
	const [extractPos, setExtractPos] = useState<{ x: number; y: number }>({ x: 100, y: 100 })
	const [lastSelection, setLastSelection] = useState<any | null>(null)
	const [ocrInspectOpen, setOcrInspectOpen] = useState<boolean>(false)
	const [ocrInspect, setOcrInspect] = useState<{ page: number; text: string } | null>(null)
	const [ocrDrag, setOcrDrag] = useState<{ x: number; y: number; dx: number; dy: number; dragging: boolean }>({ x: 24, y: 24, dx: 0, dy: 0, dragging: false })
	const [selectedAnnot, setSelectedAnnot] = useState<Annotation | null>(null)
	const [selectTick, setSelectTick] = useState<number>(0)
	const [_selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
	const [searchQ, setSearchQ] = useState<string>('')
	const [matches, setMatches] = useState<MatchItem[]>([])

	// Refs
	const scaleRef = useRef<number>(1)
	const zoomDebounceRef = useRef<number | null>(null)
	// pdfDocRef ora gestito dal hook usePdfDocument
	// pageElsRef ora gestito dal hook usePdfOverlays
	// overlayRootsRef, selectRootsRef, elToPageRef ora gestiti dal hook usePdfOverlays
	const mouseDownPageRef = useRef<number | null>(null)
	const mouseDownPosRef = useRef<{ xPct: number; yPct: number } | null>(null)
	const openedAtRef = useRef<number>(0)
	const selectionHandledRef = useRef<boolean>(false)
	const isSelectingRef = useRef<boolean>(false)
	const lastNativeRangeRef = useRef<Range | null>(null)
	const lastDraftBoxRef = useRef<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } | null>(null)
	const suppressClearRef = useRef<boolean>(false)
	const resizingRef = useRef<boolean>(false)

	return {
		totalPages,
		setTotalPages,
		pageInput,
		setPageInput,
		zoomPct,
		setZoomPct,
		audit,
		setAudit,
		autoDeskew,
		setAutoDeskew,
		skewAngles,
		setSkewAngles,
		selectMode,
		setSelectMode,
		selectKind,
		setSelectKind,
		panelW,
		setPanelW,
		showAdvanced,
		setShowAdvanced,
		contextMenu,
		setContextMenu,
		extractOpen,
		setExtractOpen,
		extractTitle,
		setExtractTitle,
		extractType,
		setExtractType,
		extractNotes,
		setExtractNotes,
		showNotes,
		setShowNotes,
		extractPage,
		setExtractPage,
		extractPos,
		setExtractPos,
		lastSelection,
		setLastSelection,
		ocrInspectOpen,
		setOcrInspectOpen,
		ocrInspect,
		setOcrInspect,
		ocrDrag,
		setOcrDrag,
		selectedAnnot,
		setSelectedAnnot,
		selectTick,
		setSelectTick,
		_selBox,
		setSelBox,
		scaleRef,
		zoomDebounceRef,
		// pdfDocRef ora gestito dal hook usePdfDocument
		// pageElsRef ora gestito dal hook usePdfOverlays
		// overlayRootsRef, selectRootsRef, elToPageRef ora gestiti dal hook usePdfOverlays
		mouseDownPageRef,
		mouseDownPosRef,
		openedAtRef,
		selectionHandledRef,
		isSelectingRef,
		lastNativeRangeRef,
		lastDraftBoxRef,
		suppressClearRef,
		resizingRef,
		searchQ,
		setSearchQ,
		matches,
		setMatches
	}
}
