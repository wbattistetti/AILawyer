import { useState, useEffect, useRef, useCallback } from 'react'

export interface UsePdfDeskewProps {
	docId?: string
	pdfDocRef: React.MutableRefObject<any>
	hostRef: React.MutableRefObject<HTMLDivElement | null>
}

export const usePdfDeskew = ({ docId, pdfDocRef, hostRef }: UsePdfDeskewProps) => {
	// Deskew toggle + angles (per-page) loaded da localStorage
	const [autoDeskew, setAutoDeskew] = useState<boolean>(false)
	const [skewAngles, setSkewAngles] = useState<Record<number, number>>({})
	const appliedSkewRef = useRef<Record<number, number>>({})

	// Load skew angles from localStorage
	useEffect(() => {
		try {
			const keyA = `ocr_skew_${docId || 'current'}`
			const keyB = `skew_angles_${docId || 'current'}`
			const raw = localStorage.getItem(keyA) || localStorage.getItem(keyB) || '{}'
			const parsed = JSON.parse(raw || '{}')
			if (parsed && typeof parsed === 'object') setSkewAngles(parsed)
		} catch { setSkewAngles({}) }
	}, [docId])

	const persistSkew = (next: Record<number, number>) => {
		try {
			const key = `ocr_skew_${docId || 'current'}`
			localStorage.setItem(key, JSON.stringify(next))
		} catch {}
	}

	const estimateSkewForPage = async (pageNum: number): Promise<number> => {
		try {
			const doc = pdfDocRef.current
			if (!doc) return 0
			const page = await doc.getPage(pageNum)
			const base = page.getViewport({ scale: 1 })
			const targetW = 800
			const scale = Math.max(0.2, Math.min(2.5, targetW / Math.max(1, base.width)))
			const vp = page.getViewport({ scale })
			const off = document.createElement('canvas')
			off.width = Math.ceil(vp.width)
			off.height = Math.ceil(vp.height)
			const offCtx = off.getContext('2d')!
			await page.render({ canvasContext: offCtx as any, viewport: vp } as any).promise
			const testAngles: number[] = []
			for (let a = -5; a <= 5; a += 0.5) testAngles.push(Number(a.toFixed(2)))
			let best = 0
			let bestScore = -Infinity
			const tmp = document.createElement('canvas')
			const tmpCtx = tmp.getContext('2d')!
			for (const ang of testAngles) {
				const rad = ang * Math.PI / 180
				const w = off.width, h = off.height
				const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
				const bw = Math.ceil(w * cos + h * sin)
				const bh = Math.ceil(w * sin + h * cos)
				tmp.width = bw; tmp.height = bh
				tmpCtx.save()
				tmpCtx.clearRect(0,0,bw,bh)
				tmpCtx.translate(bw/2, bh/2)
				tmpCtx.rotate(rad)
				tmpCtx.drawImage(off, -w/2, -h/2)
				tmpCtx.restore()
				const data = tmpCtx.getImageData(0,0,bw,bh).data
				// metric: row contrast derivative
				let prev = 0
				let score = 0
				for (let y = 0; y < bh; y += 2) {
					let row = 0
					for (let x = 0; x < bw; x += 2) {
						const idx = (y * bw + x) * 4
						// simple luma
						const r = data[idx], g = data[idx+1], b = data[idx+2]
						row += (r*0.2126 + g*0.7152 + b*0.0722)
					}
					if (y > 0) score += Math.abs(row - prev)
					prev = row
				}
				if (score > bestScore) { bestScore = score; best = ang }
			}
			return best
		} catch { return 0 }
	}

	// Apply deskew to all pages
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const apply = () => {
			// ✅ Usa data-virtual-index invece di data-page-number
			const pageLayers = Array.from(host.querySelectorAll('[data-virtual-index]')) as HTMLElement[]
			for (const pageLayer of pageLayers) {
				const virtualIdx = parseInt(pageLayer.getAttribute('data-virtual-index') || '0', 10)
				const pn = virtualIdx + 1 // Converti da zero-based a 1-based
				const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
				const canvasEl = pageLayer.querySelector('canvas') as HTMLCanvasElement | null
				const target = canvasLayer || canvasEl || pageLayer
				const angle = autoDeskew ? (skewAngles?.[pn] || 0) : 0
				if (angle && Math.abs(angle) >= 0.5) {
					target.style.transform = `rotate(${angle}deg)`
					target.style.transformOrigin = 'center center'
					;(target.style as any).willChange = 'transform'
					const parent = (target.parentElement || pageLayer) as HTMLElement
					try { parent.style.overflow = 'visible' } catch {}
					if (appliedSkewRef.current[pn] !== angle) {
						try { console.log('[DESKEW][apply]', { page: pn, angle }) } catch {}
						appliedSkewRef.current[pn] = angle
					}
				} else {
					target.style.removeProperty('transform')
					target.style.removeProperty('transform-origin')
					;(target.style as any).willChange = ''
					try { (pageLayer as HTMLElement).style.removeProperty('overflow') } catch {}
					if (appliedSkewRef.current[pn]) {
						try { console.log('[DESKEW][clear]', { page: pn }) } catch {}
						delete appliedSkewRef.current[pn]
					}
				}
			}
		}
		// expose for external triggers (e.g., onZoom)
		;(window as any).__deskewApply = apply
		// run once
		apply()
		// throttle re-applies to next frame to avoid layout thrash during zoom
		let queued = false
		const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; apply() }) }
		const mo = new MutationObserver(() => schedule())
		mo.observe(host, { subtree: true, childList: true, attributes: true })
		return () => mo.disconnect()
	}, [autoDeskew, skewAngles, docId])

	// Helper per applicare subito alla pagina corrente, chiamato al click
	const applyImmediateToPage = useCallback((pageNum: number, angle: number) => {
		const host = hostRef.current
		if (!host) return
		// ✅ Usa data-virtual-index (zero-based: page 1 = index 0)
		const zeroBasedIdx = pageNum - 1
		const pageLayer = (host.querySelector(`[data-virtual-index="${zeroBasedIdx}"]`) as HTMLElement) || null
		if (!pageLayer) { try { console.warn('[DESKEW][immediate] pageLayer not found', { pageNum, zeroBasedIdx }) } catch {}; return }
		const canvasLayer = pageLayer.querySelector('.rpv-core__canvas-layer') as HTMLElement | null
		const canvasEl = pageLayer.querySelector('canvas') as HTMLCanvasElement | null
		const target = canvasLayer || canvasEl || pageLayer
		if (angle && Math.abs(angle) >= 0.5) {
			target.style.transform = `rotate(${angle}deg)`
			target.style.transformOrigin = 'center center'
			;(target.style as any).willChange = 'transform'
			;(pageLayer.style as any).overflow = 'visible'
			try { console.log('[DESKEW][immediate][apply]', { page: pageNum, angle, target: target.className || target.tagName }) } catch {}
		} else {
			target.style.removeProperty('transform')
			target.style.removeProperty('transform-origin')
			;(target.style as any).willChange = ''
			try { pageLayer.style.removeProperty('overflow') } catch {}
			try { console.log('[DESKEW][immediate][clear]', { page: pageNum }) } catch {}
		}
	}, [])

	return {
		autoDeskew,
		setAutoDeskew,
		skewAngles,
		setSkewAngles,
		persistSkew,
		estimateSkewForPage,
		applyImmediateToPage
	}
}
