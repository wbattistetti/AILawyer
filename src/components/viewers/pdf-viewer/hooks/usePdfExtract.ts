import { useState, useRef } from 'react'
import type { Annotation } from './usePdfAnnotations'

export function usePdfExtract() {
	// Extract dialog state
	const [extractType, setExtractType] = useState<string>('verbale')
	const [extractNotes, setExtractNotes] = useState<string>('')
	const [showNotes, setShowNotes] = useState<boolean>(false)
	const [extractTitle, setExtractTitle] = useState<string>('')
	const [selectedAnnot, setSelectedAnnot] = useState<Annotation | null>(null)
	
	// Refs for extract functionality
	const openedAtRef = useRef<number>(0)
	const isSelectingRef = useRef<boolean>(false)
	const lastNativeRangeRef = useRef<Range | null>(null)
	const lastDraftBoxRef = useRef<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number } | null>(null)
	const suppressClearRef = useRef<boolean>(false)

	return {
		// Extract state
		extractType,
		setExtractType,
		extractNotes,
		setExtractNotes,
		showNotes,
		setShowNotes,
		extractTitle,
		setExtractTitle,
		selectedAnnot,
		setSelectedAnnot,
		
		// Extract refs
		openedAtRef,
		isSelectingRef,
		lastNativeRangeRef,
		lastDraftBoxRef,
		suppressClearRef
	}
}
