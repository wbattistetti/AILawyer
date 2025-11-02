/**
 * Estrae il testo di una pagina specifica dal testo OCR completo
 * Gestisce sia documenti temporanei che documenti nel database
 */
export async function extractPageText(docId: string, pageNumber: number): Promise<string | null> {
  try {
    let raw = ''
    let doc: any = null

    // ✅ Gestione documenti temporanei (temp:)
    if (docId.startsWith('temp:')) {
      const hashPrefix = docId.replace(/^temp:/, '')

      // Prima prova a recuperare da window.__archiveData
      const archiveData = (window as any).__archiveData
      if (archiveData && archiveData.documenti) {
        doc = archiveData.documenti.find((d: any) => d.id === docId)
        if (doc && doc.ocrText) {
          raw = String(doc.ocrText || '')
        }
      }

      // Se non trovato in __archiveData, chiama endpoint backend per OCR locale
      if (!raw) {
        try {
          const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
          const response = await fetch(`${API_BASE}/ocr/get-local-text/${encodeURIComponent(hashPrefix)}`)
          if (response.ok) {
            const data = await response.json()
            if (data.texts && Array.isArray(data.texts)) {
              // Unisci tutte le pagine con il separatore standard
              raw = data.texts.join('\n\f\n')
            } else if (data.text && typeof data.text === 'string') {
              raw = data.text
            }
          }
        } catch (fetchErr) {
          console.warn('[extractPageText] Failed to fetch local OCR text:', fetchErr)
          return null
        }
      }
    } else {
      // ✅ Documento normale nel database
      const { api } = await import('@/lib/api')
      doc = await api.getDocumento(docId)
      raw = String(doc?.ocrText || '')
    }

    if (!raw || !raw.trim()) {
      return null
    }

    // ✅ CORREZIONE: Usa la stessa logica di useOcrInspector per garantire coerenza
    // Prova prima a ricostruire da layout se disponibile
    let textFromLayout = ''
    try {
      const layoutRaw: any = doc?.ocrLayout
      const arr = Array.isArray(layoutRaw)
        ? layoutRaw
        : (() => {
            try {
              return typeof layoutRaw === 'string' ? JSON.parse(layoutRaw || '[]') : []
            } catch {
              return []
            }
          })()

      const lay = arr.find((p: any) => p?.page === pageNumber) || arr[pageNumber - 1]

      if (lay && Array.isArray(lay.words) && lay.words.length > 0) {
        const ws = lay.words.filter((w: any) => w && String(w.text || '').trim())
        const hasIdx = ws.every((w: any) =>
          Number.isFinite(w.b) && Number.isFinite(w.p) && Number.isFinite(w.l) && Number.isFinite(w.wi)
        )

        if (hasIdx) {
          // Ordina per indici (block, paragraph, line, word)
          const sorted = ws.slice().sort((a: any, b: any) =>
            (a.b || 0) - (b.b || 0) ||
            (a.p || 0) - (b.p || 0) ||
            (a.l || 0) - (b.l || 0) ||
            (a.wi || 0) - (b.wi || 0)
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
          // Fallback: ordina per coordinate geometriche
          type Word = { x0: number; x1: number; y0: number; y1: number; text: string }
          const words = (ws as Word[])
          const withMid = words.map(w => ({
            ...w,
            xMid: (w.x0 + w.x1) / 2,
            yMid: (w.y0 + w.y1) / 2,
            h: (w.y1 - w.y0)
          }))
          withMid.sort((a, b) => a.yMid === b.yMid ? a.x0 - b.x0 : a.yMid - b.yMid)

          const hs = withMid.map(w => w.h).filter(n => n > 0)
          const medH = hs.length ? [...hs].sort((a, b) => a - b)[Math.floor(hs.length / 2)] : 0.02
          const thrY = Math.max(0.003, medH * 0.35)

          type Line = { y: number; parts: typeof withMid }
          const lines: any[] = []
          for (const w of withMid) {
            const last = lines[lines.length - 1]
            if (!last || Math.abs(last.y - w.yMid) > thrY) {
              lines.push({ y: w.yMid, parts: [w] })
            } else {
              last.parts.push(w)
              last.y = (last.y * (last.parts.length - 1) + w.yMid) / last.parts.length
            }
          }
          for (const ln of lines) {
            ln.parts.sort((p: any, q: any) => p.x0 - q.x0)
          }
          const texts = lines
            .sort((a, b) => a.y - b.y)
            .map(ln => ln.parts.map((p: any) => String(p.text || '').trim()).join(' '))
          textFromLayout = texts
            .map(t => t.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n')
        }
      }
    } catch (err) {
      console.warn('[extractPageText] Error reconstructing from layout:', err)
    }

    let text = ''

    // ✅ Priorità 1: Usa ricostruzione da layout se disponibile
    if (textFromLayout && textFromLayout.trim()) {
      text = textFromLayout
    } else if (raw) {
      // ✅ Priorità 2: Estrai dal testo raw usando separatori
      // Usa separatore esatto del backend ("\n\f\n"), fallback a solo form-feed
      const primary = raw.split(/\n\f\n/g)
      const fallback = raw.split(/\f/g)

      // ✅ CORREZIONE: Usa il separatore che produce più parti (più probabile sia corretto)
      // NON filtrare parti vuote qui - mantieni corrispondenza indice-pagina
      const parts = primary.length >= fallback.length ? primary : fallback

      const idx = pageNumber - 1
      if (idx >= 0 && idx < parts.length) {
        text = String(parts[idx] || '').trim()

        // ✅ CORREZIONE CRITICA: Se il testo contiene ancora separatori, significa che
        // la pagina contiene accidentalmente testo di altre pagine.
        // In questo caso, prendi SOLO la parte PRIMA del primo separatore.
        if (text.includes('\n\f\n')) {
          // Il separatore principale è \n\f\n, quindi splitta e prendi solo la prima parte
          const splitResult = text.split(/\n\f\n/g)
          if (splitResult.length > 1) {
            console.warn('[extractPageText] Page text contains page separator, truncating', {
              pageNumber,
              originalLength: text.length,
              truncatedLength: splitResult[0].length
            })
            text = splitResult[0].trim()
          }
        } else if (text.includes('\f') && !text.includes('\n\f\n')) {
          // Il separatore è solo \f, splitta e prendi solo la prima parte
          const splitResult = text.split(/\f/g)
          if (splitResult.length > 1) {
            console.warn('[extractPageText] Page text contains form-feed separator, truncating', {
              pageNumber,
              originalLength: text.length,
              truncatedLength: splitResult[0].length
            })
            text = splitResult[0].trim()
          }
        }

        // ✅ CORREZIONE AGGIUNTIVA: Verifica che il testo non sia troppo lungo rispetto al previsto
        // Se il testo è eccessivamente lungo, potrebbe contenere più pagine
        // (heuristic: una pagina tipicamente non supera i 50KB di testo OCR)
        const MAX_REASONABLE_PAGE_SIZE = 50000
        if (text.length > MAX_REASONABLE_PAGE_SIZE) {
          console.warn('[extractPageText] Page text suspiciously long, might contain multiple pages', {
            pageNumber,
            textLength: text.length,
            preview: text.substring(0, 200)
          })
          // In questo caso, prova a trovare una separazione più naturale
          // Cerca pattern comuni di fine pagina (es. numeri di pagina, intestazioni ripetute)
          const pageBreakPattern = /\n{3,}|\r\n{3,}|(?:\n|\\r\\n)Page\s+\d+(?:\n|\\r\\n)/i
          const match = text.search(pageBreakPattern)
          if (match > 0 && match < text.length / 2) {
            text = text.substring(0, match).trim()
          }
        }
      }
    }

    return text || null
  } catch (err) {
    console.error('[extractPageText] Error:', err)
    return null
  }
}

