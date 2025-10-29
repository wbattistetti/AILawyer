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

		if (lastSpan) {
			const lastRect = lastSpan.getBoundingClientRect()
			const lastRight = lastRect.right - textLayerRect.left
			const currentLeft = rect.left - textLayerRect.left
			const lastBottom = lastRect.bottom - textLayerRect.top
			const currentTop = rect.top - textLayerRect.top

			// Se siamo sulla stessa riga e c'è spazio tra gli span, aggiungi uno spazio
			if (Math.abs(currentTop - lastBottom) < 5) {
				if (currentLeft - lastRight > 3) {
					text += ' '
				}
			} else {
				// Nuova riga
				text += '\n'
			}
		}

		text += spanText
		rects.push(rect)
		lastSpan = span
	}

	return { text: text.trim(), rects }
}
