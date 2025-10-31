import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/database'
import { storageService } from '../lib/storage'
import { extractNativeText } from '../lib/extractNativeText'
import { getLocalOcrResult } from './ocr.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import path from 'path'
import fs from 'fs'

// Configura worker per pdf.js
if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js'
}

// Cache in memoria per testi documenti DB (approccio ibrido)
// Map: docId -> { text: string, layout?: any, hasNativeText: boolean, timestamp: number }
const documentTextCache = new Map<string, { text: string; layout?: any; hasNativeText: boolean; timestamp: number }>()

// Helper per normalizzare il testo (uguale al frontend)
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Helper per sanitizzare nome file (come in upload.ts e ocr.ts)
function sanitizeFileName(key: string): string {
  return key.replace(/[:<>"|?*\\]/g, '_')
}

export async function searchRoutes(fastify: FastifyInstance) {

  // Ricerca globale in tutti i documenti dell'archivio
  fastify.get<{ Querystring: { q?: string; limit?: string; docId?: string } }>(
    '/search/archive',
    async (request, reply) => {
      try {
        const query = (request.query.q || '').trim()
        if (!query) {
          return reply.status(400).send({ error: 'Query mancante' })
        }

        const limit = parseInt(request.query.limit || '50', 10)
        const docId = request.query.docId // Parametro opzionale per filtrare un documento specifico
        const normalizedQ = normalize(query)

        fastify.log.info({ msg: '[SEARCH][archive] start', query, normalizedQ, limit, docId })

        // APPROCCIO IBRIDO: ricerca in memoria + database

        // 1. Gestione file LOCALI (temp:)
        const isLocalFile = docId && docId.startsWith('temp:')
        let localDocInfo: { s3Key: string; filename: string; text: string; layout?: any[] } | null = null

        if (isLocalFile && docId) {
          // Estrai s3Key da docId (temp:local:timestamp:random -> local:timestamp:random)
          const s3Key = docId.replace(/^temp:/, '')
          const ocrResult = getLocalOcrResult(s3Key)

          if (ocrResult && ocrResult.texts) {
            // File locale con OCR completato: usa testo dalla memoria
            const text = ocrResult.texts.join('\n')
            localDocInfo = {
              s3Key,
              filename: s3Key.split(':').pop() || 'documento locale',
              text,
              layout: ocrResult.layout
            }
            fastify.log.info({ msg: '[SEARCH][archive][local] Found in memory', s3Key, textLength: text.length })
          } else {
            // File locale senza OCR: prova a leggere testo nativo dal file
            try {
              const sanitizedKey = sanitizeFileName(s3Key)
              const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
              const filePath = path.join(uploadsDir, sanitizedKey)

              if (fs.existsSync(filePath)) {
                const nativeText = await extractNativeText(filePath)
                if (nativeText) {
                  localDocInfo = {
                    s3Key,
                    filename: s3Key.split(':').pop() || 'documento locale',
                    text: nativeText,
                    layout: []
                  }
                  fastify.log.info({ msg: '[SEARCH][archive][local] Native text extracted', s3Key, textLength: nativeText.length })
                }
              }
            } catch (e: any) {
              fastify.log.warn({ msg: '[SEARCH][archive][local] Failed to read file', s3Key, error: e?.message })
            }
          }
        }

        // 2. Trova documenti DB (solo se non è specificato docId locale)
        const documenti = isLocalFile ? [] : await prisma.documento.findMany({
          where: {
            // Se docId è specificato, filtra solo quel documento
            ...(docId ? { id: docId } : {}),
            OR: [
              // Documenti con OCR completato
              {
                ocrStatus: 'completed',
                NOT: { ocrText: null }
              },
              // PDF nativi con text layer
              {
                hasNativeText: true
              }
            ]
          },
          select: {
            id: true,
            filename: true,
            s3Key: true,
            ocrText: true,
            ocrLayout: true,
            hasNativeText: true
          }
        })

        fastify.log.info({ msg: '[SEARCH][archive] candidate docs', dbCount: documenti.length, hasLocal: !!localDocInfo })

        const allMatches: Array<{
          docId: string
          filename: string
          page: number
          snippet: string
          x0Pct: number
          y0Pct: number
          x1Pct: number
          y1Pct: number
          charIdx?: number
          qLen?: number
        }> = []

        let processedCount = 0
        const maxDocsToProcess = 100 // Limite per evitare timeout

        // 3. Cerca nel file locale se presente
        if (localDocInfo) {
          try {
            const normalizedText = normalize(localDocInfo.text)
            const occurrences: number[] = []
            let startIdx = 0
            while (true) {
              const idx = normalizedText.indexOf(normalizedQ, startIdx)
              if (idx === -1) break
              occurrences.push(idx)
              startIdx = idx + 1
            }

            if (occurrences.length > 0) {
              // Processa occorrenze con layout se disponibile
              const layout = localDocInfo.layout || []
              const hasLayout = layout.length > 0

              for (const charIdx of occurrences) {
                let foundPage = 1
                let pageTextRaw = localDocInfo.text
                let accumulated = 0

                if (hasLayout) {
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []
                    const pageText = words.map((w: any) => w.text || '').join(' ')
                    const pageLen = pageText.length

                    if (charIdx >= accumulated && charIdx < accumulated + pageLen) {
                      foundPage = pageIdx + 1
                      pageTextRaw = pageText
                      break
                    }
                    accumulated += pageLen + 1
                  }
                } else {
                  foundPage = Math.floor(charIdx / 2000) + 1
                }

                const localCharIdx = charIdx - accumulated
                const snippetStart = Math.max(0, localCharIdx - 20)
                const snippetEnd = Math.min(pageTextRaw.length, localCharIdx + query.length + 80)
                const snippet = pageTextRaw.slice(snippetStart, snippetEnd)

                // Bbox approssimativa
                let x0Pct = 0, y0Pct = 0, x1Pct = 100, y1Pct = 100
                if (hasLayout && layout[foundPage - 1]) {
                  const pageWords = layout[foundPage - 1].words || []
                  const matchingWords: any[] = []
                  let charCount = 0
                  for (const w of pageWords) {
                    const wText = w.text || ''
                    const wStart = charCount
                    const wEnd = charCount + wText.length

                    if (wEnd >= localCharIdx && wStart < localCharIdx + query.length) {
                      matchingWords.push(w)
                    }
                    charCount += wText.length + 1
                  }

                  if (matchingWords.length > 0) {
                    const xs = matchingWords.map(w => w.x0Pct).filter((x: number) => typeof x === 'number')
                    const ys = matchingWords.map(w => w.y0Pct).filter((y: number) => typeof y === 'number')
                    const x1s = matchingWords.map(w => w.x1Pct).filter((x: number) => typeof x === 'number')
                    const y1s = matchingWords.map(w => w.y1Pct).filter((y: number) => typeof y === 'number')

                    if (xs.length > 0) {
                      x0Pct = Math.min(...xs)
                      y0Pct = Math.min(...ys)
                      x1Pct = Math.max(...x1s)
                      y1Pct = Math.max(...y1s)
                    }
                  }
                }

                allMatches.push({
                  docId: docId!,
                  filename: localDocInfo.filename,
                  page: foundPage,
                  snippet: '...' + snippet + '...',
                  x0Pct,
                  y0Pct,
                  x1Pct,
                  y1Pct,
                  charIdx: localCharIdx,
                  qLen: query.length
                })
              }

              fastify.log.info({ msg: '[SEARCH][archive][local] Found matches', count: occurrences.length, docId })
            }
          } catch (error: any) {
            fastify.log.error({ msg: '[SEARCH][archive][local] Error', error: error?.message, docId })
          }
        }

        // 4. Per ogni documento DB, cerca in cache prima, poi carica se necessario
        for (const doc of documenti) {
          if (processedCount >= maxDocsToProcess) {
            fastify.log.warn({ msg: '[SEARCH][archive] Max docs limit reached', limit: maxDocsToProcess })
            break
          }
          try {
            // APPROCCIO IBRIDO: cerca prima in cache
            let searchableText = ''
            let layout: any = null
            let fromCache = false

            const cached = documentTextCache.get(doc.id)
            if (cached) {
              // Usa cache (veloce!)
              searchableText = cached.text
              layout = cached.layout
              fromCache = true
              fastify.log.debug({ msg: '[SEARCH][archive][cache] Hit', docId: doc.id })
            } else {
              // Non in cache: carica dal DB o estrai
              searchableText = (doc.ocrText || '') as string

              // Se è nativo ma non ha ocrText, ESTRAI ORA e salva nel DB
              if (doc.hasNativeText && !searchableText) {
                fastify.log.info({ msg: '[SEARCH][archive][native] Extracting text...', docId: doc.id, filename: doc.filename })

                try {
                  // Ottieni percorso file dal storage
                  const pdfPath = storageService.getLocalPath(doc.s3Key)

                  // Estrai testo dal PDF nativo
                  searchableText = await extractNativeText(pdfPath)

                  if (searchableText) {
                    // Salva nel DB per le prossime ricerche
                    await prisma.documento.update({
                      where: { id: doc.id },
                      data: { ocrText: searchableText }
                    })

                    fastify.log.info({
                      msg: '[SEARCH][archive][native] Text extracted and saved to DB',
                      docId: doc.id,
                      filename: doc.filename,
                      length: searchableText.length
                    })

                    // 🔍 DEBUG: Mostra primo estratto con codici carattere
                    const sample = searchableText.substring(0, 150)
                    console.log('[DEBUG][EXTRACTED][SAMPLE]', {
                      docId: doc.id,
                      filename: doc.filename,
                      sample,
                      sampleWithCodes: sample.split('').map((c, i) => `${c}(${c.charCodeAt(0)})`).slice(0, 30).join(' ')
                    })
                  } else {
                    fastify.log.warn({ msg: '[SEARCH][archive][native] No text extracted', docId: doc.id })
                    continue
                  }
                } catch (extractError) {
                  fastify.log.error({
                    msg: '[SEARCH][archive][native] Extraction failed',
                    docId: doc.id,
                    error: (extractError as Error).message
                  })
                  continue
                }
              }

              // Carica layout se disponibile
              if (!fromCache && doc.ocrLayout) {
                layout = typeof doc.ocrLayout === 'string'
                  ? (() => { try { return JSON.parse(doc.ocrLayout) } catch { return [] } })()
                  : (doc.ocrLayout || [])
              }

              // Salva in cache per le prossime ricerche (sia testo estratto che DB)
              if (!fromCache && searchableText) {
                documentTextCache.set(doc.id, {
                  text: searchableText,
                  layout: layout || [],
                  hasNativeText: doc.hasNativeText || false,
                  timestamp: Date.now()
                })
                fastify.log.debug({ msg: '[SEARCH][archive][cache] Added', docId: doc.id, textLength: searchableText.length })
              }

              const normalizedText = normalize(searchableText)

              // 🔍 DEBUG: Confronto query vs testo
              console.log('[DEBUG][SEARCH][COMPARISON]', {
                docId: doc.id,
                filename: doc.filename,
                query,
                normalizedQuery: normalizedQ,
                textSample: searchableText.substring(0, 200),
                normalizedTextSample: normalizedText.substring(0, 200),
                queryLength: normalizedQ.length,
                textLength: normalizedText.length,
                // Cerca manualmente la query
                containsQuery: normalizedText.includes(normalizedQ),
                indexOfQuery: normalizedText.indexOf(normalizedQ),
                // Mostra dove appare "catania" (case-insensitive)
                indexOfCatania: normalizedText.indexOf('catania'),
                // Cerca con spazi
                indexOfCAtania: normalizedText.indexOf('c atania')
              })

              // Cerca tutte le occorrenze (nessun limite)
              let startIdx = 0
              const occurrences: number[] = []
              while (true) {
                const idx = normalizedText.indexOf(normalizedQ, startIdx)
                if (idx === -1) break
                occurrences.push(idx)
                startIdx = idx + 1
              }

              console.log('[DEBUG][SEARCH][OCCURRENCES]', {
                docId: doc.id,
                filename: doc.filename,
                query: normalizedQ,
                foundOccurrences: occurrences.length,
                positions: occurrences
              })

              if (occurrences.length === 0) continue

              const hasLayout = layout && Array.isArray(layout) && layout.length > 0

              // Per ogni occorrenza, trova la pagina e bbox
              for (const charIdx of occurrences) {
                console.log('[DEBUG][LOOP][START]', { docId: doc.id, filename: doc.filename, charIdx, hasLayout })

                let accumulated = 0
                let foundPage = -1
                let pageWords: any[] = []
                let pageTextRaw = ''

                if (hasLayout) {
                  // Trova in quale pagina si trova il carattere (usando ocrLayout)
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []
                    const pageText = words.map((w: any) => w.text || '').join(' ')
                    const pageLen = pageText.length

                    if (charIdx >= accumulated && charIdx < accumulated + pageLen) {
                      foundPage = pageIdx + 1
                      pageWords = words
                      pageTextRaw = pageText
                      break
                    }
                    accumulated += pageLen + 1 // +1 per lo spazio tra pagine
                  }
                  console.log('[DEBUG][LOOP][LAYOUT]', { docId: doc.id, charIdx, foundPage, accumulated, pageTextRawLength: pageTextRaw.length })
                } else {
                  // PDF nativo senza layout: pagina stimata + snippet dal testo grezzo
                  // Stima pagina: assumendo ~2000 caratteri per pagina
                  foundPage = Math.floor(charIdx / 2000) + 1
                  const substringStart = Math.max(0, charIdx - 500)
                  pageTextRaw = searchableText.substring(substringStart, charIdx + 500)
                  accumulated = substringStart  // Memorizza l'offset per calcolare localCharIdx corretto
                  console.log('[DEBUG][LOOP][NATIVE]', {
                    docId: doc.id,
                    charIdx,
                    foundPage,
                    pageTextRawLength: pageTextRaw.length,
                    searchableTextLength: searchableText.length,
                    substringStart,
                    accumulated
                  })
                }

                if (foundPage === -1) {
                  console.log('[DEBUG][LOOP][SKIP]', { docId: doc.id, charIdx, reason: 'foundPage=-1' })
                  continue
                }

                // Trova le bbox delle parole che matchano
                const localCharIdx = charIdx - accumulated
                const qLen = query.length

                // Snippet: dal carattere precedente il match fino a +100 char
                const snippetStart = Math.max(0, localCharIdx - 20)
                const snippetEnd = Math.min(pageTextRaw.length, localCharIdx + qLen + 80)
                const snippet = pageTextRaw.slice(snippetStart, snippetEnd)

                // Trova bbox approssimativa (basata sulle parole)
                const matchingWords: any[] = []
                let charCount = 0
                for (const w of pageWords) {
                  const wText = w.text || ''
                  const wStart = charCount
                  const wEnd = charCount + wText.length

                  if (wEnd >= localCharIdx && wStart < localCharIdx + qLen) {
                    matchingWords.push(w)
                  }
                  charCount += wText.length + 1
                }

                let x0Pct = 0, y0Pct = 0, x1Pct = 100, y1Pct = 100
                if (matchingWords.length > 0) {
                  const xs = matchingWords.map(w => w.x0Pct).filter((x: number) => typeof x === 'number')
                  const ys = matchingWords.map(w => w.y0Pct).filter((y: number) => typeof y === 'number')
                  const x1s = matchingWords.map(w => w.x1Pct).filter((x: number) => typeof x === 'number')
                  const y1s = matchingWords.map(w => w.y1Pct).filter((y: number) => typeof y === 'number')

                  if (xs.length > 0) {
                    x0Pct = Math.min(...xs)
                    y0Pct = Math.min(...ys)
                    x1Pct = Math.max(...x1s)
                    y1Pct = Math.max(...y1s)
                  }
                }

                console.log('[DEBUG][LOOP][PUSH]', {
                  docId: doc.id,
                  charIdx,
                  page: foundPage,
                  snippetPreview: snippet.substring(0, 50),
                  localCharIdx,
                  accumulated
                })

                allMatches.push({
                  docId: doc.id,
                  filename: doc.filename,
                  page: foundPage,
                  snippet: '...' + snippet + '...',
                  x0Pct,
                  y0Pct,
                  x1Pct,
                  y1Pct,
                  charIdx: localCharIdx,
                  qLen
                })
              }
            }
          } catch (error) {
            console.error('[DEBUG][LOOP][ERROR]', {
              docId: doc.id,
              filename: doc.filename,
              error: (error as Error).message,
              stack: (error as Error).stack
            })
            fastify.log.warn({ msg: '[SEARCH][archive] error processing doc', docId: doc.id, error })
          } finally {
            processedCount++
          }
        }

        fastify.log.info({ msg: '[SEARCH][archive] done', totalMatches: allMatches.length, processedDocs: processedCount })

        return {
          query,
          total: allMatches.length,
          matches: allMatches
        }

      } catch (error: any) {
        fastify.log.error(error)
        return reply.status(500).send({ error: 'Errore durante la ricerca', details: error?.message })
      }
    }
  )
}

