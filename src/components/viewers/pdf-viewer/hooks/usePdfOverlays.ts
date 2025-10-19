import { useEffect, useRef, useState } from 'react'

export interface UsePdfOverlaysProps {
	hostRef: React.RefObject<HTMLElement>
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
}

export interface UsePdfOverlaysReturn {
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	selectRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	pageElsRef: React.MutableRefObject<Map<number, HTMLElement>>
	elToPageRef: React.MutableRefObject<Map<HTMLElement, number>>
	selectTick: number
	setSelectTick: (tick: number | ((prev: number) => number)) => void
}

export function usePdfOverlays({ hostRef, selectMode, selectKind }: UsePdfOverlaysProps): UsePdfOverlaysReturn {
	const overlayRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const selectRootsRef = useRef<Map<number, HTMLElement>>(new Map())
	const pageElsRef = useRef<Map<number, HTMLElement>>(new Map())
	const elToPageRef = useRef<Map<HTMLElement, number>>(new Map())
	const [selectTick, setSelectTick] = useState<number>(0)

	// Track page layers and ensure overlay/select roots
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const ensureRoots = () => {
            let added = 0
				// Primary: holders with data-page-number
				let holders = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
				// Fallback: if none, infer pages from page-layer order
				if (holders.length === 0) {
					const layers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
					holders = layers.map((layer, idx) => {
						// Try extract absolute page number from nearest attributes
						let pageNum = 0
						const hA = layer.closest('[data-page-number]') as HTMLElement | null
						if (hA) {
							const parsed = parseInt(hA.getAttribute('data-page-number') || '', 10)
							if (Number.isFinite(parsed) && parsed > 0) pageNum = parsed
						}
						if (!pageNum) {
							let p: HTMLElement | null = layer
							for (let i = 0; i < 5 && p; i++) {
								const aria = p.getAttribute('aria-label') || ''
								const m = aria.match(/\bP(?:age|agina)\s+(\d+)/i)
								if (m) { pageNum = parseInt(m[1], 10); break }
								p = p.parentElement as HTMLElement | null
							}
						}
						const fake = document.createElement('div')
						fake.setAttribute('data-page-number', String(pageNum || (idx + 1)))
						Object.defineProperty(fake, 'querySelector', { value: (sel: string) => (sel === '.rpv-core__page-layer' ? layer : null) })
						return fake as any
					})
				}
            for (const holder of holders) {
                const parsed = parseInt(holder.getAttribute('data-page-number') || '', 10)
                if (!Number.isFinite(parsed) || parsed <= 0) continue
                const pageNum = parsed
					const pageLayer = (holder as any).querySelector('.rpv-core__page-layer') as HTMLElement | null
                if (!pageLayer) continue
                pageElsRef.current.set(pageNum, pageLayer)
                elToPageRef.current.set(pageLayer, pageNum)
                const textLayer = (pageLayer.querySelector('.rpv-core__text-layer') as HTMLElement) || pageLayer
                if (!textLayer.style.position) textLayer.style.position = 'relative'
                let over = overlayRootsRef.current.get(pageNum)
                if (!over) {
                    over = document.createElement('div')
                    over.className = 'ai-overlay-root'
                    Object.assign(over.style, { position:'absolute', inset:'0', pointerEvents:'none', zIndex:'100' })
                    textLayer.appendChild(over)
                    overlayRootsRef.current.set(pageNum, over)
                    console.log('[OVERLAY-ROOT][CREATE]', { pageNum, hasOver: !!over })
                    added++
                }
                let sel = selectRootsRef.current.get(pageNum)
                if (!sel) {
                    sel = document.createElement('div')
                    sel.className = 'ai-select-root'
                    if (!pageLayer.style.position) pageLayer.style.position = 'relative'
                    pageLayer.appendChild(sel)
                    selectRootsRef.current.set(pageNum, sel)
                    added++
                }
					Object.assign(sel.style, {
						position:'absolute', inset:'0', zIndex:'2000', userSelect:'none',
					cursor: (selectMode && selectKind==='OCR') ? 'crosshair' : '',
					pointerEvents: (selectMode && selectKind==='OCR') ? 'auto' : 'none',
					touchAction: (selectMode && selectKind==='OCR') ? ('none' as any) : ''
                } as any)
            }
            if (added > 0) setSelectTick(t => t + 1)
        }
            ensureRoots()
				const mo = new MutationObserver(() => ensureRoots())
                mo.observe(host, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class'] })
                // Aggiorna i roots anche su scroll/zoom e su resize
                const onAny = () => ensureRoots()
                // attach to inner scroll containers if present
                const scs = [
                  host.querySelector('.rpv-core__inner') as HTMLElement | null,
                  host.querySelector('.rpv-core__pages') as HTMLElement | null,
                  host.querySelector('.rpv-core__viewer') as HTMLElement | null,
                ].filter(Boolean) as HTMLElement[]
                scs.forEach(sc => sc.addEventListener('scroll', onAny, { capture: true, passive: true } as any))
                window.addEventListener('resize', onAny)
                return () => { mo.disconnect(); scs.forEach(sc => sc.removeEventListener('scroll', onAny, { capture: true } as any)); window.removeEventListener('resize', onAny) }
	}, [selectMode, selectKind, hostRef])

	return {
		overlayRootsRef,
		selectRootsRef,
		pageElsRef,
		elToPageRef,
		selectTick,
		setSelectTick
	}
}
