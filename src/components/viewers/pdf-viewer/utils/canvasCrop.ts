/**
 * Ritaglia una regione dal canvas del PDF usando coordinate pagina (CSS px).
 * L'output ha la dimensione CSS della selezione così l'<img> non appare zoomato.
 */

export interface ViewportBoxLike {
	x: number
	y: number
	w: number
	h: number
}

export interface RectSize {
	left: number
	top: number
	width: number
	height: number
}

export interface CanvasCropPlan {
	sourceX: number
	sourceY: number
	sourceW: number
	sourceH: number
	/** Dimensione CSS della selezione (output naturale = scala documento). */
	destW: number
	destH: number
}

/**
 * Calcola rettangolo sorgente (pixel canvas) e destinazione (CSS px pagina).
 * `viewportBox` deve essere relativo a `pageRect` (stesso spazio delle percentuali pagina).
 */
export function planCanvasCrop(
	viewportBox: ViewportBoxLike,
	pageRect: RectSize,
	canvasRect: RectSize,
	canvasWidth: number,
	canvasHeight: number
): CanvasCropPlan | null {
	if (canvasWidth <= 0 || canvasHeight <= 0) return null
	if (canvasRect.width <= 0 || canvasRect.height <= 0) return null
	if (pageRect.width <= 0 || pageRect.height <= 0) return null
	if (viewportBox.w <= 0 || viewportBox.h <= 0) return null

	const offsetX = canvasRect.left - pageRect.left
	const offsetY = canvasRect.top - pageRect.top

	const displayX = viewportBox.x - offsetX
	const displayY = viewportBox.y - offsetY
	const displayW = viewportBox.w
	const displayH = viewportBox.h

	const scaleX = canvasWidth / canvasRect.width
	const scaleY = canvasHeight / canvasRect.height

	const sourceX = displayX * scaleX
	const sourceY = displayY * scaleY
	const sourceW = displayW * scaleX
	const sourceH = displayH * scaleY

	const clampedX = Math.max(0, Math.min(sourceX, canvasWidth))
	const clampedY = Math.max(0, Math.min(sourceY, canvasHeight))
	const clampedW = Math.max(0, Math.min(sourceW, canvasWidth - clampedX))
	const clampedH = Math.max(0, Math.min(sourceH, canvasHeight - clampedY))

	if (clampedW < 1 || clampedH < 1) return null

	// Destinazione = porzione CSS effettivamente ritagliata (non i pixel HiDPI del canvas).
	const destW = Math.max(1, Math.round(clampedW / scaleX))
	const destH = Math.max(1, Math.round(clampedH / scaleY))

	return {
		sourceX: clampedX,
		sourceY: clampedY,
		sourceW: clampedW,
		sourceH: clampedH,
		destW,
		destH
	}
}

/**
 * Ritaglia una regione dal canvas del PDF.
 * @param viewportBox - Rettangolo in pixel CSS relativi a pageLayer
 */
export async function cropCanvasFromViewportBox(
	canvas: HTMLCanvasElement,
	viewportBox: ViewportBoxLike,
	pageLayer: HTMLElement
): Promise<string | null> {
	try {
		if (canvas.width === 0 || canvas.height === 0) {
			console.warn('[CANVAS_CROP] Canvas ha dimensioni 0:', { width: canvas.width, height: canvas.height })
			return null
		}

		const canvasRect = canvas.getBoundingClientRect()
		const pageRect = pageLayer.getBoundingClientRect()

		if (canvasRect.width === 0 || canvasRect.height === 0) {
			console.warn('[CANVAS_CROP] Canvas rect ha dimensioni 0:', {
				width: canvasRect.width,
				height: canvasRect.height
			})
			return null
		}

		const plan = planCanvasCrop(
			viewportBox,
			pageRect,
			canvasRect,
			canvas.width,
			canvas.height
		)

		if (!plan) {
			console.warn('[CANVAS_CROP] Dimensioni invalide dopo plan/clamp')
			return null
		}

		const croppedCanvas = document.createElement('canvas')
		croppedCanvas.width = plan.destW
		croppedCanvas.height = plan.destH
		const ctx = croppedCanvas.getContext('2d', { willReadFrequently: false })

		if (!ctx) {
			console.error('[CANVAS_CROP] Impossibile ottenere contesto 2D')
			return null
		}

		ctx.drawImage(
			canvas,
			Math.round(plan.sourceX),
			Math.round(plan.sourceY),
			Math.round(plan.sourceW),
			Math.round(plan.sourceH),
			0,
			0,
			plan.destW,
			plan.destH
		)

		return croppedCanvas.toDataURL('image/png')
	} catch (error) {
		console.error('[CANVAS_CROP] Errore durante il ritaglio:', error)
		return null
	}
}
