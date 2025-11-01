/**
 * Ritaglia una regione dal canvas del PDF usando le coordinate del viewport
 * @param canvas - Il canvas HTML element della pagina PDF
 * @param viewportBox - Coordinate del rettangolo da ritagliare in pixel viewport ({x, y, w, h})
 * @param pageLayer - L'elemento DOM della pagina (per calcolare le coordinate relative)
 * @returns Promise con data URL dell'immagine ritagliata o null in caso di errore
 */
export async function cropCanvasFromViewportBox(
	canvas: HTMLCanvasElement,
	viewportBox: { x: number; y: number; w: number; h: number },
	pageLayer: HTMLElement
): Promise<string | null> {
	try {
		const canvasRect = canvas.getBoundingClientRect()
		const pageRect = pageLayer.getBoundingClientRect()

		// Calcola il rapporto di scala tra canvas display (DOM) e canvas interno (pixel)
		const scaleX = canvas.width / canvasRect.width
		const scaleY = canvas.height / canvasRect.height

		// Il viewportBox è relativo al pageLayer, ma dobbiamo convertirlo in coordinate canvas
		// Prima convertiamo viewportBox (relativo a pageLayer) in coordinate relative a canvas display
		const canvasDisplayX = viewportBox.x - (canvasRect.left - pageRect.left)
		const canvasDisplayY = viewportBox.y - (canvasRect.top - pageRect.top)

		// Ora convertiamo le coordinate display in coordinate canvas interne (pixel)
		const sourceX = canvasDisplayX * scaleX
		const sourceY = canvasDisplayY * scaleY
		const sourceW = viewportBox.w * scaleX
		const sourceH = viewportBox.h * scaleY

		// Assicurati che le coordinate siano dentro i bounds del canvas
		const clampedX = Math.max(0, Math.min(sourceX, canvas.width))
		const clampedY = Math.max(0, Math.min(sourceY, canvas.height))
		const clampedW = Math.max(1, Math.min(sourceW, canvas.width - clampedX))
		const clampedH = Math.max(1, Math.min(sourceH, canvas.height - clampedY))

		if (clampedW <= 0 || clampedH <= 0) {
			console.warn('[CANVAS_CROP] Dimensioni invalide dopo clamp:', { clampedW, clampedH })
			return null
		}

		// Crea un nuovo canvas temporaneo per il ritaglio
		const croppedCanvas = document.createElement('canvas')
		croppedCanvas.width = Math.round(clampedW)
		croppedCanvas.height = Math.round(clampedH)
		const ctx = croppedCanvas.getContext('2d', { willReadFrequently: false })

		if (!ctx) {
			console.error('[CANVAS_CROP] Impossibile ottenere contesto 2D')
			return null
		}

		// Disegna la regione ritagliata sul nuovo canvas
		ctx.drawImage(
			canvas,
			Math.round(clampedX), Math.round(clampedY), Math.round(clampedW), Math.round(clampedH),  // Source rectangle
			0, 0, Math.round(clampedW), Math.round(clampedH)                                           // Destination rectangle
		)

		// Converti in data URL PNG (alta qualità per documenti)
		const dataUrl = croppedCanvas.toDataURL('image/png')
		return dataUrl
	} catch (error) {
		console.error('[CANVAS_CROP] Errore durante il ritaglio:', error)
		return null
	}
}

