export interface TextExtractionResult {
	text: string
	rects: DOMRect[]
}

export const getSelectedTextInRect = async (
	textLayer: HTMLDivElement,
	viewportBox: { x: number; y: number; w: number; h: number }
): Promise<TextExtractionResult> => {
	const textLayerRect = textLayer.getBoundingClientRect()
	const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))

	let text = ''
	const rects: DOMRect[] = []

	// Prova prima a usare il testo nativo del PDF se disponibile
	const textLayerElement = textLayer.closest('.textLayer')
	if (textLayerElement) {
		// Cerca un elemento con il testo nativo del PDF
		const nativeTextElement = textLayerElement.querySelector('[data-text-content]') as HTMLElement
		if (nativeTextElement && nativeTextElement.textContent) {
			const nativeText = nativeTextElement.textContent

			// Usa il testo nativo che è già ben formattato
			// Filtra solo la parte che corrisponde al rettangolo selezionato
			// Per ora restituiamo tutto il testo nativo come fallback
			return { text: nativeText.trim(), rects: [] }
		}
	}

	// Fallback: usa la logica originale ma semplificata
	let lastSpan: HTMLElement | null = null

	// Ordina gli span per posizione (top -> bottom, left -> right)
	const sortedSpans = spans
		.map(span => {
			const r = span.getBoundingClientRect()
			return {
				span,
				rect: r,
				yTop: r.top - textLayerRect.top,
				xLeft: r.left - textLayerRect.left
			}
		})
		.filter(item => {
			const { rect, yTop, xLeft } = item
			const yBot = rect.bottom - textLayerRect.top
			const xRight = rect.right - textLayerRect.left

			// Controlla se lo span interseca il rettangolo
			const overlap = !(xRight < viewportBox.x || xLeft > (viewportBox.x + viewportBox.w) ||
				yBot < viewportBox.y || yTop > (viewportBox.y + viewportBox.h))

			return overlap && item.span.textContent?.trim()
		})
		.sort((a, b) => {
			const diffY = a.yTop - b.yTop
			if (Math.abs(diffY) > 5) return diffY // Diversa riga
			return a.xLeft - b.xLeft // Stessa riga, ordina per x
		})

	for (const item of sortedSpans) {
		const { span, rect } = item
		const spanText = span.textContent || ''

		// Logica semplificata: aggiungi sempre uno spazio tra gli span
		// Il testo nativo del PDF dovrebbe già essere ben formattato
		if (lastSpan) {
			text += ' '
		}

		text += spanText
		rects.push(rect)
		lastSpan = span
	}

	return { text: text.trim(), rects }
}
