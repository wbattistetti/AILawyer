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
		// ✅ Verifica che il canvas abbia dimensioni valide
		if (canvas.width === 0 || canvas.height === 0) {
			console.warn('[CANVAS_CROP] Canvas ha dimensioni 0:', { width: canvas.width, height: canvas.height })
			return null
		}

		const canvasRect = canvas.getBoundingClientRect()
		const pageRect = pageLayer.getBoundingClientRect()

		// ✅ Verifica che le dimensioni del rect siano valide
		if (canvasRect.width === 0 || canvasRect.height === 0) {
			console.warn('[CANVAS_CROP] Canvas rect ha dimensioni 0:', { width: canvasRect.width, height: canvasRect.height })
			return null
		}

		// ✅ CRITICO: viewportBox è relativo al pageLayer ORIGINALE al momento della selezione
		// Converti viewportBox → percentuali rispetto al pageLayer originale
		// Poi applica le percentuali al canvasRect attuale (che può avere dimensioni diverse dopo zoom)

		// ✅ Converti viewportBox in percentuali rispetto al pageLayer
		// Le percentuali sono invarianti rispetto allo zoom
		const viewportBoxXPercent = viewportBox.x / pageRect.width
		const viewportBoxYPercent = viewportBox.y / pageRect.height
		const viewportBoxWPercent = viewportBox.w / pageRect.width
		const viewportBoxHPercent = viewportBox.h / pageRect.height

		// ✅ Applica le percentuali al canvas display attuale
		// Il canvas può avere dimensioni diverse dal pageLayer (padding, margini)
		const canvasDisplayX = viewportBoxXPercent * canvasRect.width
		const canvasDisplayY = viewportBoxYPercent * canvasRect.height
		const canvasDisplayW = viewportBoxWPercent * canvasRect.width
		const canvasDisplayH = viewportBoxHPercent * canvasRect.height

		// ✅ Calcola scale tra canvas display (DOM) e canvas interno (pixel)
		const scaleX = canvas.width / canvasRect.width
		const scaleY = canvas.height / canvasRect.height

		console.log('[CANVAS_CROP] Conversione viewportBox originale → canvas:', {
			viewportBoxOriginale: viewportBox,
			pageRect: { width: pageRect.width, height: pageRect.height },
			percentuali: { x: viewportBoxXPercent, y: viewportBoxYPercent, w: viewportBoxWPercent, h: viewportBoxHPercent },
			canvasRect: { width: canvasRect.width, height: canvasRect.height },
			canvasDisplay: { x: canvasDisplayX, y: canvasDisplayY, w: canvasDisplayW, h: canvasDisplayH },
			scale: { x: scaleX, y: scaleY }
		})

		// ✅ Converti coordinate display → coordinate canvas interne (pixel)
		const sourceX = canvasDisplayX * scaleX
		const sourceY = canvasDisplayY * scaleY
		const sourceW = canvasDisplayW * scaleX
		const sourceH = canvasDisplayH * scaleY

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

