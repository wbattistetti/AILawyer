import { execa } from 'execa'
import path from 'path'
import fs from 'fs/promises'
import fss from 'fs'
import { createRequire } from 'module'
import { extractNativeText } from './extractNativeText'
import * as Canvas from 'canvas'

const require = createRequire(import.meta.url)
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js') as { getDocument: any }

// Funzione helper per bin Poppler
function bin(name: string): string {
  const POPPLER = process.env.POPPLER_PATH || ''
  const ext = process.platform === 'win32' ? '.exe' : ''
  return POPPLER ? path.join(POPPLER, name + ext) : name
}

/**
 * Ritaglia un'immagine PNG al primo terzo superiore usando canvas
 * Esportata per essere usata dal servizio OCR
 */
export async function cropImageTopThird(pngPath: string): Promise<string> {
  const img = await Canvas.loadImage(pngPath)
  const width = img.width
  const height = Math.floor(img.height / 3) // Primo terzo

  const canvas = Canvas.createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Disegna solo il primo terzo dell'immagine originale
  ctx.drawImage(img, 0, 0, width, height, 0, 0, width, height)

  // Salva l'immagine ritagliata sovrascrivendo l'originale
  const buffer = canvas.toBuffer('image/png')
  await fs.writeFile(pngPath, buffer)

  return pngPath
}

/**
 * Estrae l'oggetto da un PDF leggendo le prime pagine
 * Cerca "Oggetto:" o "Oggetto :" (case-insensitive) e estrae il testo dopo
 *
 * @param pdfPath - Path assoluto al file PDF
 * @param hasNativeText - Se true, usa estrazione testo nativo, altrimenti OCR
 * @param maxPages - Numero massimo di pagine da leggere (default: 3)
 * @returns L'oggetto trovato o null
 */
export async function extractObject(
  pdfPath: string,
  hasNativeText: boolean,
  maxPages: number = 3
): Promise<string | null> {
  const filename = pdfPath.split(/[/\\]/).pop()
  console.log('[EXTRACT][object][START]', { filename, hasNativeText, maxPages })

  try {
    let text = ''

    if (hasNativeText) {
      // Estrai testo nativo dalle prime pagine usando pdf.js o pdftotext
      const buffer = await fs.readFile(pdfPath)
      const uint8Array = new Uint8Array(buffer)

      const loadingTask = getDocument({
        data: uint8Array,
        disableWorker: true,
        isEvalSupported: false,
        useWorkerFetch: false
      })
      const pdfDoc = await loadingTask.promise

      const totalPages = Math.min(pdfDoc.numPages, maxPages)
      const pages: string[] = []

      // Prova prima con pdftotext (più veloce e accurato)
      try {
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const { stdout } = await execa(bin('pdftotext'), [
            '-layout',
            '-f', String(pageNum),
            '-l', String(pageNum),
            pdfPath,
            '-'
          ], {
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            shell: false,
            windowsHide: true
          })
          pages.push(stdout.trim())
        }
        text = pages.join('\n')
      } catch (pdftotextError) {
        // Fallback a pdf.js
        console.log('[EXTRACT][object][FALLBACK-PDFJS]', { filename })
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
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
        }
        text = pages.join('\n')
      }

      await pdfDoc.cleanup()
    } else {
      // Per PDF senza testo nativo, dovremmo usare OCR, ma per velocità
      // proviamo comunque con pdftotext (potrebbe funzionare se il PDF è leggibile)
      try {
        const buffer = await fs.readFile(pdfPath)
        const uint8Array = new Uint8Array(buffer)

        const loadingTask = getDocument({
          data: uint8Array,
          disableWorker: true,
          isEvalSupported: false,
          useWorkerFetch: false
        })
        const pdfDoc = await loadingTask.promise

        const totalPages = Math.min(pdfDoc.numPages, maxPages)
        const pages: string[] = []

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          try {
            const { stdout } = await execa(bin('pdftotext'), [
              '-layout',
              '-f', String(pageNum),
              '-l', String(pageNum),
              pdfPath,
              '-'
            ], {
              maxBuffer: 1024 * 1024 * 10,
              shell: false,
              windowsHide: true
            })
            pages.push(stdout.trim())
          } catch {
            // Se pdftotext fallisce, prova con pdf.js (potrebbe essere una scansione)
            const page = await pdfDoc.getPage(pageNum)
            const textContent = await page.getTextContent()
            const pageText = textContent.items
              .map((item: any) => item.str || '')
              .filter(Boolean)
              .join(' ')
            pages.push(pageText)
          }
        }

        text = pages.join('\n')
        await pdfDoc.cleanup()
      } catch (error) {
        // Se pdftotext e pdf.js falliscono, usa OCR limitato alle prime pagine
        // con crop al primo terzo per velocità
        console.log('[EXTRACT][object][ocr-start]', { filename, maxPages })

        try {
          // Importa servizi
          const { ocrService } = await import('../services/ocr.js')

          // Copia il file in uploads/ se necessario
          const sanitizeFileName = (key: string) => key.replace(/[:<>"|?*\\]/g, '_')
          const tempS3Key = `local:${sanitizeFileName(pdfPath)}`
          const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
          const sanitizedKey = sanitizeFileName(tempS3Key)
          const targetPath = path.join(uploadsDir, sanitizedKey)

          if (!fss.existsSync(targetPath)) {
            await fs.mkdir(path.dirname(targetPath), { recursive: true })
            await fs.copyFile(pdfPath, targetPath)
            console.log('[EXTRACT][object][ocr-copied]', { pdfPath, targetPath })
          }

          // Processa TUTTE le prime N pagine insieme (più efficiente) con crop al primo terzo
          const prevLimit = process.env.OCR_LIMIT_PAGES
          const prevQuick = process.env.OCR_QUICK_MODE
          const prevCrop = process.env.OCR_CROP_TOP_THIRD

          try {
            // Quick mode per velocità + limita alle prime pagine + crop al primo terzo
            process.env.OCR_QUICK_MODE = 'true'
            process.env.OCR_LIMIT_PAGES = String(maxPages)
            process.env.OCR_CROP_TOP_THIRD = 'true' // Flag per ritagliare al primo terzo

            console.log('[EXTRACT][object][ocr-process]', { filename, maxPages, cropTopThird: true })

            const result = await ocrService.extract(sanitizedKey, async () => {})

            // Estrai testo di tutte le pagine processate
            const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
            const allText = pagesArr
              .map((p: any) => typeof p?.text === 'string' ? p.text : '')
              .join('\n\n')

            console.log('[EXTRACT][object][ocr-text]', {
              filename,
              pagesProcessed: pagesArr.length,
              textLength: allText.length,
              textHead: allText.substring(0, 150)
            })

            // Cerca "Oggetto:" nel testo estratto
            const regex = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i
            const match = allText.match(regex)

            if (match && match[1]) {
              const oggetto = match[1].trim()
              console.log('[EXTRACT][object][SUCCESS]', {
                filename,
                oggetto: oggetto.substring(0, 150),
                oggettoLength: oggetto.length
              })
              return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
            }

            console.log('[EXTRACT][object][NOT_FOUND]', { filename, maxPages })
            return null
          } catch (ocrError: any) {
            console.error('[EXTRACT][object][ocr-error]', {
              filename,
              error: ocrError?.message || String(ocrError)
            })
            return null
          } finally {
            // Ripristina env
            process.env.OCR_LIMIT_PAGES = prevLimit
            process.env.OCR_QUICK_MODE = prevQuick
            if (prevCrop !== undefined) {
              process.env.OCR_CROP_TOP_THIRD = prevCrop
            } else {
              delete process.env.OCR_CROP_TOP_THIRD
            }
          }
        } catch (ocrSetupError: any) {
          console.error('[EXTRACT][object][ocr-setup-error]', {
            filename,
            error: ocrSetupError?.message || String(ocrSetupError)
          })
          return null
        }
      }
    }

    // Cerca "Oggetto:" nel testo (case-insensitive) e cattura tutto fino alla prossima linea vuota
    const regex = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i
    const match = text.match(regex)

    if (match && match[1]) {
      const oggetto = match[1].trim()

      // Log per debug
      console.log('[EXTRACT][object][SUCCESS]', {
        filename,
        oggetto: oggetto.substring(0, 150),
        oggettoLength: oggetto.length
      })

      // Se l'oggetto è molto lungo, limitalo a 200 caratteri
      return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
    }

    console.log('[EXTRACT][object][NOT_FOUND]', { filename })
    return null
  } catch (error) {
    console.error('[EXTRACT][object][ERROR]', {
      filename,
      error: (error as Error).message,
      stack: (error as Error).stack
    })
    return null
  }
}

