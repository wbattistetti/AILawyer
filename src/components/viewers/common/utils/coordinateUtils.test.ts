import { describe, expect, it } from 'vitest'
import { calculateViewportBox, viewportBoxToPercent } from './coordinateUtils'

function mockElement(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  return {
    getBoundingClientRect: () => rect as DOMRect
  } as HTMLElement
}

describe('calculateViewportBox', () => {
  it('returns box relative to the given element (page, not host)', () => {
    const page = mockElement({ left: 100, top: 50, width: 800, height: 1000 })
    const box = calculateViewportBox(150, 80, 350, 180, page)
    expect(box).toEqual({ x: 50, y: 30, w: 200, h: 100 })
  })
})

describe('viewportBoxToPercent', () => {
  it('converts page-relative pixels to percentages', () => {
    const page = mockElement({ left: 0, top: 0, width: 200, height: 400 })
    expect(
      viewportBoxToPercent({ x: 50, y: 100, w: 100, h: 80 }, page)
    ).toEqual({
      x0Pct: 0.25,
      y0Pct: 0.25,
      x1Pct: 0.75,
      y1Pct: 0.45
    })
  })

  it('throws when element has zero size', () => {
    const page = mockElement({ left: 0, top: 0, width: 0, height: 100 })
    expect(() =>
      viewportBoxToPercent({ x: 0, y: 0, w: 10, h: 10 }, page)
    ).toThrow(/zero size/)
  })
})
