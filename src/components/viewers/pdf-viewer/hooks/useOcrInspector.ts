import { useState, useRef, useEffect } from 'react'
import { api } from '../../../../lib/api'

interface OcrInspectorState {
  ocrInspect: { page: number; text: string } | null
  ocrDrag: { x: number; y: number; dx: number; dy: number; dragging: boolean }
  lastOcrMatchesRef: React.MutableRefObject<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>
}

export const useOcrInspector = (docId?: string) => {
  const [ocrInspect, setOcrInspect] = useState<{ page: number; text: string } | null>(null)
  const [ocrDrag, setOcrDrag] = useState<{ x: number; y: number; dx: number; dy: number; dragging: boolean }>({ x: 24, y: 24, dx: 0, dy: 0, dragging: false })
  const lastOcrMatchesRef = useRef<Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>>([])

  async function loadOcrPageText(pageNum: number) {
    try {
      if (!docId) return
      const doc: any = await api.getDocumento(docId)
      const raw = String(doc?.ocrText || '')
      try { console.log('[OCR][inspector] fetch doc', { pageNum, hasText: !!raw, textLen: raw.length, hasLayout: !!doc?.ocrLayout }) } catch { }
      // Prova a ricostruire a capo dalle words dell'ocrLayout
      let textFromLayout = ''
      try {
        const layoutRaw: any = (doc as any).ocrLayout
        const arr = Array.isArray(layoutRaw) ? layoutRaw : (() => { try { return JSON.parse(layoutRaw || '[]') } catch { return [] } })()
        const lay = (arr.find((p: any) => p?.page === pageNum) || arr[pageNum - 1])
        try { console.log('[OCR][inspector] layout page', { pageNum, pages: Array.isArray(arr) ? arr.length : 0, hasLay: !!lay, words: lay?.words?.length || 0 }) } catch { }
        if (lay && Array.isArray(lay.words) && lay.words.length > 0) {
          const ws = lay.words.filter((w: any) => w && String(w.text || '').trim())
          const hasIdx = ws.every((w: any) => Number.isFinite(w.b) && Number.isFinite(w.p) && Number.isFinite(w.l) && Number.isFinite(w.wi))
          if (hasIdx) {
            const sorted = ws.slice().sort((a: any, b: any) =>
              (a.b || 0) - (b.b || 0) || (a.p || 0) - (b.p || 0) || (a.l || 0) - (b.l || 0) || (a.wi || 0) - (b.wi || 0)
            )
            let parts: string[] = []
            let last = { b: -1, p: -1, l: -1 }
            for (const w of sorted) {
              const nb = w.b || 0, np = w.p || 0, nl = w.l || 0
              if (last.b !== -1) {
                if (nb !== last.b) parts.push('\n\n')
                else if (np !== last.p) parts.push('\n\n')
                else if (nl !== last.l) parts.push('\n')
                else parts.push(' ')
              }
              parts.push(String(w.text || '').trim())
              last = { b: nb, p: np, l: nl }
            }
            textFromLayout = parts.join('').replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
          } else {
            // fallback semplice per quando non abbiamo indici
            type Word = { x0: number; x1: number; y0: number; y1: number; text: string }
            const words = (ws as Word[])
            const withMid = words.map(w => ({ ...w, xMid: (w.x0 + w.x1) / 2, yMid: (w.y0 + w.y1) / 2, h: (w.y1 - w.y0) }))
            withMid.sort((a, b) => a.yMid === b.yMid ? a.x0 - b.x0 : a.yMid - b.yMid)
            const hs = withMid.map(w => w.h).filter(n => n > 0)
            const medH = hs.length ? [...hs].sort((a, b) => a - b)[Math.floor(hs.length / 2)] : 0.02
            const thrY = Math.max(0.003, medH * 0.35)
            type Line = { y: number; parts: typeof withMid }
            const lines: any[] = []
            for (const w of withMid) {
              const last = lines[lines.length - 1]
              if (!last || Math.abs(last.y - w.yMid) > thrY) lines.push({ y: w.yMid, parts: [w] })
              else { last.parts.push(w); last.y = (last.y * (last.parts.length - 1) + w.yMid) / last.parts.length }
            }
            for (const ln of lines) ln.parts.sort((p: any, q: any) => p.x0 - q.x0)
            const texts = lines.sort((a, b) => a.y - b.y).map(ln => ln.parts.map((p: any) => String(p.text || '').trim()).join(' '))
            textFromLayout = texts.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
          }
        }
      } catch { }

      let text = ''
      if (textFromLayout && textFromLayout.trim()) {
        text = textFromLayout
      } else if (raw) {
        // Usa separatore esatto del backend ("\n\f\n"), fallback a solo form-feed
        const primary = raw.split(/\n\f\n/g)
        const fallback = raw.split(/\f/g)
        const parts = primary.length >= fallback.length ? primary : fallback
        const idx = pageNum - 1
        if (idx >= 0 && idx < parts.length) {
          text = String(parts[idx] || '')
        } else {
          text = ''
        }
        try { console.log('[OCR][inspector] split fallback', { parts: parts.length, pickIdx: idx, inRange: (idx >= 0 && idx < parts.length), len: text.length }) } catch { }
        // Non forzare più uno spazio: lasciamo la pagina vuota per evidenziare il fallimento OCR
      } else {
        // Fallback: se non abbiamo OCR per questa pagina, prova a leggere il testo nativo della pagina via pdf.js
        try {
          const anyPdf: any = (await import('pdfjs-dist/legacy/build/pdf.js')) as any
          if (anyPdf && anyPdf.getDocument) {
            const docMeta: any = await api.getDocumento(docId)
            const fileKey = docMeta?.ocrPdfKey || docMeta?.s3Key
            if (fileKey) {
              const url = docMeta?.localUrl || api.getLocalFileUrl(fileKey)
              const res = await fetch(url)
              const buf = await res.arrayBuffer()
              const pdf = await anyPdf.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise
              const p = Math.max(1, Math.min(pageNum, pdf.numPages || 1))
              const page = await pdf.getPage(p)
              const content = await page.getTextContent()
              const items = content.items as any[]
              text = items.map(it => String(it.str || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ')
              try { console.log('[OCR][inspector] pdfjs fallback', { pageNum: p, len: text.length }) } catch { }
            }
          }
        } catch { }
        if (!text) text = '<nessun testo OCR disponibile>'
      }
      setOcrInspect({ page: pageNum, text })
    } catch (e) {
      try { console.warn('[OCR][inspector] load error', e) } catch { }
    }
  }

  function ensureOverlayForPage(pageNum: number, hostRef: React.RefObject<HTMLDivElement>): HTMLDivElement | null {
    const container = hostRef.current as HTMLElement | null
    if (!container) return null
    // Usa SEMPRE il layer di pagina di react-pdf-viewer
    const pages = container.querySelectorAll('.rpv-core__page-layer') as NodeListOf<HTMLElement>
    const pageEl = (pages && pages.length >= pageNum) ? pages[pageNum - 1] : null
    if (!pageEl) return null

    let overlay = pageEl.querySelector('.ocr-overlay') as HTMLDivElement | null
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'ocr-overlay'
      overlay.style.position = 'absolute'
      overlay.style.inset = '0'
      overlay.style.pointerEvents = 'none'
      overlay.style.zIndex = '30'
      pageEl.style.position = 'relative'
      pageEl.appendChild(overlay)
    }
    // Misure coerenti al layer
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    return overlay
  }

  function drawOcrRects(matches: Array<{ page: number; x0Pct: number; y0Pct: number; x1Pct: number; y1Pct: number }>, color?: string, hostRef?: React.RefObject<HTMLDivElement>) {
    lastOcrMatchesRef.current = matches
    const byPage = new Map<number, Array<typeof matches[0]>>()
    for (const m of matches) {
      if (!byPage.has(m.page)) byPage.set(m.page, [])
      byPage.get(m.page)!.push(m)
    }
    for (const [pageNum, hits] of byPage) {
      const overlay = hostRef ? ensureOverlayForPage(pageNum, hostRef) : null
      if (!overlay) {
        continue
      }
      overlay.innerHTML = ''
      const w = overlay.clientWidth
      const h = overlay.clientHeight
      for (const m of hits) {
        const x = Math.max(0, Math.min(w, m.x0Pct * w))
        const y = Math.max(0, Math.min(h, m.y0Pct * h))
        const rw = Math.max(1, Math.min(w, (m.x1Pct - m.x0Pct) * w))
        const rh = Math.max(1, Math.min(h, (m.y1Pct - m.y0Pct) * h))
        const el = document.createElement('div')
        el.style.position = 'absolute'
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        el.style.width = `${rw}px`
        el.style.height = `${rh}px`
        const c = color || 'rgba(59,130,246,1)'
        el.style.background = c.replace('1)', '.20)')
        el.style.outline = `2px solid ${c}`
        el.style.borderRadius = '2px'
        el.style.pointerEvents = 'none'
        overlay.appendChild(el)
      }
    }
  }

  function drawFixedDebugRect(pageNum: number, hostRef: React.RefObject<HTMLDivElement>) {
    const overlay = ensureOverlayForPage(pageNum, hostRef)
    if (!overlay) return
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = `10px`
    el.style.top = `10px`
    el.style.width = `40px`
    el.style.height = `20px`
    el.style.background = 'rgba(220,38,38,.20)'
    el.style.outline = '2px solid rgba(220,38,38,1)'
    el.style.borderRadius = '2px'
    el.style.pointerEvents = 'none'
    overlay.appendChild(el)
  }

  return {
    ocrInspect,
    setOcrInspect,
    ocrDrag,
    setOcrDrag,
    lastOcrMatchesRef,
    loadOcrPageText,
    ensureOverlayForPage,
    drawOcrRects,
    drawFixedDebugRect
  }
}
