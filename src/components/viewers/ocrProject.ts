export type OcrSource = 'pdf' | 'raster'

export type OcrBox = { x0: number; y0: number; x1: number; y1: number }

export type ProjectParams = {
  source: OcrSource
  box: OcrBox
  // PDF viewport size (pre-scale) when source === 'pdf'
  vpW?: number
  vpH?: number
  // Raster image size when source === 'raster'
  imgW?: number
  imgH?: number
  rotation?: 0 | 90 | 180 | 270
  pageRect: DOMRectReadOnly
  hostRect: DOMRectReadOnly
}

function rotateTopLeftBox(x: number, y: number, w: number, h: number, rot: 0 | 90 | 180 | 270, refW: number, refH: number) {
  // x,y origin top-left within a refW x refH box
  if (rot === 0) return { x, y, w, h }
  if (rot === 90) return { x: y, y: refW - (x + w), w: h, h: w }
  if (rot === 180) return { x: refW - (x + w), y: refH - (y + h), w, h }
  // 270
  return { x: refH - (y + h), y: x, w: h, h: w }
}

export function projectOcrBoxToClientRect(p: ProjectParams): { left: number; top: number; width: number; height: number } {
  const rot = (p.rotation || 0) as 0 | 90 | 180 | 270
  let refW = 0, refH = 0
  let x = p.box.x0, y = p.box.y0, w = Math.max(0, p.box.x1 - p.box.x0), h = Math.max(0, p.box.y1 - p.box.y0)

  if (p.source === 'pdf') {
    refW = p.vpW || 1
    refH = p.vpH || 1
  } else {
    refW = p.imgW || 1
    refH = p.imgH || 1
  }

  const r = rotateTopLeftBox(x, y, w, h, rot, refW, refH)
  const left = p.pageRect.left - p.hostRect.left + (r.x / refW) * p.pageRect.width
  const top = p.pageRect.top - p.hostRect.top + (r.y / refH) * p.pageRect.height
  const width = Math.max(1, (r.w / refW) * p.pageRect.width)
  const height = Math.max(1, (r.h / refH) * p.pageRect.height)
  return { left, top, width, height }
}


