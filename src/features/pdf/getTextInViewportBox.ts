export async function getTextInViewportBox(
  host: HTMLElement,
  pageNumber: number,
  box: { x: number; y: number; w: number; h: number }
) {
  const holder = host.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null
  const pageRoot = (holder as HTMLElement | null) || (host.querySelectorAll('.rpv-core__page-layer')[pageNumber - 1] as HTMLElement | null)
  if (!pageRoot) return { text: '', lines: [] as string[] }

  const textLayer = (pageRoot.querySelector('.rpv-core__text-layer') as HTMLElement | null) || pageRoot
  // Attendi che la text-layer sia popolata (render asincrono)
  let spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
  if (spans.length === 0) {
    const start = performance.now()
    while (spans.length === 0 && performance.now() - start < 600) {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'))
    }
  }
  const pageRect = pageRoot.getBoundingClientRect()
  const hostRect = textLayer.getBoundingClientRect()
  const PADDING_H = 4
  const PADDING_V = 4
  const hits: { node: HTMLElement; top: number; left: number; right: number; centerY: number }[] = []
  // Mappa il box pagina -> coordinate text-layer (px)
  const mapX = box.x + (pageRect.left - hostRect.left)
  const mapY = box.y + (pageRect.top - hostRect.top)
  const leftBound = mapX - PADDING_H
  const rightBound = mapX + box.w + PADDING_H
  const topBound = mapY - PADDING_V
  const bottomBound = mapY + box.h + PADDING_V

  spans.forEach((n) => {
    const r = n.getBoundingClientRect()
    const xL = r.left - hostRect.left
    const xR = r.right - hostRect.left
    const yT = r.top - hostRect.top
    const yB = r.bottom - hostRect.top
    const areaSpan = Math.max(0, xR - xL) * Math.max(0, yB - yT)
    const interW = Math.max(0, Math.min(xR, rightBound) - Math.max(xL, leftBound))
    const interH = Math.max(0, Math.min(yB, bottomBound) - Math.max(yT, topBound))
    const interA = interW * interH
    const centerX = (xL + xR) / 2
    const centerY = (yT + yB) / 2
    const centerInside = centerX >= leftBound && centerX <= rightBound && centerY >= topBound && centerY <= bottomBound
    const overlapRatio = areaSpan > 0 ? interA / areaSpan : 0
    if (centerInside || overlapRatio >= 0.3) {
      hits.push({ node: n, top: yT, left: xL, right: xR, centerY })
    }
  })

  hits.sort((a, b) => (a.top - b.top) || (a.left - b.left))
  const lines: string[] = []
  let currentTop = Number.NEGATIVE_INFINITY
  const avgHeight = hits.length ? hits.reduce((acc, h) => acc + (h.node.getBoundingClientRect().height || 0), 0) / hits.length : 0
  const lineThreshold = Math.max(8, Math.round(avgHeight * 0.6) || 10)
  const gapTol = Math.max(2, Math.round(avgHeight * 0.25))

  // Ricostruzione righe con spazi basati sul gap orizzontale
  let row: typeof hits = []
  const flush = () => {
    if (!row.length) return
    row.sort((a,b)=> a.left - b.left)
    // Mantieni la riga solo se la maggioranza dei centri Y è dentro il box mappato
    const insideCount = row.filter(s => s.centerY >= topBound && s.centerY <= bottomBound).length
    const keepRow = insideCount / row.length >= 0.6
    if (!keepRow) { row = []; return }
    let out = ''
    for (let i=0;i<row.length;i++){
      const c = row[i]
      out += (c.node.textContent || '')
      const n = row[i+1]
      if (!n) break
      const gap = n.left - c.right
      if (gap > gapTol) out += ' '
    }
    out = out.replace(/-\n?/g,'').replace(/\s+/g,' ').trim()
    lines.push(out)
    row = []
  }
  hits.forEach((h)=>{
    if (Math.abs(h.top - currentTop) > lineThreshold){ flush(); currentTop = h.top }
    row.push(h)
  })
  flush()

  let text = lines.join('\n')
  text = text.replace(/-\n(?=\p{Ll})/gu, '')
  text = text.replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim()
  try {
    console.log('[EXTRACT][TEXT_DEBUG]', {
      pageNumber,
      spans: spans.length,
      hits: hits.length,
      viewportBox: box,
      mappedPadding: { padH: PADDING_H, padV: PADDING_V },
      mappedBounds: { left: leftBound, right: rightBound, top: topBound, bottom: bottomBound },
      pageRect: { left: pageRect.left, top: pageRect.top, w: pageRect.width, h: pageRect.height },
      hostRect: { left: hostRect.left, top: hostRect.top, w: hostRect.width, h: hostRect.height },
      sample: hits.slice(0, 5).map(h => ({ top: h.top, left: h.left, right: h.right, text: (h.node.textContent||'').slice(0, 40) }))
    })
  } catch {}
  try {
    console.log('[EXTRACT][TEXT_DEBUG]', {
      pageNumber,
      spans: spans.length,
      hits: hits.length,
      box,
      pageRect: { left: pageRect.left, top: pageRect.top, w: pageRect.width, h: pageRect.height },
      hostRect: { left: hostRect.left, top: hostRect.top, w: hostRect.width, h: hostRect.height }
    })
  } catch {}
  return { text, lines }
}


