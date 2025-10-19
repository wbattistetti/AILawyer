import { useState, useRef } from 'react'

export interface UsePdfSearchPanelProps {
	// Props necessarie per il search panel
}

export interface UsePdfSearchPanelReturn {
	// Search panel state
	panelW: number
	setPanelW: (width: number | ((prev: number) => number)) => void
	searchQ: string
	setSearchQ: (query: string) => void
	showAdvanced: boolean
	setShowAdvanced: (show: boolean) => void
	resizingRef: React.MutableRefObject<boolean>
}

export function usePdfSearchPanel(props: UsePdfSearchPanelProps = {}): UsePdfSearchPanelReturn {
	// Search panel state
	const [panelW, setPanelW] = useState<number>(320)
	const [searchQ, setSearchQ] = useState<string>('')
	const resizingRef = useRef<boolean>(false)
	const [showAdvanced, setShowAdvanced] = useState<boolean>(false)

	return {
		panelW,
		setPanelW,
		searchQ,
		setSearchQ,
		showAdvanced,
		setShowAdvanced,
		resizingRef
	}
}
