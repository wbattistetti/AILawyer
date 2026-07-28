export type VLine = { x: number; x1: number; y: number; y1: number; text: string }

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

export type MatchItem = {
	id: string
	page: number
	snippet: string
	x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number
	rects: Array<{ x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number }>
	spanIdx?: number
	charIdx?: number
	qLen?: number
}

export type Area = { id: string; pageIndex: number; left: number; top: number; width: number; height: number }

export interface VerifyPdfViewerProps {
	fileUrl: string
	page: number
	lines: VLine[] | null
	onPageChange?: (page: number) => void
	hideToolbar?: boolean
	docId?: string
}

export interface ContextMenuState {
	x: number
	y: number
	visible: boolean
}

export interface ExtractState {
	open: boolean
	type: string
	title: string
	notes: string
	showNotes: boolean
	page: number
	position: { x: number; y: number }
}

export interface OcrInspectState {
	open: boolean
	page: number
	text: string
	drag: { x: number; y: number; dx: number; dy: number; dragging: boolean }
}

export interface SearchState {
	query: string
	matches: MatchItem[]
	showAdvanced: boolean
	panelWidth: number
}

export interface AnnotationState {
	annotations: Annotation[]
	draft: Annotation | null
	selected: Annotation | null
}

export interface SelectionState {
	mode: boolean
	kind: 'NATIVE' | 'OCR'
	tick: number
	lastSelection: any | null
}

export interface PdfViewerState {
	totalPages: number
	currentPage: string
	zoomPercent: number
	audit: boolean
	autoDeskew: boolean
	skewAngles: Record<number, number>
}

export interface DrawerOption {
	id: string
	label: string
}

export interface PersistentSelection {
	id: string
	page: number
	x0Pct: number
	y0Pct: number
	x1Pct: number
	y1Pct: number
	text: string
	viewportBox: { x: number; y: number; w: number; h: number }
	source?: string // nome documento
	imageDataUrl?: string // ✅ Screenshot già catturato (per Word/OCR)
	/** True after async extract (text/screenshot) finished — even if empty. */
	contentReady?: boolean
}