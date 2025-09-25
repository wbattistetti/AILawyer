// PDF-based extraction: works in PDF coordinates using pdf.js
export async function getTextInPdfBox(
	page: any,
	pdfBox: { x0: number; y0: number; x1: number; y1: number }
) {
	try {
		const tc = await page.getTextContent()
		const xMin = Math.min(pdfBox.x0, pdfBox.x1)
		const xMax = Math.max(pdfBox.x0, pdfBox.x1)
		const yMin = Math.min(pdfBox.y0, pdfBox.y1)
		const yMax = Math.max(pdfBox.y0, pdfBox.y1)

		type Hit = { str: string; x: number; yTop: number; yBot: number }
		const hits: Hit[] = []
    for (const item of (tc.items || []) as any[]) {
			// transform = [a b c d e f]; e,f translation; d ~ height
			const tr = (item.transform || [0, 0, 0, 0, 0, 0]) as number[]
			const x = tr[4]
      const yBaseline = tr[5]
      const h = Math.abs(tr[3]) || Math.abs(tr[0]) || 0
      // In pdf.js il baseline è il "bottom"; il top è baseline + h
      const yBot = yBaseline
      const yTop = yBaseline + h
			const w = (item.width as number) || 0
			const x0 = x
			const x1 = x + w
			const overlaps = !(x1 < xMin || x0 > xMax || yTop < yMin || yBot > yMax)
			if (overlaps) hits.push({ str: String(item.str || ''), x, yTop, yBot })
		}

		// sort: y desc (top→bottom in pdf coords), then x asc
		hits.sort((a, b) => {
			const ycmp = b.yTop - a.yTop
			if (Math.abs(ycmp) > 0.5) return ycmp
			return a.x - b.x
		})

    const lines: string[] = []
		let currY = Number.POSITIVE_INFINITY
		let buf: string[] = []
		const Y_TOL = 2
		for (const h of hits) {
			if (Math.abs(h.yTop - currY) > Y_TOL) {
				if (buf.length) lines.push(buf.join('').replace(/\s+/g, ' ').trim())
				buf = []
				currY = h.yTop
			}
			buf.push(h.str)
		}
		if (buf.length) lines.push(buf.join('').replace(/\s+/g, ' ').trim())

		// restore natural order (top→bottom visual)
		const ordered = lines.reverse()
    try {
      console.log('[EXTRACT][PDF_DEBUG]', {
        items: (tc.items || []).length,
        box: { xMin, xMax, yMin, yMax },
        hits: hits.length,
        sample: hits.slice(0, 5).map(h => ({ x: h.x, yTop: h.yTop, yBot: h.yBot, str: h.str.slice(0, 40) }))
      })
    } catch {}
    return { text: ordered.join('\n'), lines: ordered }
	} catch {
		return { text: '', lines: [] as string[] }
	}
}


