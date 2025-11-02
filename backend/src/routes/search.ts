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

// Helper per estrarre snippet basato su righe complete (evita tagli arbitrari)
// Per OCR: mostra SOLO la riga che contiene la stringa (confini \n o \r), senza unire righe
// Per nativo: unisce righe consecutive brevi per formare frasi logiche complete
function extractLineBasedSnippet(text: string, charPosition: number, maxLength: number = 200, isOcr: boolean = false): string {
  if (!text || charPosition < 0 || charPosition >= text.length) {
    return ''
  }

  // Trova l'inizio della riga che contiene charPosition (confini: \n o \r)
  let lineStart = charPosition
  while (lineStart > 0 && text[lineStart - 1] !== '\n' && text[lineStart - 1] !== '\r') {
    lineStart--
  }

  // Trova la fine della riga che contiene charPosition (confini: \n o \r)
  let lineEnd = charPosition
  while (lineEnd < text.length && text[lineEnd] !== '\n' && text[lineEnd] !== '\r') {
    lineEnd++
  }

  // ✅ PER OCR: mostra SOLO la riga completa, SENZA cercare punteggiatura
  // Semplice: estrai la riga, se troppo lunga taglia mantenendo query visibile
  if (isOcr) {
    let snippet = text.slice(lineStart, lineEnd).trim()

    // Se la riga è troppo lunga (>200 caratteri), taglia mantenendo query visibile
    if (snippet.length > maxLength) {
      const wordPosInLine = charPosition - lineStart

      if (wordPosInLine >= 0 && wordPosInLine < snippet.length) {
        // Mostra 20 caratteri prima della query, poi fino a maxLength
        const startOffset = Math.max(0, wordPosInLine - 20)
        const endOffset = Math.min(snippet.length, startOffset + maxLength)
        const trimmedSnippet = snippet.slice(startOffset, endOffset)

        // Aggiungi ellissi solo se necessario
        if (startOffset > 0 && endOffset < snippet.length) {
          return '...' + trimmedSnippet + '...'
        } else if (startOffset > 0) {
          return '...' + trimmedSnippet
        } else if (endOffset < snippet.length) {
          return trimmedSnippet + '...'
        }
        return trimmedSnippet
      }
    }

    return snippet
  }

  // PER NATIVO: logica esistente con unione righe
  // Estrai la riga iniziale
  let currentLine = text.slice(lineStart, lineEnd).trim()
  let snippetStart = lineStart
  let snippetEnd = lineEnd

  // Se la riga è molto corta, unisci con righe adiacenti brevi
  // Questo gestisce il caso in cui il PDF visualizza una riga ma il testo estratto
  // la divide in più righe (es: "COMANDO\nPROVINCIALE\nDI CATANIA")
  // Gestisce anche casi come "Catania,\nagosto - novembre 2020"
  const minLineLength = 50
  const maxTotalLength = 150
  const maxEmptyLines = 2

  if (currentLine.length < minLineLength) {
    // Unisci con righe precedenti se sono brevi
    let prevLineStart = lineStart - 1
    let consecutiveEmpty = 0
    while (prevLineStart > 0 && currentLine.length < maxTotalLength && consecutiveEmpty < maxEmptyLines) {
      // Salta caratteri di fine riga
      while (prevLineStart > 0 && (text[prevLineStart] === '\n' || text[prevLineStart] === '\r')) {
        prevLineStart--
      }
      if (prevLineStart <= 0) break

      // Trova inizio riga precedente
      let prevStart = prevLineStart
      while (prevStart > 0 && text[prevStart - 1] !== '\n' && text[prevStart - 1] !== '\r') {
        prevStart--
      }

      const prevLine = text.slice(prevStart, prevLineStart).trim()
      // Se la riga precedente è vuota, conta e continua (max 2 righe vuote consecutive)
      if (prevLine.length === 0) {
        consecutiveEmpty++
        prevLineStart = prevStart - 1
        continue
      }
      consecutiveEmpty = 0

      // Se la riga precedente è molto lunga, fermati (stesso limite del totale)
      if (prevLine.length > maxTotalLength) break

      // Unisci: riga precedente + spazio + riga corrente
      currentLine = prevLine + ' ' + currentLine
      snippetStart = prevStart
      prevLineStart = prevStart - 1
    }

    // Unisci con righe successive se sono brevi
    let nextLineEnd = lineEnd + 1
    consecutiveEmpty = 0
    while (nextLineEnd < text.length && currentLine.length < maxTotalLength && consecutiveEmpty < maxEmptyLines) {
      // Salta caratteri di fine riga
      while (nextLineEnd < text.length && (text[nextLineEnd] === '\n' || text[nextLineEnd] === '\r')) {
        nextLineEnd++
      }
      if (nextLineEnd >= text.length) break

      // Trova fine riga successiva
      let nextEnd = nextLineEnd
      while (nextEnd < text.length && text[nextEnd] !== '\n' && text[nextEnd] !== '\r') {
        nextEnd++
      }

      const nextLine = text.slice(nextLineEnd, nextEnd).trim()
      // Se la riga successiva è vuota, conta e continua (max 2 righe vuote consecutive)
      if (nextLine.length === 0) {
        consecutiveEmpty++
        nextLineEnd = nextEnd + 1
        continue
      }
      consecutiveEmpty = 0

      // Se la riga successiva è molto lunga, fermati (stesso limite del totale)
      if (nextLine.length > maxTotalLength) break

      // Unisci: riga corrente + spazio + riga successiva
      currentLine = currentLine + ' ' + nextLine
      snippetEnd = nextEnd
      nextLineEnd = nextEnd + 1
    }
  }

  let snippet = currentLine.trim()
  const originalSnippet = snippet // Salva la riga originale per verificare se abbiamo tagliato
  let startOffset = 0
  let endOffset = snippet.length

  // Se la riga è troppo lunga, taglia MA mantieni sempre la parola cercata visibile
  // Mostra la parola cercata + contesto dopo (non centrare)
  if (snippet.length > maxLength) {
    // Calcola la posizione della parola cercata nella riga corrente
    const wordPosInLine = charPosition - snippetStart

    // Assicurati che la posizione sia valida
    if (wordPosInLine >= 0 && wordPosInLine < snippet.length) {
      // Mostra la parola cercata + contesto dopo (fino a maxLength)
      // 20 caratteri prima per contesto, poi la parola + resto fino a maxLength
      startOffset = Math.max(0, wordPosInLine - 20) // 20 caratteri prima per contesto
      endOffset = Math.min(snippet.length, startOffset + maxLength)
      snippet = snippet.slice(startOffset, endOffset)
    } else {
      // Fallback: se la posizione è fuori range, usa il centro
      const centerPos = Math.max(0, Math.min(snippet.length - 1, wordPosInLine))
      const halfLength = Math.floor(maxLength / 2)
      startOffset = Math.max(0, centerPos - halfLength)
      endOffset = Math.min(snippet.length, startOffset + maxLength)
      snippet = snippet.slice(startOffset, endOffset)
    }
  }

  // Aggiungi puntini SOLO se abbiamo tagliato qualcosa
  // Puntini iniziali solo se abbiamo tagliato l'inizio della riga originale
  // Puntini finali solo se abbiamo tagliato la fine della riga originale
  if (snippet.length < originalSnippet.length) {
    const hadStartTrim = startOffset > 0
    const hadEndTrim = endOffset < originalSnippet.length

    if (hadStartTrim && hadEndTrim) {
      return '...' + snippet + '...'
    } else if (hadStartTrim) {
      return '...' + snippet
    } else if (hadEndTrim) {
      return snippet + '...'
    } else {
      return snippet
    }
  } else {
    return snippet
  }
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
        const whereClause: any = {
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
        }

        // Se docId è specificato, filtra solo quel documento
        if (docId) {
          whereClause.id = docId
        }

        console.log('[SEARCH][archive][query]', {
          docId,
          isLocalFile,
          whereClause
        })

        const documenti = isLocalFile ? [] : await prisma.documento.findMany({
          where: whereClause,
          select: {
            id: true,
            filename: true,
            s3Key: true,
            ocrText: true,
            ocrLayout: true,
            hasNativeText: true,
            ocrStatus: true
          }
        })

        console.log('[SEARCH][archive][query-result]', {
          dbCount: documenti.length,
          requestedDocId: docId,
          documenti: documenti.map((d: any) => ({
            id: d.id.substring(0, 20) + '...',
            filename: d.filename,
            ocrStatus: d.ocrStatus,
            hasOcrText: !!d.ocrText,
            ocrTextLength: d.ocrText?.length || 0,
            hasNativeText: d.hasNativeText
          }))
        })

        // 🔍 DEBUG: Se docId è specificato ma nessun documento trovato, problema nella query!
        if (docId && !isLocalFile && documenti.length === 0) {
          console.warn('[SEARCH][archive][docId-not-found]', {
            docId,
            whereClause,
            note: 'Documento con questo docId non trovato dalla query Prisma. Verifica se esiste nel database e se soddisfa le condizioni OR.'
          })

          // ✅ Verifica se il documento esiste comunque (senza filtri OR) e se ha testo
          try {
            const docExists = await prisma.documento.findUnique({
              where: { id: docId },
              select: {
                id: true,
                filename: true,
                s3Key: true,
                ocrStatus: true,
                ocrText: true,
                ocrLayout: true,
                hasNativeText: true
              }
            })

            if (docExists) {
              console.warn('[SEARCH][archive][docId-exists-but-filtered]', {
                docId,
                filename: docExists.filename,
                ocrStatus: docExists.ocrStatus,
                hasOcrText: !!docExists.ocrText,
                ocrTextLength: docExists.ocrText?.length || 0,
                hasNativeText: docExists.hasNativeText,
                reason: 'Documento esiste ma non soddisfa i filtri OR (ocrStatus=completed OR hasNativeText=true)'
              })

              // ✅ Se il documento esiste ma è stato filtrato, includilo comunque se ha testo o può averlo
              if (docExists.ocrText || docExists.hasNativeText || docExists.ocrStatus === 'completed') {
                console.log('[SEARCH][archive][docId-force-include]', {
                  docId,
                  reason: 'Documento ha testo o può averlo, forziamo inclusione'
                })
                documenti.push(docExists as any)
              }
            } else {
              console.warn('[SEARCH][archive][docId-not-exists]', {
                docId,
                note: 'Il documento con questo docId non esiste nel database.'
              })
            }
          } catch (checkError) {
            console.error('[SEARCH][archive][docId-check-error]', {
              docId,
              error: checkError
            })
          }
        }

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

        // Set per deduplicare snippet identici (normalizzati)
        const seenSnippets = new Set<string>()

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

                // LOG DETTAGLIATO PER LA PRIMA OCCORRENZA
                if (occIdx === 0) {
                  console.log('🔍🔍🔍 [SEARCH][LOCAL][FIRST-OCCURENCE-START] 🔍🔍🔍', {
                    occIdx: 0,
                    charIdx,
                    totalOccurrences: occurrences.length,
                    query: normalizedQueryForSearch,
                    contextAround: normalizedTextForSearch.substring(Math.max(0, charIdx - 100), charIdx + 100)
                  })
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
                // Utilizza extractLineBasedSnippet per mostrare righe complete
                // Passa hasLayout come isOcr: se ha layout, è OCR; altrimenti è nativo
                const localCharIdxMapped = mappedCharIdx - accumulatedMapped
                let snippet = extractLineBasedSnippet(pageTextRaw, localCharIdxMapped, 300, hasLayout)

                // VERIFICA CRITICA: lo snippet DEVE contenere la query cercata
                // Se non la contiene, significa che la mappatura è errata - cerca nelle righe adiacenti
                let snippetNormalizedForSearch = normalizeForSearch(snippet)
                if (!snippetNormalizedForSearch.includes(normalizedQueryForSearch)) {
                  // La mappatura potrebbe essere imprecisa - cerca la query nelle righe vicine
                  // Estrai un contesto più ampio (500 caratteri prima e dopo) e cerca la query
                  const searchStart = Math.max(0, localCharIdxMapped - 500)
                  const searchEnd = Math.min(pageTextRaw.length, localCharIdxMapped + 500)
                  const context = pageTextRaw.slice(searchStart, searchEnd)
                  const contextNormalized = normalizeForSearch(context)
                  const queryPosInContext = contextNormalized.indexOf(normalizedQueryForSearch)

                  if (queryPosInContext >= 0) {
                    // Trovata! Estrai lo snippet dalla posizione corretta nel contesto
                    const correctPos = searchStart + queryPosInContext
                    snippet = extractLineBasedSnippet(pageTextRaw, correctPos, 300, hasLayout)
                    snippetNormalizedForSearch = normalizeForSearch(snippet)

                    // LOG per debug
                    if (occIdx === 0) {
                      console.log('[SEARCH][LOCAL][SNIPPET-CORRECTED]', {
                        originalMapped: localCharIdxMapped,
                        correctedPos: correctPos,
                        snippet: snippet.substring(0, 150)
                      })
                    }
                  }

                  // Se ancora non contiene la query, salta questo risultato
                  if (!snippetNormalizedForSearch.includes(normalizedQueryForSearch)) {
                    console.log('[SEARCH][LOCAL][SNIPPET-FILTER]', {
                      occIdx,
                      charIdx,
                      mappedCharIdx,
                      localCharIdxMapped,
                      snippet: snippet.substring(0, 100),
                      skipped: true
                    })
                    continue // Salta questo risultato - snippet non contiene la query
                  }
                }

                // LOG SOLO PER LA PRIMA OCCORRENZA
                if (occIdx === 0) {
                  console.log('[SEARCH][LOCAL][FIRST-SNIPPET]', {
                    occIdx: 0,
                    charIdx,
                    mappedCharIdx,
                    localCharIdxMapped,
                    snippetLength: snippet.length,
                    snippet: snippet.substring(0, 200),
                    query: normalizedQueryForSearch,
                    queryInSnippet: snippetNormalizedForSearch.includes(normalizedQueryForSearch),
                    snippetNormalized: snippetNormalizedForSearch.substring(0, 150)
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

                // Deduplicazione: verifica se abbiamo già visto questo snippet
                // Per OCR: usa una finestra di contesto attorno alla parola cercata (evita snippet troppo lunghi e quasi identici)
                // Per nativo: usa l'intero snippet normalizzato
                let snippetKey: string
                if (hasLayout) {
                  // OCR: estrai finestra di contesto (50 caratteri prima e dopo la parola cercata nello snippet)
                  const snippetNormalized = normalizeForSearch(snippet)
                  const queryNormalized = normalizedQueryForSearch
                  const queryPos = snippetNormalized.indexOf(queryNormalized)
                  if (queryPos >= 0) {
                    const contextStart = Math.max(0, queryPos - 50)
                    const contextEnd = Math.min(snippetNormalized.length, queryPos + queryNormalized.length + 50)
                    snippetKey = snippetNormalized.slice(contextStart, contextEnd)
                  } else {
                    snippetKey = snippetNormalized.substring(0, 100) // Fallback: primi 100 caratteri
                  }
                } else {
                  // Nativo: usa l'intero snippet normalizzato
                  snippetKey = normalizeForSearch(snippet)
                }

                if (seenSnippets.has(snippetKey)) {
                  // Snippet già presente - salta (evita duplicati)
                  if (occIdx === 0) {
                    console.log('[SEARCH][LOCAL][FIRST-DUPLICATE]', {
                      occIdx: 0,
                      snippetKey: snippetKey.substring(0, 100),
                      snippet: snippet.substring(0, 150),
                      skipped: true
                    })
                  }
                  continue
                }
                seenSnippets.add(snippetKey)

                if (occIdx === 0) {
                  console.log('[SEARCH][LOCAL][FIRST-ADDED]', {
                    occIdx: 0,
                    snippetKey: snippetKey.substring(0, 100),
                    snippet: snippet.substring(0, 150)
                  })
                }

                allMatches.push({
                  id: `${docId}-${foundPage}-${charIdx}`, // ID unico: docId-page-charIdx
                  docId: docId!,
                  filename: localDocInfo.filename,
                  page: foundPage,
                  snippet: snippet, // extractLineBasedSnippet già gestisce i puntini
                  x0Pct,
                  y0Pct,
                  x1Pct,
                  y1Pct,
                  charIdx: localCharIdxMapped,
                  qLen: query.length
                })
              }

              // LOG FINALE: mostra i primi snippet aggiunti per verificare l'ordine
              console.log('✅✅✅ [SEARCH][LOCAL][RESULTS-FINAL] ✅✅✅', {
                totalOccurrences: occurrences.length,
                totalMatchesAdded: allMatches.length,
                first3Matches: allMatches.slice(0, 3).map((m, idx) => ({
                  index: idx,
                  snippet: m.snippet.substring(0, 80),
                  page: m.page,
                  charIdx: m.charIdx
                }))
              })

              fastify.log.info({ msg: '[SEARCH][archive][local] Found matches', count: occurrences.length, docId })
            }
          } catch (error: any) {
            fastify.log.error({ msg: '[SEARCH][archive][local] Error', error: error?.message, docId })
          }
        }

        // 4. Per ogni documento DB, cerca in cache prima, poi carica se necessario
        console.log('[SEARCH][archive][loop-start]', {
          totalDocs: documenti.length,
          query: normalizedQ,
          docId: docId || 'all'
        })

        for (const doc of documenti) {
          console.log('[SEARCH][archive][processing-doc]', {
            docId: doc.id.substring(0, 20) + '...',
            filename: doc.filename,
            ocrStatus: doc.ocrStatus,
            hasOcrText: !!doc.ocrText,
            hasNativeText: doc.hasNativeText,
            processedCount,
            maxDocs: maxDocsToProcess
          })

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

              console.log('[SEARCH][archive][cache-hit]', {
                docId: doc.id.substring(0, 20) + '...',
                searchableTextLength: searchableText?.length || 0,
                hasLayout: !!(layout && Array.isArray(layout) && layout.length > 0)
              })

              // ✅ LOG DIAGNOSTICI DETTAGLIATI PER CACHE
              console.log('[SEARCH][archive][cache-hit-details]', {
                docId: doc.id.substring(0, 20) + '...',
                filename: doc.filename,
                searchableTextType: typeof searchableText,
                searchableTextIsNull: searchableText === null,
                searchableTextIsUndefined: searchableText === undefined,
                searchableTextIsEmpty: searchableText === '',
                searchableTextLength: searchableText?.length || 0,
                hasText: !!searchableText && searchableText.length > 0,
                layoutType: typeof layout,
                layoutIsArray: Array.isArray(layout),
                layoutLength: Array.isArray(layout) ? layout.length : 0,
                cachedObjectKeys: cached ? Object.keys(cached) : [],
                cachedHasText: !!cached?.text,
                cachedTextLength: cached?.text?.length || 0
              })

              // ✅ VERIFICA SE IL TESTO DALLA CACHE È VALIDO
              if (!searchableText || searchableText.length === 0) {
                console.warn('[SEARCH][archive][cache-empty-text]', {
                  docId: doc.id,
                  filename: doc.filename,
                  fromCache: true,
                  searchableTextType: typeof searchableText,
                  searchableTextLength: searchableText?.length || 0,
                  cachedObject: cached ? {
                    hasText: !!cached.text,
                    textLength: cached.text?.length || 0,
                    textType: typeof cached.text
                  } : null,
                  note: 'Testo dalla cache è vuoto/null. Potrebbe essere nativo - verifico hasNativeText.'
                })
                // ✅ NON SALTARE SUBITO - potrebbe essere nativo, verifica dopo
              }

              // ✅ LOG DOPO IL CACHE-HIT - CONFERMA CHE PROCEDE
              console.log('[SEARCH][archive][after-cache-hit]', {
                docId: doc.id.substring(0, 20) + '...',
                filename: doc.filename,
                fromCache: true,
                searchableTextLength: searchableText?.length || 0,
                layoutType: typeof layout,
                layoutLength: Array.isArray(layout) ? layout.length : 0,
                willProceed: true
              })
            } else {
              // Non in cache: carica dal DB o estrai
              // ✅ IMPORTANTE: Leggi ocrText correttamente, gestendo anche JSON o null
              const ocrTextRaw = doc.ocrText
              searchableText = ''

              if (typeof ocrTextRaw === 'string' && ocrTextRaw.length > 0) {
                searchableText = ocrTextRaw
              } else if (ocrTextRaw !== null && ocrTextRaw !== undefined) {
                searchableText = String(ocrTextRaw)
              }

              // 🔍 LOG: Verifica se ocrText è presente quando viene fatta la ricerca
              console.log('[SEARCH][archive][ocrText-check]', {
                docId: doc.id.substring(0, 20) + '...',
                filename: doc.filename,
                ocrStatus: doc.ocrStatus,
                hasOcrText: !!doc.ocrText,
                ocrTextType: typeof doc.ocrText,
                ocrTextLength: doc.ocrText?.length || 0,
                searchableTextLength: searchableText.length,
                ocrTextPreview: searchableText ? searchableText.substring(0, 100) : 'null/undefined',
                fromCache: false,
                cacheSize: documentTextCache.size,
                isInCache: documentTextCache.has(doc.id)
              })

              // ✅ Se ocrStatus è 'completed' ma ocrText è null, PROVA COMUNQUE se haNativeText
              if (doc.ocrStatus === 'completed' && !searchableText) {
                console.warn('[SEARCH][archive][ocrText-missing]', {
                  docId: doc.id,
                  filename: doc.filename,
                  hasNativeText: doc.hasNativeText,
                  note: 'ocrStatus è completed ma ocrText è vuoto/null. Proverò estrazione se hasNativeText=true.'
                })

                // ✅ Non saltare subito: se hasNativeText=true, estraiamo il testo
                if (!doc.hasNativeText) {
                  console.log('[SEARCH][archive][skip-no-native]', {
                    docId: doc.id,
                    filename: doc.filename,
                    reason: 'No ocrText and no hasNativeText, skipping'
                  })
                  continue // Salta solo se non ha nemmeno native text
                }
              }

              // Se non ha testo e non è nativo, salta
              if (!searchableText && !doc.hasNativeText) {
                console.log('[SEARCH][archive][skip-no-text]', {
                  docId: doc.id,
                  filename: doc.filename,
                  reason: 'No searchableText and no hasNativeText'
                })
                continue
              }

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
            }

            // ✅ CODICE COMUNE PER ENTRAMBI I CASI (cache e non-cache) - FUORI DAL BLOCCO IF/ELSE
            // ✅ LOG PRIMA DEL CHECK FINALE
            console.log('[SEARCH][archive][before-text-check]', {
              docId: doc.id.substring(0, 20) + '...',
              filename: doc.filename,
              fromCache,
              searchableTextType: typeof searchableText,
              searchableTextLength: searchableText?.length || 0,
              hasOcrText: !!doc.ocrText,
              hasNativeText: doc.hasNativeText,
              willCheck: true
            })

            // Controlla che searchableText sia valido
            if (!searchableText || searchableText.length === 0) {
              console.warn('[SEARCH][archive][skip-empty-text]', {
                docId: doc.id,
                filename: doc.filename,
                searchableTextLength: searchableText?.length || 0,
                fromCache,
                hasOcrText: !!doc.ocrText,
                hasNativeText: doc.hasNativeText,
                searchableTextType: typeof searchableText,
                searchableTextIsNull: searchableText === null,
                searchableTextIsUndefined: searchableText === undefined,
                note: 'SKIPPING DOCUMENT - searchableText is empty/null'
              })
              continue
            }

            // ✅ LOG DOPO IL CHECK - CONFERMA CHE PROCEDE
            console.log('[SEARCH][archive][after-text-check]', {
              docId: doc.id.substring(0, 20) + '...',
              filename: doc.filename,
              fromCache,
              searchableTextLength: searchableText.length,
              willProceed: true
            })

            // Verifica se ha layout (deve essere fatto DOPO aver caricato layout)
            const hasLayout = layout && Array.isArray(layout) && layout.length > 0

            console.log('[SEARCH][archive][before-normalize]', {
              docId: doc.id.substring(0, 20) + '...',
              hasLayout,
              searchableTextLength: searchableText.length,
              layoutPages: layout && Array.isArray(layout) ? layout.length : 0
            })

            // ✅ STRATEGIA IBRIDA PER OCR:
            // 1. Cerca SENZA spazi (normalizeForSearch) per trovare TUTTE le occorrenze (incluso "DINARDO", "DI  NARDO", etc.)
            // 2. Per snippet: usa il layout per mappare la posizione (senza spazi) al testo originale (con spazi)
            // Per nativo: usa normalize (con spazi) che è più preciso
            const normalizedText = hasLayout ? normalizeForSearch(searchableText) : normalize(searchableText)
            const normalizedQForOccurrences = hasLayout ? normalizeForSearch(query) : normalizedQ

            // 🔍 DEBUG: Confronto query vs testo
            console.log('[DEBUG][SEARCH][COMPARISON]', {
              docId: doc.id,
              filename: doc.filename,
              query,
              normalizedQuery: normalizedQ,
              normalizedQueryForSearch: normalizedQForOccurrences,
              hasLayout,
              textSample: searchableText.substring(0, 200),
              normalizedTextSample: normalizedText.substring(0, 200),
              queryLength: normalizedQForOccurrences.length,
              textLength: normalizedText.length,
              // Cerca manualmente la query
              containsQuery: normalizedText.includes(normalizedQForOccurrences),
              indexOfQuery: normalizedText.indexOf(normalizedQForOccurrences),
              // Mostra dove appare "catania" (case-insensitive)
              indexOfCatania: normalizedText.indexOf('catania'),
              // Cerca con spazi
              indexOfCAtania: normalizedText.indexOf('catania')
            })

            // Cerca tutte le occorrenze (nessun limite)
            let startIdx = 0
            const occurrences: number[] = []
            while (true) {
              const idx = normalizedText.indexOf(normalizedQForOccurrences, startIdx)
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

            // ✅ Per ogni occorrenza, trova la pagina e bbox
            // Conta occorrenze per pagina per mappare correttamente gli snippet
            const occurrencesPerPage = new Map<number, number>() // page -> count
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
                  // ✅ Trova pagina usando normalizeForSearch (SENZA spazi) per OCR
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []
                    const pageText = words.map((w: any) => w.text || '').join(' ')
                    const pageTextNormForSearch = normalizeForSearch(pageText) // SENZA spazi per cercare
                    const pageLenNorm = pageTextNormForSearch.length

                    console.log('[DEBUG][LOOP][PAGE-CHECK]', {
                      docId: doc.id,
                      occIndex: occIdx,
                      pageIdx: pageIdx + 1,
                      accumulatedNormalized,
                      pageLenNorm,
                      charIdx,
                      inRange: charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNorm,
                      pageTextStart: pageText.substring(0, 100),
                      pageTextNormStart: pageTextNormForSearch.substring(0, 100)
                    })

                    if (charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNorm) {
                      foundPage = pageIdx + 1
                      pageWords = words
                      pageTextRaw = pageText // Testo originale CON spazi per snippet
                      pageTextNormalized = normalize(pageText) // Normalizzato CON spazi per snippet
                      const localCharIdxInPage = charIdx - accumulatedNormalized

                      // Conta quante occorrenze ci sono già state trovate in questa pagina (PRIMA di incrementare)
                      const occurrenceIndexInPage = occurrencesPerPage.get(foundPage) || 0
                      occurrencesPerPage.set(foundPage, occurrenceIndexInPage + 1) // Incrementa DOPO aver letto

                      console.log('[DEBUG][LOOP][LAYOUT-FOUND]', {
                        docId: doc.id,
                        occIndex: occIdx,
                        charIdx,
                        foundPage,
                        accumulatedNormalized,
                        occurrenceIndexInPage, // Quale occorrenza in questa pagina (0-based)
                        pageTextRawLength: pageTextRaw.length,
                        pageTextNormalizedLength: pageTextNormalized.length,
                        pageTextNormForSearchLength: pageTextNormForSearch.length,
                        pageTextRawStart: pageTextRaw.substring(0, 150),
                        pageTextNormStart: pageTextNormalized.substring(0, 150),
                        localCharIdxInPage // Posizione nel testo SENZA spazi
                      })
                      break
                    }
                    accumulatedNormalized += pageLenNorm // NO +1, perché non ci sono spazi nel testo normalizzato
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

                // ✅ Calcola localCharIdx DOPO aver trovato la pagina (accumulatedNormalized è ora corretto)
                const localCharIdx = charIdx - accumulatedNormalized
                const qLen = query.length

                console.log('[DEBUG][LOOP][SNIPPET-CALC]', {
                  docId: doc.id,
                  occIndex: occIdx,
                  charIdx,
                  accumulatedNormalized,
                  localCharIdx,
                  qLen,
                  pageTextRawLength: pageTextRaw.length,
                  hasLayout
                })

                // ✅ SNIPPET: trova tutte le occorrenze nella pagina e usa quella corrispondente
                let snippet = ''
                if (hasLayout && pageTextRaw.length > 0) {
                  // Normalizza pageTextRaw SENZA spazi e trova TUTTE le occorrenze della query nella pagina
                  const pageTextNormForSearch = normalizeForSearch(pageTextRaw)
                  const queryNormForSearch = normalizeForSearch(query)

                  // Trova tutte le occorrenze nella pagina
                  const pageOccurrences: number[] = []
                  let searchStart = 0
                  while (true) {
                    const pos = pageTextNormForSearch.indexOf(queryNormForSearch, searchStart)
                    if (pos === -1) break
                    pageOccurrences.push(pos)
                    searchStart = pos + 1
                  }

                  console.log('[DEBUG][LOOP][OCCURRENCES-IN-PAGE]', {
                    docId: doc.id,
                    occIndex: occIdx,
                    foundPage,
                    occurrencesInPage: pageOccurrences.length,
                    occurrenceIndexInPage: (occurrencesPerPage.get(foundPage)! - 1),
                    queryNormForSearch,
                    pageTextNormForSearchLen: pageTextNormForSearch.length,
                    pageTextNormForSearchPreview: pageTextNormForSearch.substring(0, 200),
                    firstOccurrencePos: pageOccurrences[0] || -1
                  })

                  // Usa l'indice dell'occorrenza corrente nella pagina (0-based)
                  const occurrenceIndexInPage = occurrencesPerPage.get(foundPage)! - 1 // -1 perché abbiamo già incrementato
                  const targetOccurrenceIndex = Math.min(occurrenceIndexInPage, pageOccurrences.length - 1)

                  if (pageOccurrences.length > 0 && targetOccurrenceIndex >= 0) {
                    // Posizione nel testo normalizzato (senza spazi)
                    const queryPosInNormalized = pageOccurrences[targetOccurrenceIndex]

                    console.log('[DEBUG][LOOP][TARGET-OCCURRENCE]', {
                      docId: doc.id,
                      occIndex: occIdx,
                      targetOccurrenceIndex,
                      queryPosInNormalized,
                      contextBefore: pageTextNormForSearch.substring(Math.max(0, queryPosInNormalized - 30), queryPosInNormalized),
                      queryAtPos: pageTextNormForSearch.substring(queryPosInNormalized, queryPosInNormalized + queryNormForSearch.length),
                      contextAfter: pageTextNormForSearch.substring(queryPosInNormalized + queryNormForSearch.length, Math.min(pageTextNormForSearch.length, queryPosInNormalized + queryNormForSearch.length + 30))
                    })

                    // Mappa questa posizione al testo originale (con spazi) usando le parole
                    let charCountNorm = 0
                    let charCountOriginal = 0
                    let mappedPos = 0

                    for (let i = 0; i < pageWords.length; i++) {
                      const w = pageWords[i]
                      const wText = w.text || ''
                      const wTextNorm = normalizeForSearch(wText)
                      const wStartNorm = charCountNorm
                      const wEndNorm = charCountNorm + wTextNorm.length

                      // Se la query inizia in questa parola o subito dopo
                      if (queryPosInNormalized >= wStartNorm && queryPosInNormalized <= wEndNorm) {
                        // Mappa all'inizio della parola che contiene l'inizio della query
                        mappedPos = charCountOriginal
                        break
                      }

                      charCountNorm += wTextNorm.length
                      charCountOriginal += wText.length + (i < pageWords.length - 1 ? 1 : 0)

                      // Se abbiamo superato la posizione, usa la parola precedente
                      if (charCountNorm > queryPosInNormalized && i > 0) {
                        // Torna indietro di una parola
                        const prevW = pageWords[i - 1]
                        const prevWText = prevW.text || ''
                        mappedPos = charCountOriginal - prevWText.length - 1
                        break
                      }
                    }

                    // Se non mappato, usa stima proporzionale
                    if (mappedPos === 0 && queryPosInNormalized > 0) {
                      const ratio = pageTextRaw.length / Math.max(1, pageTextNormForSearch.length)
                      mappedPos = Math.min(Math.floor(queryPosInNormalized * ratio), pageTextRaw.length - 1)
                    }

                    // Estrai snippet dalla posizione mappata
                    snippet = extractLineBasedSnippet(pageTextRaw, mappedPos, 150, true) // isOcr = true
                  }
                } else {
                  // Per documenti nativi, pageTextRaw contiene il testo completo
                  // localCharIdx è già corretto per il testo normalizzato, dobbiamo mapparlo
                  // Usa una stima approssimativa: trova la posizione nel testo originale
                  // cercando il contesto intorno a localCharIdx nel testo normalizzato
                  const contextNorm = pageTextNormalized.slice(Math.max(0, localCharIdx - 50), Math.min(pageTextNormalized.length, localCharIdx + 50))
                  const contextNormLower = contextNorm.toLowerCase()
                  const textRawLower = pageTextRaw.toLowerCase()
                  const mappedPos = textRawLower.indexOf(contextNormLower.substring(Math.max(0, contextNormLower.length - 20)))

                  if (mappedPos >= 0) {
                    const adjustedPos = mappedPos + (localCharIdx - Math.max(0, localCharIdx - 50) + Math.max(0, contextNormLower.length - 20))
                    snippet = extractLineBasedSnippet(pageTextRaw, Math.min(adjustedPos, pageTextRaw.length - 1), 300, false) // isOcr = false (nativo)
                  } else {
                    // Fallback: usa direttamente localCharIdx se il mapping fallisce
                    snippet = extractLineBasedSnippet(pageTextRaw, Math.min(localCharIdx, pageTextRaw.length - 1), 300, false) // isOcr = false (nativo)
                  }
                }

                // VERIFICA CRITICA: lo snippet DEVE contenere la query cercata
                // Applica la stessa logica di correzione usata per i file locali
                const normalizedQForSearch = normalizeForSearch(query)
                let snippetNormalizedForSearch = normalizeForSearch(snippet)
                if (!snippetNormalizedForSearch.includes(normalizedQForSearch)) {
                  // La mappatura potrebbe essere imprecisa - cerca la query nelle righe vicine
                  const searchStart = Math.max(0, (typeof localCharIdx === 'number' ? localCharIdx : 0) - 500)
                  const searchEnd = Math.min(pageTextRaw.length, (typeof localCharIdx === 'number' ? localCharIdx : 0) + 500)
                  const context = pageTextRaw.slice(searchStart, searchEnd)
                  const contextNormalized = normalizeForSearch(context)
                  const queryPosInContext = contextNormalized.indexOf(normalizedQForSearch)

                  if (queryPosInContext >= 0) {
                    // Trovata! Estrai lo snippet dalla posizione corretta nel contesto
                    const correctPos = searchStart + queryPosInContext
                    snippet = extractLineBasedSnippet(pageTextRaw, correctPos, 300, hasLayout) // Passa hasLayout come isOcr
                    snippetNormalizedForSearch = normalizeForSearch(snippet)
                  }

                  // Se ancora non contiene la query, salta questo risultato
                  if (!snippetNormalizedForSearch.includes(normalizedQForSearch)) {
                    console.log('[SEARCH][DB][SNIPPET-FILTER]', {
                      docId: doc.id,
                      charIdx,
                      localCharIdx,
                      snippet: snippet.substring(0, 100),
                      skipped: true
                    })
                    continue // Salta questo risultato - snippet non contiene la query
                  }
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
                  accumulatedNormalized
                })

                // Deduplicazione: verifica se abbiamo già visto questo snippet
                // Per OCR: usa una finestra di contesto attorno alla parola cercata (evita snippet troppo lunghi e quasi identici)
                // Per nativo: usa l'intero snippet normalizzato
                let snippetKey: string
                if (hasLayout) {
                  // OCR: estrai finestra di contesto (50 caratteri prima e dopo la parola cercata nello snippet)
                  const snippetNormalized = normalizeForSearch(snippet)
                  const queryNormalized = normalizeForSearch(query)
                  const queryPos = snippetNormalized.indexOf(queryNormalized)
                  if (queryPos >= 0) {
                    const contextStart = Math.max(0, queryPos - 50)
                    const contextEnd = Math.min(snippetNormalized.length, queryPos + queryNormalized.length + 50)
                    snippetKey = snippetNormalized.slice(contextStart, contextEnd)
                  } else {
                    snippetKey = snippetNormalized.substring(0, 100) // Fallback: primi 100 caratteri
                  }
                } else {
                  // Nativo: usa l'intero snippet normalizzato
                  snippetKey = normalizeForSearch(snippet)
                }

                if (seenSnippets.has(snippetKey)) {
                  // Snippet già presente - salta (evita duplicati)
                  continue
                }
                seenSnippets.add(snippetKey)

                allMatches.push({
                  id: `${doc.id}-${foundPage}-${charIdx}`, // ID unico: docId-page-charIdx
                  docId: doc.id,
                  filename: doc.filename,
                  page: foundPage,
                  snippet: snippet, // extractLineBasedSnippet già gestisce i puntini
                  x0Pct,
                  y0Pct,
                  x1Pct,
                  y1Pct,
                  charIdx: charIdx, // IMPORTANTE: usa charIdx (posizione assoluta nel documento), non localCharIdx (posizione relativa alla pagina)
                  qLen
                })
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

        // Ordina i risultati per garantire ordine corretto (prima pagina, poi posizione assoluta)
        // IMPORTANTE: charIdx è la posizione assoluta nel documento normalizzato, non localCharIdx!
        allMatches.sort((a, b) => {
          // Prima per pagina
          if (a.page !== b.page) {
            return a.page - b.page
          }
          // Poi per charIdx (posizione assoluta nel documento normalizzato)
          // charIdx viene salvato come posizione assoluta, quindi usiamo quello
          const aCharIdx = typeof a.charIdx === 'number' ? a.charIdx : 999999999
          const bCharIdx = typeof b.charIdx === 'number' ? b.charIdx : 999999999
          return aCharIdx - bCharIdx
        })

        console.log('[SEARCH][archive][sorted-results]', {
          total: allMatches.length,
          first5: allMatches.slice(0, 5).map((m, idx) => ({
            index: idx,
            page: m.page,
            charIdx: m.charIdx,
            snippetPreview: m.snippet.substring(0, 60)
          }))
        })

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

  // Endpoint per recuperare contesto espanso di un match
  fastify.get('/search/context', async (request, reply) => {
    try {
      const { docId, charIdx, linesBefore, linesAfter } = request.query as {
        docId?: string
        charIdx?: string
        linesBefore?: string
        linesAfter?: string
      }

      if (!docId || charIdx === undefined) {
        return reply.status(400).send({ error: 'docId e charIdx sono richiesti' })
      }

      const charPosition = parseInt(charIdx, 10)
      const linesBeforeNum = parseInt(linesBefore || '0', 10)
      const linesAfterNum = parseInt(linesAfter || '0', 10)

      if (isNaN(charPosition) || charPosition < 0) {
        return reply.status(400).send({ error: 'charIdx deve essere un numero >= 0' })
      }

      if (isNaN(linesBeforeNum) || isNaN(linesAfterNum) || linesBeforeNum < 0 || linesAfterNum < 0) {
        return reply.status(400).send({ error: 'linesBefore e linesAfter devono essere numeri >= 0' })
      }

      // Carica testo del documento (da cache o DB)
      let searchableText = ''
      let fromCache = false

      // Prova cache
      const cached = documentTextCache.get(docId)
      if (cached && cached.text) {
        searchableText = cached.text
        fromCache = true
      } else {
        // Carica dal DB
        const doc = await prisma.documento.findUnique({
          where: { id: docId },
          select: {
            id: true,
            filename: true,
            s3Key: true,
            ocrText: true,
            hasNativeText: true,
            ocrStatus: true
          }
        })

        if (!doc) {
          return reply.status(404).send({ error: 'Documento non trovato' })
        }

        // Leggi ocrText
        const ocrTextRaw = doc.ocrText
        if (typeof ocrTextRaw === 'string' && ocrTextRaw.length > 0) {
          searchableText = ocrTextRaw
        } else if (ocrTextRaw !== null && ocrTextRaw !== undefined) {
          searchableText = String(ocrTextRaw)
        }

        // Se non ha testo e haNativeText, estrai ora
        if (!searchableText && doc.hasNativeText) {
          try {
            const pdfPath = storageService.getLocalPath(doc.s3Key)
            searchableText = await extractNativeText(pdfPath)

            if (searchableText) {
              // Salva nel DB
              await prisma.documento.update({
                where: { id: doc.id },
                data: { ocrText: searchableText }
              })

              // Salva in cache
              documentTextCache.set(doc.id, {
                text: searchableText,
                layout: [],
                hasNativeText: true,
                timestamp: Date.now()
              })
            }
          } catch (extractError) {
            fastify.log.error({
              msg: '[SEARCH][context] Extraction failed',
              docId,
              error: (extractError as Error).message
            })
          }
        }

        // Salva in cache se non era già presente
        if (searchableText && !fromCache) {
          documentTextCache.set(docId, {
            text: searchableText,
            layout: [],
            hasNativeText: doc.hasNativeText || false,
            timestamp: Date.now()
          })
        }
      }

      if (!searchableText || searchableText.length === 0) {
        return reply.status(404).send({ error: 'Testo del documento non disponibile' })
      }

      // Verifica bounds
      if (charPosition >= searchableText.length) {
        return reply.status(400).send({ error: 'charIdx fuori dai limiti del documento' })
      }

      // Estrai contesto: n righe prima e dopo charPosition
      // Trova inizio della riga che contiene charPosition
      let startPos = charPosition
      while (startPos > 0 && searchableText[startPos - 1] !== '\n' && searchableText[startPos - 1] !== '\r') {
        startPos--
      }

      // Trova la fine della riga che contiene charPosition
      let endPos = charPosition
      while (endPos < searchableText.length && searchableText[endPos] !== '\n' && searchableText[endPos] !== '\r') {
        endPos++
      }

      // Vai indietro di linesBeforeNum righe
      let linesBeforeCount = 0
      let contextStart = startPos
      while (linesBeforeCount < linesBeforeNum && contextStart > 0) {
        // Salta caratteri di fine riga
        while (contextStart > 0 && (searchableText[contextStart - 1] === '\n' || searchableText[contextStart - 1] === '\r')) {
          contextStart--
        }
        if (contextStart <= 0) break

        // Trova inizio riga precedente
        let prevStart = contextStart - 1
        while (prevStart > 0 && searchableText[prevStart - 1] !== '\n' && searchableText[prevStart - 1] !== '\r') {
          prevStart--
        }

        contextStart = prevStart
        linesBeforeCount++
      }

      // Vai avanti di linesAfterNum righe
      let linesAfterCount = 0
      let contextEnd = endPos
      while (linesAfterCount < linesAfterNum && contextEnd < searchableText.length) {
        // Salta caratteri di fine riga
        while (contextEnd < searchableText.length && (searchableText[contextEnd] === '\n' || searchableText[contextEnd] === '\r')) {
          contextEnd++
        }
        if (contextEnd >= searchableText.length) break

        // Trova fine riga successiva
        let nextEnd = contextEnd
        while (nextEnd < searchableText.length && searchableText[nextEnd] !== '\n' && searchableText[nextEnd] !== '\r') {
          nextEnd++
        }

        contextEnd = nextEnd
        linesAfterCount++
      }

      // Estrai testo espanso
      const expandedText = searchableText.slice(contextStart, contextEnd).trim()

      return {
        expandedText,
        charPosition,
        contextStart,
        contextEnd,
        linesBefore: linesBeforeCount,
        linesAfter: linesAfterCount
      }
    } catch (error: any) {
      fastify.log.error({ msg: '[SEARCH][context] Error', error: error?.message, stack: error?.stack })
      return reply.status(500).send({ error: 'Errore durante il recupero del contesto', details: error?.message })
    }
  })
}

