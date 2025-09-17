// Web Worker for full-document PDF search using pdfjs-dist
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist'

type MatchOut = {
  id: string
  page: number
  snippet: string
  x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number
}

const cryptoRandom = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

self.onmessage = async (ev: MessageEvent) => {
  const data = ev.data as { type: 'search'; q: string; data?: ArrayBuffer; fileUrl?: string }
  if (!data || data.type !== 'search') return
  try {
    ;(self as any).postMessage({ type: 'debug', step: 'received', hasData: !!data.data, hasUrl: !!data.fileUrl })
    const src = data.data ? { data: new Uint8Array(data.data), disableWorker: true } : { url: data.fileUrl, disableWorker: true }
    const task = (pdfjsLib as any).getDocument(src)
    ;(self as any).postMessage({ type: 'debug', step: 'getDocument-start' })
    const doc = await task.promise
    ;(self as any).postMessage({ type: 'debug', step: 'getDocument-done', numPages: doc?.numPages })
    const total: number = doc.numPages || 0
    const out: MatchOut[] = []
    const needle = (data.q || '').toLowerCase()
    for (let p = 1; p <= total; p++) {
      try {
        ;(self as any).postMessage({ type: 'debug', step: 'page-start', p })
        const page = await doc.getPage(p)
        const content = await page.getTextContent()
        const items = content.items as any[]
        let buffer = ''
        const boxes: { x: number; y: number; w: number; h: number }[] = []
        for (const it of items) {
          const s = (it.str || '') as string
          const tx = it.transform
          const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0
          const cw = ((it.width as number) || 0) / Math.max(1, s.length)
          for (let i = 0; i < s.length; i++) {
            const x = (tx[4] as number) + (cw * i)
            const y = (tx[5] as number) - h
            boxes.push({ x, y, w: cw, h })
          }
          buffer += s + ' '
        }
        const hay = buffer.toLowerCase()
        let pos = 0
        while (true) {
          const idx = hay.indexOf(needle, pos)
          if (idx < 0) break
          const start = idx, end = idx + needle.length
          let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
          for (let i = start; i < end && i < boxes.length; i++) {
            const c = boxes[i]
            l = Math.min(l, c.x); t = Math.min(t, c.y)
            r = Math.max(r, c.x + c.w); b = Math.max(b, c.y + c.h)
          }
          if (isFinite(l) && isFinite(t) && isFinite(r) && isFinite(b)) {
            const vp = page.getViewport({ scale: 1 })
            const x0Pct = l / vp.width
            const x1Pct = r / vp.width
            const yTop = vp.height - b
            const yBottom = vp.height - t
            const y0Pct = yTop / vp.height
            const y1Pct = yBottom / vp.height
            out.push({ id: cryptoRandom(), page: p, snippet: buffer.slice(Math.max(0, start-40), Math.min(buffer.length, end+40)).trim(), x0Pct, x1Pct, y0Pct, y1Pct })
          }
          pos = end
        }
        ;(self as any).postMessage({ type: 'progress', page: p, total })
      } catch {}
    }
    ;(self as any).postMessage({ type: 'result', matches: out })
  } catch (err) {
    ;(self as any).postMessage({ type: 'error', message: (err as any)?.message || String(err) })
  }
}

export {}


