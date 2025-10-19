import { useEffect, useRef } from 'react'

function ensureNativeSelectStyles() {
	const style = document.getElementById('ai-native-select-styles')
	if (style) return
	const el = document.createElement('style')
	el.id = 'ai-native-select-styles'
	el.textContent = `
		.ai-native-select .rpv-core__text-layer { user-select: text !important; -webkit-user-select: text !important; }
		.ai-native-select .rpv-core__page-layer { user-select: none !important; -webkit-user-select: none !important; }
	`
	document.head.appendChild(el)
}

export interface UsePdfNativeStylesProps {
	hostRef: React.RefObject<HTMLElement>
	selectMode: boolean
	selectKind: 'NATIVE' | 'OCR'
}

export interface UsePdfNativeStylesReturn {
	// Questo hook non restituisce nulla, gestisce solo gli stili
}

export function usePdfNativeStyles({ hostRef, selectMode, selectKind }: UsePdfNativeStylesProps): UsePdfNativeStylesReturn {
	// Ensure native selection works: enable selection on text-layer only (avoid wrapper selection flicker)
	useEffect(() => {
		const host = hostRef.current
		if (!host) return
        ensureNativeSelectStyles()
    if (selectMode && selectKind==='NATIVE') host.classList.add('ai-native-select')
    else host.classList.remove('ai-native-select')
    try { console.log('[NATIVE][enable][toggle-class]', { applied: host.classList.contains('ai-native-select'), selectMode, selectKind }) } catch {}
		const textLayers = Array.from(host.querySelectorAll('.rpv-core__text-layer')) as HTMLElement[]
		const pageLayers = Array.from(host.querySelectorAll('.rpv-core__page-layer')) as HTMLElement[]
		try { console.log('[NATIVE][enable] applying mode', { selectMode, selectKind, textLayers: textLayers.length, pageLayers: pageLayers.length }) } catch {}
		for (const tl of textLayers) {
			if (selectMode && selectKind === 'NATIVE') {
				tl.style.pointerEvents = 'auto'
				tl.style.userSelect = 'text'
				;(tl.style as any).webkitUserSelect = 'text'
				try { console.log('[NATIVE][enable] text-layer enabled') } catch {}
			} else {
				tl.style.removeProperty('pointer-events')
				tl.style.removeProperty('user-select')
				;(tl.style as any).webkitUserSelect = ''
			}
		}
		for (const pl of pageLayers) {
			if (selectMode && selectKind === 'NATIVE') {
            // IMPORTANT: non catturare gli eventi sul page-layer, altrimenti la selezione cade nel vuoto
            pl.style.pointerEvents = 'none'
				pl.style.userSelect = 'none'
				;(pl.style as any).webkitUserSelect = 'none'
			} else {
				pl.style.removeProperty('pointer-events')
				pl.style.removeProperty('user-select')
				;(pl.style as any).webkitUserSelect = ''
			}
		}
    return () => { host.classList.remove('ai-native-select') }
	}, [selectMode, selectKind, hostRef])

	return {}
}
