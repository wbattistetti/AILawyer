import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface OcrLayoutDebugProps {
	docId?: string
	overlayRootsRef: React.MutableRefObject<Map<number, HTMLElement>>
	enabled?: boolean
}

interface FirstWord {
	page: number
	text: string
	x0: number
	y0: number
	x1: number
	y1: number
}

export const OcrLayoutDebug: React.FC<OcrLayoutDebugProps> = ({
	docId,
	overlayRootsRef,
	enabled = true
}) => {
	const [firstWords, setFirstWords] = useState<Map<number, FirstWord>>(new Map())

	useEffect(() => {
		if (!enabled || !docId) {
			setFirstWords(new Map())
			return
		}

		const loadFirstWords = async () => {
			const wordsMap = new Map<number, FirstWord>()

			// Carica la prima parola per ogni pagina (fino a 20 pagine per non sovraccaricare)
			const maxPages = 20
			const promises: Promise<void>[] = []

			const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

			for (let page = 1; page <= maxPages; page++) {
				promises.push(
					fetch(`${apiUrl}/api/documenti/${docId}/layout-diagnostic?page=${page}`)
						.then(async (res) => {
							if (!res.ok) {
								// ✅ Non loggare 404 (normale se la pagina non ha dati OCR)
								if (res.status !== 404) {
									console.warn(`[OCR_DEBUG][PAGE ${page}] HTTP ${res.status}`, res.statusText)
								}
								return
							}
							const data = await res.json()

							if (data.sampleWords && data.sampleWords.length > 0) {
								const firstWord = data.sampleWords[0]

								if (data.pageWidth && data.pageHeight) {
									// ✅ Normalizza: pixel → 0-1 per il rendering
									const pageWidth = data.pageWidth
									const pageHeight = data.pageHeight

									const normalized = {
										x0: firstWord.x0 / pageWidth,
										y0: firstWord.y0 / pageHeight,
										x1: firstWord.x1 / pageWidth,
										y1: firstWord.y1 / pageHeight
									}

									// ✅ LOG COMPATTO: Solo l'essenziale
									console.log(`[OCR_DEBUG] Page ${page}: "${firstWord.text}" → pos(${(normalized.x0 * 100).toFixed(2)}%, ${(normalized.y0 * 100).toFixed(2)}%)`)

									wordsMap.set(page, {
										page,
										text: firstWord.text,
										x0: normalized.x0,
										y0: normalized.y0,
										x1: normalized.x1,
										y1: normalized.y1
									})
								} else {
									console.error(`[OCR_DEBUG] Page ${page}: ❌ Missing pageWidth/pageHeight`)
								}
							} else {
								console.warn(`[OCR_DEBUG] Page ${page}: ⚠️ No words found`)
							}
						})
						.catch((err) => {
							// ✅ Non loggare errori di connessione (backend potrebbe non essere avviato)
							if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
								// Backend non disponibile - silenzioso
								return
							}
							// ✅ Logga solo errori inaspettati
							console.warn('[OCR_DEBUG] Failed to load first word for page', page, err)
						})
				)
			}

			await Promise.all(promises)
			setFirstWords(wordsMap)
			console.log('[OCR_DEBUG] Loaded first words for', wordsMap.size, 'pages')
		}

		loadFirstWords()
	}, [docId, enabled])

	if (!enabled || firstWords.size === 0) {
		return null
	}

	return (
		<>
			{Array.from(firstWords.entries()).map(([page, word]) => {
				const root = overlayRootsRef.current.get(page)
				if (!root) return null

				const left = `${word.x0 * 100}%`
				const top = `${word.y0 * 100}%`
				const width = `${(word.x1 - word.x0) * 100}%`
				const height = `${(word.y1 - word.y0) * 100}%`

				return (
					<React.Fragment key={`debug-first-word-${page}`}>
						{createPortal(
							<div
								style={{
									position: 'absolute',
									left,
									top,
									width,
									height,
									background: 'rgba(255, 0, 0, 0.3)',
									border: '3px solid red',
									pointerEvents: 'none',
									zIndex: 9998,
									boxShadow: '0 0 10px rgba(255,0,0,0.8)',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
								title={`Prima parola pagina ${page}: "${word.text}"`}
							>
								<span
									style={{
										background: 'rgba(255, 0, 0, 0.9)',
										color: 'white',
										padding: '2px 6px',
										fontSize: '10px',
										fontWeight: 'bold',
										borderRadius: '2px',
										whiteSpace: 'nowrap'
									}}
								>
									{word.text}
								</span>
							</div>,
							root
						)}
					</React.Fragment>
				)
			})}
		</>
	)
}

