import { execa } from 'execa'
import path from 'path'
import fs from 'fs/promises'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

// Funzione helper per bin Poppler (come in ocr-poppler.ts)
function bin(name: string): string {
  const POPPLER = process.env.POPPLER_PATH || ''
  const ext = process.platform === 'win32' ? '.exe' : ''
  return POPPLER ? path.join(POPPLER, name + ext) : name
}

// Funzione fallback con pdf.js (metodo originale migliorato)
async function extractWithPdfJs(pdfPath: string): Promise<string> {
  const filename = pdfPath.split(/[/\\]/).pop()
  console.log('[EXTRACT][native-text][FALLBACK-PDFJS]', { filename })

  const buffer = await fs.readFile(pdfPath)
  const uint8Array = new Uint8Array(buffer)

  const loadingTask = getDocument({
    data: uint8Array,
    disableWorker: true,
    isEvalSupported: false,
    useWorkerFetch: false
  })
  const pdfDoc = await loadingTask.promise

  const pages: string[] = []

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()

    const pageText = textContent.items
      .reduce((acc: string, item: any, index: number) => {
        const str = item.str || ''
        if (!str) return acc

        if (acc === '') return str

        const prevItem = textContent.items[index - 1]
        if (!prevItem) return acc + ' ' + str

        const currX = item.transform?.[4] || 0
        const prevX = prevItem.transform?.[4] || 0
        const currY = item.transform?.[5] || 0
        const prevY = prevItem.transform?.[5] || 0
        const prevWidth = prevItem.width || 0

        const distance = currX - (prevX + prevWidth)
        const sameLine = Math.abs(currY - prevY) < 2

        if (!sameLine || item.hasEOL || prevItem.hasEOL) {
          return acc + '\n' + str
        }

        const isSameWord = distance < 2 && distance >= -1
        if (isSameWord) {
          return acc + str
        }

        return acc + ' ' + str
      }, '')

    pages.push(pageText)

    if (pageNum % 10 === 0) {
      console.log('[EXTRACT][native-text][progress]', { filename, page: pageNum, totalPages: pdfDoc.numPages })
    }
  }

  await pdfDoc.cleanup()
  // ✅ Usa lo stesso separatore dell'OCR: \n\f\n
  return pages.join('\n\f\n')
}

export async function extractNativeText(pdfPath: string): Promise<string> {
  const filename = pdfPath.split(/[/\\]/).pop()

  // PROVA PRIMA: usa pdftotext (più veloce e accurato)
  try {
    console.log('[EXTRACT][native-text][START]', { filename, path: pdfPath, method: 'poppler-pdftotext' })

    // ✅ PRIMA: ottieni il numero di pagine dal PDF
    const buffer = await fs.readFile(pdfPath)
    const uint8Array = new Uint8Array(buffer)
    const loadingTask = getDocument({
      data: uint8Array,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false
    })
    const pdfDoc = await loadingTask.promise
    const numPages = pdfDoc.numPages
    await pdfDoc.cleanup()

    // ✅ Estrai testo pagina per pagina con pdftotext
    const pages: string[] = []
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const { stdout } = await execa(bin('pdftotext'), [
        '-layout',   // Preserva layout (gestisce meglio spacing)
        '-f', String(pageNum),  // Pagina iniziale
        '-l', String(pageNum),  // Pagina finale
        pdfPath,
        '-'          // Output su stdout
      ], {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
        shell: false,
        windowsHide: true
      })
      pages.push(stdout.trim())
    }

    // ✅ Usa lo stesso separatore dell'OCR: \n\f\n
    const fullText = pages.join('\n\f\n')

    const extractedLength = fullText.length
    console.log('[EXTRACT][native-text][SUCCESS]', {
      filename,
      method: 'poppler-pdftotext',
      extractedLength,
      numPages: pages.length,
      preview: fullText.substring(0, 100)
    })

    return fullText
  } catch (error) {
    // FALLBACK: se pdftotext fallisce, usa pdf.js (metodo originale)
    console.warn('[EXTRACT][native-text][FALLBACK]', {
      filename,
      error: (error as Error).message,
      fallingBackTo: 'pdf.js'
    })

    try {
      const fullText = await extractWithPdfJs(pdfPath)
      const extractedLength = fullText.trim().length
      console.log('[EXTRACT][native-text][SUCCESS]', {
        filename,
        method: 'pdf.js-fallback',
        extractedLength,
        preview: fullText.substring(0, 100)
      })
      return fullText
    } catch (fallbackError) {
      console.error('[EXTRACT][native-text][ERROR]', {
        filename,
        popplerError: (error as Error).message,
        pdfjsError: (fallbackError as Error).message,
        stack: (fallbackError as Error).stack
      })
      return ''
    }
  }
}

