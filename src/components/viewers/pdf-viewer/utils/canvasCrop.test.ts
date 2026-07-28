import { describe, expect, it } from 'vitest'
import { planCanvasCrop } from './canvasCrop'

describe('planCanvasCrop', () => {
	it('maps page-relative CSS box to canvas pixels and CSS-sized dest', () => {
		const plan = planCanvasCrop(
			{ x: 100, y: 50, w: 200, h: 80 },
			{ left: 0, top: 0, width: 800, height: 1000 },
			{ left: 0, top: 0, width: 800, height: 1000 },
			1600,
			2000
		)

		expect(plan).not.toBeNull()
		expect(plan!.sourceX).toBe(200)
		expect(plan!.sourceY).toBe(100)
		expect(plan!.sourceW).toBe(400)
		expect(plan!.sourceH).toBe(160)
		// Dest matches on-screen selection (not HiDPI source)
		expect(plan!.destW).toBe(200)
		expect(plan!.destH).toBe(80)
	})

	it('accounts for canvas offset inside the page', () => {
		const plan = planCanvasCrop(
			{ x: 40, y: 30, w: 100, h: 50 },
			{ left: 10, top: 20, width: 600, height: 800 },
			{ left: 20, top: 40, width: 580, height: 760 },
			1160,
			1520
		)

		expect(plan).not.toBeNull()
		// display on canvas = viewport - (canvasRect - pageRect) in page space
		// offset = (20-10, 40-20) = (10, 20) → display (30, 10)
		expect(plan!.sourceX).toBeCloseTo(60)
		expect(plan!.sourceY).toBeCloseTo(20)
		expect(plan!.destW).toBe(100)
		expect(plan!.destH).toBe(50)
	})

	it('returns null for empty selection or canvas', () => {
		expect(
			planCanvasCrop(
				{ x: 0, y: 0, w: 0, h: 10 },
				{ left: 0, top: 0, width: 100, height: 100 },
				{ left: 0, top: 0, width: 100, height: 100 },
				100,
				100
			)
		).toBeNull()

		expect(
			planCanvasCrop(
				{ x: 0, y: 0, w: 10, h: 10 },
				{ left: 0, top: 0, width: 100, height: 100 },
				{ left: 0, top: 0, width: 100, height: 100 },
				0,
				100
			)
		).toBeNull()
	})
})
