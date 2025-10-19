import { api } from '../../../../lib/api'
import { logger } from '../../../../utils/logger'
import type { MatchItem } from '../hooks/usePdfSearch'

// Search using backend OCR text/layout when PDF has no native text
export async function searchViaOcrBackend(docId: string, qRaw: string): Promise<MatchItem[]> {
  try {
    const doc: any = await api.getDocumento(docId)
    const layout = Array.isArray(doc?.ocrLayout)
      ? doc.ocrLayout
      : (() => {
          try { return JSON.parse(doc?.ocrLayout || '[]') } catch { return [] }
        })()
    const sep = '\f'
    const pagesText: string[] = String(doc?.ocrText || '').split(sep)
    logger.debug('OCR[data][pages]', { pagesWithText: pagesText.length, pagesWithLayout: Array.isArray(layout) ? layout.length : 0 })
    const out: MatchItem[] = []
    const needle = (qRaw || '').toLowerCase()

    for (let p = 0; p < Math.max(pagesText.length, layout.length); p++) {
      const pageIdx = p
      const pageTextRaw = String(pagesText[p] || '')
      // Normalize accents/case to match common inputs with/without maiuscole e apostrofi
      const normalize = (s: string) => s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[''`´]/g, "'")
        .toLowerCase()
      const pageText = normalize(pageTextRaw)
      const pageLayout = layout[p] || {}
      let words: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }> = pageLayout.words || []
      const width = pageLayout.width || pageLayout.imgW || 0
      const height = pageLayout.height || pageLayout.imgH || 0
      console.log('[OCR][page][raw]', { 
        page: pageIdx + 1, 
        textLen: pageTextRaw.length, 
        wordsLen: words?.length || 0, 
        width, 
        height,
        layoutKeys: Object.keys(pageLayout),
        firstWord: words[0] || null
      })
      logger.debug('OCR[page][stats]', { page: pageIdx + 1, textLen: pageTextRaw.length, words: words?.length || 0, width, height })
      if (!pageText) continue

      // NO FALLBACK: se mancano bbox, skippa la pagina
      if (!words.length || !width || !height) {
        console.log('[OCR][page][SKIP]', { page: pageIdx + 1, reason: 'no words', layoutKeys: Object.keys(pageLayout) })
        continue
      }

      // Search in page text
      const idx = pageText.indexOf(needle)
      if (idx === -1) continue

      // Find word boundaries around the match
      const beforeMatch = pageText.substring(0, idx)
      const afterMatch = pageText.substring(idx + needle.length)
      const wordStart = beforeMatch.lastIndexOf(' ') + 1
      const wordEnd = afterMatch.indexOf(' ')
      const wordEndPos = wordEnd === -1 ? afterMatch.length : wordEnd
      const matchText = pageText.substring(wordStart, idx + needle.length + wordEndPos)

      // Find corresponding word in layout
      const matchWord = words.find(w => {
        const wordText = normalize(w.text)
        return wordText.includes(needle)
      })

      if (matchWord) {
        const x0Pct = matchWord.x0 / width
        const y0Pct = matchWord.y0 / height
        const x1Pct = matchWord.x1 / width
        const y1Pct = matchWord.y1 / height

        out.push({
          id: `ocr-${pageIdx}-${out.length}`,
          docId,
          docTitle: doc.title || 'Documento',
          kind: 'pdf',
          page: pageIdx + 1,
          q: qRaw,
          x0Pct,
          y0Pct,
          x1Pct,
          y1Pct,
          charIdx: idx,
          qLength: needle.length,
          snippet: matchText,
          score: 0
        })
      }
    }

    console.log('[SEARCH][ocr][done]', { count: out.length })
    return out
  } catch (error) {
    console.error('[SEARCH][ocr][error]', error)
    return []
  }
}
