import { useEffect, useRef } from 'react'

export interface UsePdfPanelResizerProps {
	resizingRef: React.MutableRefObject<boolean>
	setPanelW: (width: number | ((prev: number) => number)) => void
}

export interface UsePdfPanelResizerReturn {
	// Questo hook non restituisce nulla, gestisce solo gli eventi del resizer
}

export function usePdfPanelResizer({ resizingRef, setPanelW }: UsePdfPanelResizerProps): UsePdfPanelResizerReturn {
	// Resizer events
	useEffect(() => {
		const onMove = (e: MouseEvent) => { 
			if (!resizingRef.current) return
			setPanelW(w => Math.max(220, Math.min(560, w - e.movementX))) 
		}
		const onUp = () => { 
			resizingRef.current = false
			document.body.style.cursor = '' 
		}
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
		return () => { 
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp) 
		}
	}, [resizingRef, setPanelW])

	return {}
}
