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
// Rimuove spazi multipli e normalizza per la ricerca
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')  // Sostituisci spazi multipli con uno solo
    .trim()
}

// Helper per normalizzare testo rimuovendo TUTTI gli spazi (per matchare OCR con spazi tra lettere)
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')  // Rimuovi TUTTI gli spazi per matchare anche OCR con spazi tra lettere
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

        console.log('[SEARCH][ARCHIVE][START]', {
          query,
          normalizedQ,
          docId,
          limit
        })

        // 1. Gestione file LOCALI (temp:)
        const isLocalFile = docId && docId.startsWith('temp:')
        let localDocInfo: { s3Key: string; filename: string; text: string; layout?: any[] } | null = null

        if (isLocalFile && docId) {
          // Estrai s3Key da docId (temp:local:timestamp:random -> local:timestamp:random)
          const s3Key = docId.replace(/^temp:/, '')
          console.log('[SEARCH][ARCHIVE][LOCAL] Checking local file', { docId, s3Key })

          const ocrResult = getLocalOcrResult(s3Key)
          console.log('[SEARCH][ARCHIVE][LOCAL] OCR result', {
            s3Key,
            hasResult: !!ocrResult,
            hasTexts: !!(ocrResult && ocrResult.texts),
            textsLength: ocrResult?.texts?.length,
            status: ocrResult?.status
          })

          if (ocrResult && ocrResult.texts) {
            // File locale con OCR completato: usa testo dalla memoria
            const text = ocrResult.texts.join('\n')
            localDocInfo = {
              s3Key,
              filename: s3Key.split(':').pop() || 'documento locale',
              text,
              layout: ocrResult.layout
            }
            console.log('[SEARCH][archive][local] Found in memory', { s3Key, textLength: text.length, textStart: text.substring(0, 200) })
            fastify.log.info({ msg: '[SEARCH][archive][local] Found in memory', s3Key, textLength: text.length })
          } else {
            // File locale senza OCR: prova a leggere testo nativo dal file
            console.log('[SEARCH][ARCHIVE][LOCAL] No OCR result, trying native text extraction', { s3Key })
            try {
              const sanitizedKey = sanitizeFileName(s3Key)
              const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
              const filePath = path.join(uploadsDir, sanitizedKey)

              console.log('[SEARCH][ARCHIVE][LOCAL] File path', { sanitizedKey, filePath, exists: fs.existsSync(filePath) })

              if (fs.existsSync(filePath)) {
                const nativeText = await extractNativeText(filePath)
                console.log('[SEARCH][ARCHIVE][LOCAL] Native text extraction', {
                  s3Key,
                  hasText: !!nativeText,
                  textLength: nativeText?.length,
                  textStart: nativeText?.substring(0, 200)
                })
                if (nativeText) {
                  localDocInfo = {
                    s3Key,
                    filename: s3Key.split(':').pop() || 'documento locale',
                    text: nativeText,
                    layout: []
                  }
                  console.log('[SEARCH][archive][local] Native text extracted', { s3Key, textLength: nativeText.length })
                  fastify.log.info({ msg: '[SEARCH][archive][local] Native text extracted', s3Key, textLength: nativeText.length })
                } else {
                  console.log('[SEARCH][ARCHIVE][LOCAL] No native text found', { s3Key })
                }
              } else {
                console.log('[SEARCH][ARCHIVE][LOCAL] File does not exist', { s3Key, filePath })
              }
            } catch (e: any) {
              console.error('[SEARCH][ARCHIVE][LOCAL] Error extracting native text', { s3Key, error: e?.message, stack: e?.stack })
              fastify.log.warn({ msg: '[SEARCH][archive][local] Failed to read file', s3Key, error: e?.message })
            }
          }
        }

        console.log('[SEARCH][ARCHIVE][LOCAL] Final localDocInfo', {
          hasLocalDoc: !!localDocInfo,
          textLength: localDocInfo?.text?.length,
          hasLayout: !!(localDocInfo?.layout && localDocInfo.layout.length > 0)
        })

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
            // Usa normalizeForSearch per rimuovere tutti gli spazi (gestisce OCR con spazi tra lettere)
            const normalizedTextForSearch = normalizeForSearch(localDocInfo.text)
            const normalizedQueryForSearch = normalizeForSearch(query)

            // Mantieni anche il testo normalizzato normale per snippet (preserva spazi)
            const normalizedText = normalize(localDocInfo.text)

            console.log('[SEARCH][LOCAL][NORMALIZE]', {
              originalTextSample: localDocInfo.text.substring(0, 150),
              normalizedTextSample: normalizedText.substring(0, 150),
              normalizedForSearchSample: normalizedTextForSearch.substring(0, 150),
              query,
              normalizedQ,
              normalizedQueryForSearch
            })

            const occurrences: number[] = []
            let startIdx = 0
            while (true) {
              const idx = normalizedTextForSearch.indexOf(normalizedQueryForSearch, startIdx)
              if (idx === -1) break
              occurrences.push(idx)
              startIdx = idx + 1
            }

            console.log('[SEARCH][LOCAL][OCCURRENCES-FOUND]', {
              totalOccurrences: occurrences.length,
              firstOccurrence: occurrences[0],
              firstOccurrences: occurrences.slice(0, 5),
              normalizedTextForSearchStart: normalizedTextForSearch.substring(0, 200),
              firstOccurrenceContext: occurrences[0] ? normalizedTextForSearch.substring(Math.max(0, occurrences[0] - 50), occurrences[0] + 100) : null
            })

            if (occurrences.length > 0) {
              // Processa occorrenze con layout se disponibile
              const layout = localDocInfo.layout || []
              const hasLayout = layout.length > 0

              // LOG DIAGNOSTICO SOLO ALL'INIZIO
              console.log('[SEARCH][LOCAL][DIAGNOSTIC]', {
                totalOccurrences: occurrences.length,
                firstOccurrenceCharIdx: occurrences[0],
                query,
                normalizedQueryForSearch,
                originalTextStart200: localDocInfo.text.substring(0, 200),
                normalizedForSearchStart200: normalizedTextForSearch.substring(0, 200),
                queryAtStartIndex: normalizedTextForSearch.indexOf(normalizedQueryForSearch),
                hasLayout
              })

              // OTTIMIZZAZIONE: crea array di mapping UNA SOLA VOLTA prima del loop
              // mappingArray[charIdx] = posizione nel testo originale
              const maxCharIdx = Math.max(...occurrences)
              const mappingArray: number[] = new Array(maxCharIdx + 1).fill(0)
              let nonSpaceCount = 0

              console.log('[SEARCH][LOCAL][BUILD-MAPPING]', {
                textLength: localDocInfo.text.length,
                maxCharIdx,
                buildingMapping: true
              })

              for (let i = 0; i < localDocInfo.text.length; i++) {
                const char = localDocInfo.text[i]
                const normalizedChar = normalizeForSearch(char)
                if (normalizedChar.length > 0) {
                  nonSpaceCount += normalizedChar.length
                  // Salva la posizione originale per ogni charIdx raggiunto
                  if (nonSpaceCount <= maxCharIdx) {
                    mappingArray[nonSpaceCount] = i + 1
                  }
                }
              }

              // Riempiamo i buchi nell'array (se un charIdx non è stato mappato, usa il valore precedente)
              let lastMapped = 0
              for (let idx = 0; idx <= maxCharIdx; idx++) {
                if (mappingArray[idx] > 0) {
                  lastMapped = mappingArray[idx]
                } else if (lastMapped > 0) {
                  mappingArray[idx] = lastMapped
                }
              }

              console.log('[SEARCH][LOCAL][MAPPING-BUILT]', {
                mappingSize: mappingArray.length,
                firstFew: mappingArray.slice(0, 50).filter(v => v > 0),
                lastMapped
              })

              for (let occIdx = 0; occIdx < occurrences.length; occIdx++) {
                // charIdx è la posizione nel testo SENZA spazi (normalizedTextForSearch)
                const charIdx = occurrences[occIdx]

                // LOG SOLO PER LA PRIMA OCCORRENZA
                if (occIdx === 0) {
                  console.log('[SEARCH][LOCAL][FIRST-OCC]', { charIdx })
                }

                // OTTIMIZZATO: lookup O(1) invece di loop O(n)
                const mappedCharIdx = mappingArray[charIdx] || 0

                if (occIdx === 0) {
                  console.log('[SEARCH][LOCAL][FIRST-MAP]', {
                    charIdx,
                    mappedCharIdx,
                    originalTextAtMappedIdx: localDocInfo.text.substring(Math.max(0, mappedCharIdx - 30), mappedCharIdx + 100)
                  })
                }

                let foundPage = 1
                let pageTextRaw = localDocInfo.text
                let pageTextNormalized = normalizedText
                let accumulatedNormalized = 0
                let accumulatedMapped = 0

                if (hasLayout) {
                  // Calcola accumulated sul testo normalizzato per allineamento corretto
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []
                    const pageText = words.map((w: any) => w.text || '').join(' ')
                    const pageTextNorm = normalize(pageText)
                    const pageTextNormForSearch = normalizeForSearch(pageText)
                    const pageLen = pageText.length
                    const pageLenNormForSearch = pageTextNormForSearch.length

                    if (charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNormForSearch) {
                      foundPage = pageIdx + 1
                      pageTextRaw = pageText
                      pageTextNormalized = pageTextNorm
                      break
                    }
                    accumulatedNormalized += pageLenNormForSearch
                    accumulatedMapped += pageLen
                  }
                } else {
                  // Per PDF nativo senza layout: usa l'intero testo
                  foundPage = Math.floor(charIdx / 2000) + 1
                  pageTextNormalized = normalizedText
                  pageTextRaw = localDocInfo.text
                  accumulatedNormalized = 0
                  accumulatedMapped = 0
                }

                // Usa mappedCharIdx per estrarre snippet dal testo originale
                const localCharIdxMapped = mappedCharIdx - accumulatedMapped
                const snippetStart = Math.max(0, localCharIdxMapped - 50)
                const snippetEnd = Math.min(pageTextRaw.length, localCharIdxMapped + query.length + 100)
                let snippet = pageTextRaw.slice(snippetStart, snippetEnd)

                // LOG SOLO PER LA PRIMA OCCORRENZA
                if (occIdx === 0) {
                  console.log('[SEARCH][LOCAL][FIRST-SNIPPET]', {
                    snippetStart,
                    snippetEnd,
                    snippet: snippet.substring(0, 150),
                    queryInSnippet: normalizeForSearch(snippet).includes(normalizedQueryForSearch)
                  })
                }

                // Bbox approssimativa
                let x0Pct = 0, y0Pct = 0, x1Pct = 100, y1Pct = 100
                if (hasLayout && layout[foundPage - 1]) {
                  const pageWords = layout[foundPage - 1].words || []
                  const matchingWords: any[] = []
                  let charCountNormForSearch = 0
                  for (const w of pageWords) {
                    const wText = w.text || ''
                    const wTextNormForSearch = normalizeForSearch(wText)
                    const wStart = charCountNormForSearch
                    const wEnd = charCountNormForSearch + wTextNormForSearch.length

                    if (wEnd >= charIdx && wStart < charIdx + normalizedQueryForSearch.length) {
                      matchingWords.push(w)
                    }
                    charCountNormForSearch += wTextNormForSearch.length
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
                  charIdx: localCharIdxMapped,
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
                firstOccurrence: occurrences[0],
                firstOccurrences: occurrences.slice(0, 5),
                textSample: normalizedText.substring(0, 200),
                firstOccurrenceContext: occurrences[0] ? normalizedText.substring(Math.max(0, occurrences[0] - 50), occurrences[0] + 100) : null
              })

              if (occurrences.length === 0) continue

              const hasLayout = layout && Array.isArray(layout) && layout.length > 0

              // Per ogni occorrenza, trova la pagina e bbox
              for (let occIdx = 0; occIdx < occurrences.length; occIdx++) {
                const charIdx = occurrences[occIdx]
                console.log('[DEBUG][LOOP][START]', {
                  docId: doc.id,
                  filename: doc.filename,
                  occIndex: occIdx,
                  isFirst: occIdx === 0,
                  charIdx,
                  hasLayout,
                  query: normalizedQ,
                  charIdxContext: normalizedText.substring(Math.max(0, charIdx - 30), charIdx + 50)
                })

                let accumulatedNormalized = 0
                let foundPage = -1
                let pageWords: any[] = []
                let pageTextRaw = ''
                let pageTextNormalized = ''

                if (hasLayout) {
                  // Trova in quale pagina si trova il carattere (usando testo normalizzato per allineamento)
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []
                    const pageText = words.map((w: any) => w.text || '').join(' ')
                    const pageTextNorm = normalize(pageText)
                    const pageLenNorm = pageTextNorm.length

                    console.log('[DEBUG][LOOP][PAGE-CHECK]', {
                      docId: doc.id,
                      occIndex: occIdx,
                      pageIdx: pageIdx + 1,
                      accumulatedNormalized,
                      pageLenNorm,
                      charIdx,
                      inRange: charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNorm,
                      pageTextStart: pageText.substring(0, 100),
                      pageTextNormStart: pageTextNorm.substring(0, 100)
                    })

                    if (charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNorm) {
                      foundPage = pageIdx + 1
                      pageWords = words
                      pageTextRaw = pageText
                      pageTextNormalized = pageTextNorm

                      console.log('[DEBUG][LOOP][LAYOUT-FOUND]', {
                        docId: doc.id,
                        occIndex: occIdx,
                        charIdx,
                        foundPage,
                        accumulatedNormalized,
                        pageTextRawLength: pageTextRaw.length,
                        pageTextNormalizedLength: pageTextNormalized.length,
                        pageTextRawStart: pageTextRaw.substring(0, 150),
                        pageTextNormStart: pageTextNormalized.substring(0, 150),
                        charIdxInPage: charIdx - accumulatedNormalized
                      })
                      break
                    }
                    accumulatedNormalized += pageLenNorm + 1 // +1 per lo spazio tra pagine
                  }
                } else {
                  // PDF nativo senza layout: usa l'intero testo, non una finestra scorrevole
                  // Questo garantisce che la prima occorrenza sia effettivamente all'inizio
                  foundPage = Math.floor(charIdx / 2000) + 1

                  // Usa l'intero testo normalizzato e originale per il calcolo corretto
                  pageTextNormalized = normalizedText
                  pageTextRaw = searchableText
                  accumulatedNormalized = 0  // Nessun offset, partiamo dall'inizio

                  console.log('[DEBUG][LOOP][NATIVE]', {
                    docId: doc.id,
                    occIndex: occIdx,
                    charIdx,
                    foundPage,
                    pageTextRawLength: pageTextRaw.length,
                    pageTextNormalizedLength: pageTextNormalized.length,
                    searchableTextLength: searchableText.length,
                    accumulatedNormalized,
                    normalizedTextStart: normalizedText.substring(0, 200),
                    originalTextStart: searchableText.substring(0, 200)
                  })
                }

                if (foundPage === -1) {
                  console.log('[DEBUG][LOOP][SKIP]', { docId: doc.id, charIdx, reason: 'foundPage=-1' })
                  continue
                }

                // Trova le bbox delle parole che matchano
                const localCharIdx = charIdx - accumulatedNormalized
                const qLen = query.length

                console.log('[DEBUG][LOOP][SNIPPET-CALC]', {
                  docId: doc.id,
                  occIndex: occIdx,
                  charIdx,
                  accumulatedNormalized,
                  localCharIdx,
                  qLen,
                  pageTextNormalizedLength: pageTextNormalized.length
                })

                // Snippet: estrai dal testo normalizzato per allineamento perfetto
                const snippetStart = Math.max(0, localCharIdx - 20)
                const snippetEnd = Math.min(pageTextNormalized.length, localCharIdx + qLen + 80)
                let snippet = pageTextNormalized.slice(snippetStart, snippetEnd)

                console.log('[DEBUG][LOOP][SNIPPET-NORM]', {
                  docId: doc.id,
                  occIndex: occIdx,
                  snippetStart,
                  snippetEnd,
                  snippet: snippet.substring(0, 100),
                  queryInSnippet: snippet.toLowerCase().includes(normalizedQ.toLowerCase()),
                  charIdxInSnippet: localCharIdx - snippetStart
                })

                // Prova a mappare al testo originale per snippet più leggibile
                // Cerca il testo normalizzato nel testo originale (approssimato)
                const snippetSearch = snippet.toLowerCase().substring(0, Math.min(30, snippet.length))
                const snippetInOriginal = pageTextRaw.toLowerCase().indexOf(snippetSearch)

                console.log('[DEBUG][LOOP][SNIPPET-MAP]', {
                  docId: doc.id,
                  occIndex: occIdx,
                  snippetSearch: snippetSearch.substring(0, 50),
                  snippetInOriginal,
                  pageTextRawStart: pageTextRaw.substring(0, 150),
                  found: snippetInOriginal >= 0
                })

                if (snippetInOriginal >= 0 && snippetInOriginal + snippet.length < pageTextRaw.length) {
                  const originalSnippet = pageTextRaw.slice(snippetInOriginal, snippetInOriginal + snippet.length)
                  console.log('[DEBUG][LOOP][SNIPPET-FINAL]', {
                    docId: doc.id,
                    occIndex: occIdx,
                    usingOriginal: true,
                    originalSnippet: originalSnippet.substring(0, 100)
                  })
                  snippet = originalSnippet
                } else {
                  console.log('[DEBUG][LOOP][SNIPPET-FINAL]', {
                    docId: doc.id,
                    occIndex: occIdx,
                    usingOriginal: false,
                    normalizedSnippet: snippet.substring(0, 100)
                  })
                }

                // Trova bbox approssimativa (basata sulle parole)
                // Usa testo normalizzato per allineamento corretto con localCharIdx
                const matchingWords: any[] = []
                let charCountNorm = 0
                for (const w of pageWords) {
                  const wText = w.text || ''
                  const wTextNorm = normalize(wText)
                  const wStart = charCountNorm
                  const wEnd = charCountNorm + wTextNorm.length

                  if (wEnd >= localCharIdx && wStart < localCharIdx + qLen) {
                    matchingWords.push(w)
                  }
                  charCountNorm += wTextNorm.length + 1
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

