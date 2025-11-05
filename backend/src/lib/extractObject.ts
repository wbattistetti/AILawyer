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
  // Crop silenzioso (log rimossi per ridurre verbosità)
  try {
    const img = await Canvas.loadImage(pngPath)
    const originalWidth = img.width
    const originalHeight = img.height
    const croppedHeight = Math.floor(originalHeight / 3) // Primo terzo

    const canvas = Canvas.createCanvas(originalWidth, croppedHeight)
    const ctx = canvas.getContext('2d')

    // Disegna solo il primo terzo dell'immagine originale
    ctx.drawImage(img, 0, 0, originalWidth, croppedHeight, 0, 0, originalWidth, croppedHeight)

    // Salva l'immagine ritagliata sovrascrivendo l'originale
    const buffer = canvas.toBuffer('image/png')
    await fs.writeFile(pngPath, buffer)

    return pngPath
  } catch (error: any) {
    // Log solo errori reali
    console.error('[CROP][error]', {
      pngPath: pngPath.split(/[/\\]/).pop(),
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Estrae l'oggetto da un PDF leggendo le prime pagine
 * Cerca "Oggetto:" o "Oggetto :" (case-insensitive) e estrae il testo dopo
 * Per PDF OCR, usa crop al primo terzo superiore di ogni pagina per velocità
 *
 * @param pdfPath - Path assoluto al file PDF
 * @param hasNativeText - Se true, usa estrazione testo nativo, altrimenti OCR
 * @param maxPages - Numero massimo di pagine da leggere (default: 4)
 * @returns L'oggetto trovato o null
 */
export async function extractObject(
  pdfPath: string,
  hasNativeText: boolean,
  maxPages: number = 4 // ✅ Aumentato da 3 a 4 per maggiore copertura
): Promise<string | null> {
  const filename = pdfPath.split(/[/\\]/).pop()
  // Nessun log iniziale - solo log se trovato o se errore

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
        // Fallback a pdf.js (silenzioso)
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
      // Per PDF senza testo nativo (hasNativeText: false), usa DIRETTAMENTE OCR
      // Non proviamo pdftotext/pdf.js perché sappiamo già che non ha testo nativo
      console.log('[EXTRACT][object][ocr-start]', {
        filename,
        hasNativeText,
        maxPages,
        reason: 'hasNativeText is false - using OCR directly'
      })

      // Usa OCR direttamente - importa il servizio OCR
      try {
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
        }

        // Salva le variabili d'ambiente attuali
        const prevLimit = process.env.OCR_LIMIT_PAGES
        const prevQuick = process.env.OCR_QUICK_MODE
        const prevCrop = process.env.OCR_CROP_TOP_THIRD
        const prevDpi = process.env.OCR_DPI_BASE

        try {
          // Configura OCR per estrazione oggetto: quick mode, prime pagine, DPI alto, crop al primo terzo
          process.env.OCR_QUICK_MODE = 'true'
          process.env.OCR_LIMIT_PAGES = String(maxPages)
          process.env.OCR_DPI_BASE = '400' // DPI più alto per migliore qualità OCR
          process.env.OCR_CROP_TOP_THIRD = 'true' // ✅ RIATTIVATO: crop al primo terzo per velocità

          console.log('[EXTRACT][object][ocr-calling]', { filename, sanitizedKey })
          const result = await ocrService.extract(sanitizedKey, async () => {})
          console.log('[EXTRACT][object][ocr-result]', {
            filename,
            hasResult: !!result,
            hasPages: !!(result as any)?.pages,
            pagesCount: Array.isArray((result as any)?.pages) ? (result as any).pages.length : 0
          })

          // Estrai testo di tutte le pagine processate
          const pagesArr: any[] = Array.isArray((result as any).pages) ? (result as any).pages : []
          const allText = pagesArr
            .map((p: any, idx: number) => {
              const pageText = typeof p?.text === 'string' ? p.text : ''
              return pageText
            })
            .join('\n\n')

          // DEBUG: Log diagnostico per capire perché non trova l'oggetto
          console.log('[EXTRACT][object][ocr-process]', {
            filename,
            pagesProcessed: pagesArr.length,
            totalTextLength: allText.length,
            pagesWithText: pagesArr.filter((p: any) => p?.text && p.text.trim().length > 0).length,
            firstPageLength: pagesArr[0]?.text?.length || 0,
            firstPagePreview: pagesArr[0]?.text?.substring(0, 200).replace(/\n/g, '\\n') || '(vuoto)',
            // Cerca "oggetto" in tutto il testo (case-insensitive)
            containsOggetto: /oggetto/i.test(allText),
            // Prova anche varianti (tutto maiuscolo, con spazi strani)
            containsOGGETTO: /OGGETTO/i.test(allText),
            // Cerca pattern comuni nel testo estratto
            textPreview: allText.substring(0, 500).replace(/\n/g, '\\n')
          })

          // Verifica se contiene "oggetto" (solo per log)
          const containsOggetto = /oggetto/i.test(allText)

          // Regex più tollerante per testo OCR (tollera spazi irregolari e caratteri speciali)
          // Pattern 1: più permissiva - tollera spazi e caratteri tra "oggetto" e ":"
          const regexPermissive = /oggetto[:\s]+(.+?)(?:\n\s*\n|$)/is
          const matchPermissive = allText.match(regexPermissive)

          if (matchPermissive && matchPermissive[1]) {
            const oggetto = matchPermissive[1].trim()
            console.log('[EXTRACT][object][SUCCESS]', {
              filename,
              pattern: 'permissive',
              oggetto: oggetto.substring(0, 150),
              oggettoLength: oggetto.length
            })
            return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
          }

          // Pattern 2: ancora più permissiva - tollera fino a 5 caratteri tra "oggetto" e ":"
          const regexVeryPermissive = /oggetto.{0,5}[:\s]+(.+?)(?:\n\s*\n|$)/is
          const matchVeryPermissive = allText.match(regexVeryPermissive)

          if (matchVeryPermissive && matchVeryPermissive[1]) {
            const oggetto = matchVeryPermissive[1].trim()
            console.log('[EXTRACT][object][SUCCESS]', {
              filename,
              pattern: 'very-permissive',
              oggetto: oggetto.substring(0, 150),
              oggettoLength: oggetto.length
            })
            return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
          }

          // Pattern 3: originale (fallback)
          const regexOriginal = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i
          const matchOriginal = allText.match(regexOriginal)

          if (matchOriginal && matchOriginal[1]) {
            const oggetto = matchOriginal[1].trim()
            console.log('[EXTRACT][object][SUCCESS]', {
              filename,
              pattern: 'original',
              oggetto: oggetto.substring(0, 150),
              oggettoLength: oggetto.length
            })
            return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
          }

          // Log solo se contiene "oggetto" ma la regex non ha funzionato (per debug)
          if (containsOggetto) {
            // DEBUG DETTAGLIATO: mostra il contesto intorno a "oggetto" per capire perché non matcha
            const oggettoIndex = allText.toLowerCase().indexOf('oggetto')
            const contextStart = Math.max(0, oggettoIndex - 50)
            const contextEnd = Math.min(allText.length, oggettoIndex + 200)
            const context = allText.substring(contextStart, contextEnd)

            console.log('[EXTRACT][object][NOT_FOUND]', {
              filename,
              textLength: allText.length,
              oggettoIndex,
              context: context.replace(/\n/g, '\\n'),
              // Prova tutte le regex manualmente per vedere quale pattern potrebbe funzionare
              testPermissive: regexPermissive.test(allText),
              testVeryPermissive: regexVeryPermissive.test(allText),
              testOriginal: regexOriginal.test(allText)
            })
          }
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
          if (prevDpi !== undefined) {
            process.env.OCR_DPI_BASE = prevDpi
          } else {
            delete process.env.OCR_DPI_BASE
          }
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

    // Cerca "Oggetto:" nel testo (case-insensitive) e cattura tutto fino alla prossima linea vuota
    const regex = /oggetto\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\n|$)/i
    const match = text.match(regex)

    if (match && match[1]) {
      const oggetto = match[1].trim()
      // Log solo se trovato (per PDF con testo nativo)
      if (hasNativeText) {
        console.log('[EXTRACT][object][SUCCESS]', {
          filename,
          oggetto: oggetto.substring(0, 100),
          oggettoLength: oggetto.length
        })
      }
      // Se l'oggetto è molto lungo, limitalo a 200 caratteri
      return oggetto.length > 200 ? oggetto.substring(0, 200) + '...' : oggetto
    }

    // Log rimosso - troppo verboso (la maggior parte dei PDF non ha "oggetto")
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

