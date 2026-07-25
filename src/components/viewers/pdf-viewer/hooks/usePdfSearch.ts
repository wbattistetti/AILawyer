import { useState, useRef, useCallback } from 'react'
import { logger } from '../../../../utils/logger'
import { cryptoRandom } from '../../../../utils/misc'

export interface MatchItem {
	id: string
	page: number
	snippet: string
	x0Pct: number
	x1Pct: number
	y0Pct: number
	y1Pct: number
	qLen: number
	charIdx: number
	rects: Array<{
		x0Pct: number
		x1Pct: number
		y0Pct: number
		y1Pct: number
	}>
}

export const usePdfSearch = (docId?: string, fileUrl?: string, pdfDocRef?: React.MutableRefObject<any>) => {
	const [matches, setMatches] = useState<MatchItem[]>([])
	const searchCacheRef = useRef<Map<string, MatchItem[]>>(new Map())

	const searchNativeCore = useCallback(async (doc: any, qRaw: string): Promise<MatchItem[]> => {
		try {
			if (!doc) return []
			const total = doc.numPages || 0
			const out: MatchItem[] = []
			logger.debug('SEARCH[native][start]', { q: qRaw, pages: total })
			for (let p = 1; p <= total; p++) {
				const page = await doc.getPage(p)
				const content = await page.getTextContent()
				const items = content.items as any[]
				let buffer = ''
				const boxes: { x: number; y: number; w: number; h: number }[] = []
				for (const it of items) {
					const s = (it.str || '') as string
					const tx = it.transform
					const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0
					const cw = ((it.width as number) || 0) / Math.max(1, s.length)
					for (let i = 0; i < s.length; i++) {
						const x = (tx[4] as number) + (cw * i)
						const y = (tx[5] as number) - h
						boxes.push({ x, y, w: cw, h })
					}
					buffer += s + ' '
				}
				const hay = buffer.toLowerCase()
				const needle = qRaw.toLowerCase()
				let pos = 0
				while (true) {
					const idx = hay.indexOf(needle, pos)
					if (idx < 0) break
					const start = idx, end = idx + needle.length
					let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
					for (let i = start; i < end && i < boxes.length; i++) {
						const c = boxes[i]
						l = Math.min(l, c.x); t = Math.min(t, c.y)
						r = Math.max(r, c.x + c.w); b = Math.max(b, c.y + c.h)
					}
					if (isFinite(l) && isFinite(t) && isFinite(r) && isFinite(b)) {
						const vp = page.getViewport({ scale: 1 })
						const x0Pct = (l / vp.width) * 100
						const x1Pct = (r / vp.width) * 100
						const yTop = vp.height - b
						const yBottom = vp.height - t
						const y0Pct = (yTop / vp.height) * 100
						const y1Pct = (yBottom / vp.height) * 100
						out.push({
							id: cryptoRandom(),
							page: p,
							snippet: buffer.slice(Math.max(0, start-40), Math.min(buffer.length, end+40)).trim(),
							x0Pct,
							x1Pct,
							y0Pct,
							y1Pct,
							qLen: qRaw.length,
							charIdx: start,
							rects: [{ x0Pct, x1Pct, y0Pct, y1Pct }]
						})
					}
					pos = end
				}
			}
			logger.debug('SEARCH[native][done]', { q: qRaw, totalMatches: out.length })
			return out
		} catch {
			return []
		}
	}, [])

	const searchMainThread = useCallback(async (qRaw: string): Promise<MatchItem[]> => {
		const doc = pdfDocRef?.current
		return searchNativeCore(doc, qRaw)
	}, [searchNativeCore, pdfDocRef])

	const runSearch = useCallback(async (qRaw: string, searchPluginInstance?: any, searchViaOcrBackend?: (docId: string, q: string) => Promise<MatchItem[]>): Promise<MatchItem[]> => {
		if (!qRaw.trim()) { 
			setMatches([])
			try { (searchPluginInstance as any).clearHighlights?.() } catch {}
			return [] 
		}
		
		// Verifica docId
		if (!docId) {
			console.error('[SEARCH][ERROR] docId is missing! Cannot search without document ID.')
			setMatches([])
			return []
		}
		
		const cacheKey = `${fileUrl}::${qRaw.toLowerCase()}::${docId}`
		
		// Cache check
		if (searchCacheRef.current.has(cacheKey)) {
			const cached = searchCacheRef.current.get(cacheKey) || []
			console.log('[SEARCH][cache][hit]', { q: qRaw, cached: cached.length })
			setMatches(cached)
			try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: qRaw }) } catch {}
			return cached
		}
		
		// NO FALLBACK: usa SOLO OCR backend con bbox word-level precisi
		console.log('[SEARCH][ocr][start]', { docId, q: qRaw })
		const found = searchViaOcrBackend ? await searchViaOcrBackend(docId, qRaw) : []
		console.log('[SEARCH][ocr][done]', { count: found.length })
		
		if (found.length === 0) {
			console.warn('[SEARCH][ocr][NO_RESULTS]', { docId, q: qRaw })
		}
		
		setMatches(found)
		searchCacheRef.current.set(cacheKey, found)
		
		try { (searchPluginInstance as any).clearHighlights?.(); (searchPluginInstance as any).highlight?.({ keyword: qRaw }) } catch {}
		
		return found
	}, [docId, fileUrl])

	return {
		matches,
		setMatches,
		searchCacheRef,
		searchNativeCore,
		searchMainThread,
		runSearch
	}
}