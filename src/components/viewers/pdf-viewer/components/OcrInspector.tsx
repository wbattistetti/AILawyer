import React, { useEffect } from 'react'
import { useOcrInspector } from '../hooks/useOcrInspector'

interface OcrInspectorProps {
	docId?: string
	ocrInspectOpen: boolean
	onOcrInspectOpenChange: (open: boolean) => void
	hostRef: React.RefObject<HTMLDivElement>
	lastOcrMatchesRef: React.MutableRefObject<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>
}

export const OcrInspector: React.FC<OcrInspectorProps> = ({
	docId,
	ocrInspectOpen,
	onOcrInspectOpenChange,
	hostRef,
	lastOcrMatchesRef
}) => {
	const { ocrInspect, setOcrInspect, ocrDrag, setOcrDrag, loadOcrPageText, drawOcrRects, drawFixedDebugRect } = useOcrInspector(docId)

	// Esponi le funzioni per l'uso esterno
	React.useImperativeHandle(React.forwardRef(() => null), () => ({
		loadOcrPageText: (pageNum: number) => {
			loadOcrPageText(pageNum)
			onOcrInspectOpenChange(true)
		},
		drawOcrRects: (matches: Array<{ page:number; x0Pct:number; y0Pct:number; x1Pct:number; y1Pct:number }>, color?: string) => {
			drawOcrRects(matches, color, hostRef)
		},
		drawFixedDebugRect: (pageNum: number) => {
			drawFixedDebugRect(pageNum, hostRef)
		}
	}))

    useEffect(() => {
      const onResize = () => {
        if (!lastOcrMatchesRef.current?.length) return
        drawOcrRects(lastOcrMatchesRef.current, undefined, hostRef)
      }
      
      // Ridisegna quando l'utente scrolla (pagine diventano visibili)
      const onScroll = () => {
        if (!lastOcrMatchesRef.current?.length) return
        // Debounce per evitare troppi ridisegni
        clearTimeout((window as any).__ocrScrollTimeout)
        ;(window as any).__ocrScrollTimeout = setTimeout(() => {
          drawOcrRects(lastOcrMatchesRef.current!, undefined, hostRef)
        }, 100)
      }

      window.addEventListener('resize', onResize)
      window.addEventListener('scroll', onScroll, true)
      return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onScroll, true)
        clearTimeout((window as any).__ocrScrollTimeout)
      }
    }, [drawOcrRects, hostRef, lastOcrMatchesRef])

	useEffect(() => {
		const onClick = (ev: MouseEvent) => {
			if (!ocrInspectOpen) return
			const target = ev.target as HTMLElement
			if (target.closest('.ocr-inspector')) return
			console.log('[OCR][inspector][click]')
			onOcrInspectOpenChange(false)
		}
		document.addEventListener('click', onClick)
		return () => document.removeEventListener('click', onClick)
	}, [ocrInspectOpen, onOcrInspectOpenChange])

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!ocrDrag.dragging) return
			setOcrDrag(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }))
		}
		const onUp = () => setOcrDrag(prev => prev.dragging ? { ...prev, dragging: false } : prev)
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
		return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
	}, [ocrDrag.dragging])


	if (!ocrInspectOpen || !ocrInspect) return null

	return (
		<div 
			className="ocr-inspector fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 p-4 max-w-md max-h-96 overflow-auto"
			style={{ left: ocrDrag.x, top: ocrDrag.y }}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('drag-handle')) {
					setOcrDrag(prev => ({ ...prev, dragging: true }))
					e.preventDefault()
				}
			}}
		>
			<div className="drag-handle cursor-move bg-gray-100 p-2 mb-2 rounded text-sm font-medium text-gray-600">
				OCR Inspector - Pagina {ocrInspect.page}
			</div>
			<div className="text-sm text-gray-700 whitespace-pre-wrap">
				{ocrInspect.text}
			</div>
		</div>
	)
}