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
	
	for (const span of spans) {
		const r = span.getBoundingClientRect()
		const yTop = r.top - textLayerRect.top
		const yBot = r.bottom - textLayerRect.top
		const xLeft = r.left - textLayerRect.left
		const xRight = r.right - textLayerRect.left
		
		// Controlla se lo span interseca il rettangolo
		const overlap = !(xRight < viewportBox.x || xLeft > (viewportBox.x + viewportBox.w) || 
						 yBot < viewportBox.y || yTop > (viewportBox.y + viewportBox.h))
		
		if (overlap && span.textContent?.trim()) {
			text += span.textContent
			rects.push(r)
		}
	}
	
	return { text: text.trim(), rects }
}
