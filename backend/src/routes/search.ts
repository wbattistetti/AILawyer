import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/database'
import { storageService } from '../lib/storage'
import { extractNativeText } from '../lib/extractNativeText'
import { getLocalOcrResult } from './ocr.js'
import { reconstructTextFromGeometry } from '../services/ocr-poppler.js'
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
// Normalizza solo accenti e maiuscole/minuscole - mantiene tutti gli whitespace originali
// NON modifica spazi, newline, tab, ecc. - usiamo regex per gestire whitespace flessibili
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // NON normalizzare whitespace - li gestiamo con regex nella ricerca
}

// Helper per creare pattern regex dalla query
// Converte "capuozzo antonio" in pattern che trova anche "capuozzo\nantonio" o "capuozzo  antonio"
function createSearchPattern(query: string): RegExp {
  // Normalizza solo case e accenti per la regex
  const normalized = normalize(query)

  let pattern: string
  let flags = 'i' // 'i' = case-insensitive. NON usare 'g' perché gestiamo lastIndex manualmente nel loop

  // Se la query contiene spazi, sostituisci gli spazi con \s+ per accettare qualsiasi whitespace
  // Altrimenti cerca la parola esatta
  if (normalized.includes(' ')) {
    // Dividi in parole e unisci con \s+ (uno o più whitespace: spazio, newline, tab, ecc.)
    const words = normalized.trim().split(/\s+/).filter(w => w.length > 0)
    pattern = words.map(w => escapeRegex(w)).join('\\s+')
  } else {
    // Singola parola: cerca esattamente quella
    pattern = escapeRegex(normalized)
  }

  const regex = new RegExp(pattern, flags)

  // Log rimosso - viene chiamato troppo spesso e causa lampeggiamento terminale

  return regex
}

// Helper per escapare caratteri speciali regex
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

        console.log('🚀🚀🚀 [SEARCH][START] 🚀🚀🚀', {
          query,
          normalizedQ,
          limit,
          docId: docId || 'all',
          timestamp: new Date().toISOString()
        })

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
          // Estrai prefisso hash da docId (temp:e6447792c8231ab2 -> e6447792c8231ab2)
          const hashPrefix = docId.replace(/^temp:/, '')
          console.log('[SEARCH][ARCHIVE][LOCAL] Checking local file', { docId, hashPrefix })

          // ✅ Cerca OCR usando il prefisso dell'hash (l's3Key completo inizia con questo prefisso)
          // Es: hashPrefix = 'e6447792c8231ab2', s3Key completo = 'e6447792c8231ab22ad3cefc822cb2564b505afa3a3ab98828e7778920c3d050.pdf'
          const { getLocalOcrResultByPrefix } = await import('./ocr.js')
          const ocrResultData = getLocalOcrResultByPrefix(hashPrefix)
          const ocrResult = ocrResultData ? {
            texts: ocrResultData.texts,
            layout: ocrResultData.layout,
            status: ocrResultData.status,
            progress: ocrResultData.progress
          } : null
          const actualS3Key = ocrResultData?.s3Key || hashPrefix
          console.log('[SEARCH][ARCHIVE][LOCAL] OCR result', {
            hashPrefix,
            actualS3Key,
            hasResult: !!ocrResult,
            hasTexts: !!(ocrResult && ocrResult.texts),
            textsLength: ocrResult?.texts?.length,
            status: ocrResult?.status
          })

          if (ocrResult && ocrResult.texts) {
            // File locale con OCR completato: usa testo dalla memoria
            const text = ocrResult.texts.join('\n')
            localDocInfo = {
              s3Key: actualS3Key,
              filename: actualS3Key.split(':').pop() || actualS3Key.split('/').pop() || 'documento locale',
              text,
              layout: ocrResult.layout
            }
            console.log('[SEARCH][archive][local] Found in memory', { s3Key: actualS3Key, textLength: text.length, textStart: text.substring(0, 200) })
            fastify.log.info({ msg: '[SEARCH][archive][local] Found in memory', s3Key: actualS3Key, textLength: text.length })
          } else {
            // File locale senza OCR: prova a leggere testo nativo dal file
            console.log('[SEARCH][ARCHIVE][LOCAL] No OCR result, trying native text extraction', { hashPrefix, actualS3Key })
            try {
              // ✅ Usa actualS3Key se disponibile (s3Key completo), altrimenti hashPrefix
              const s3KeyToUse = actualS3Key !== hashPrefix ? actualS3Key : hashPrefix
              const sanitizedKey = sanitizeFileName(s3KeyToUse)
              const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
              const filePath = path.join(uploadsDir, sanitizedKey)

              console.log('[SEARCH][ARCHIVE][LOCAL] File path', { sanitizedKey, filePath, exists: fs.existsSync(filePath) })

              if (fs.existsSync(filePath)) {
                const nativeText = await extractNativeText(filePath)
                console.log('[SEARCH][ARCHIVE][LOCAL] Native text extraction', {
                  s3Key: s3KeyToUse,
                  hasText: !!nativeText,
                  textLength: nativeText?.length,
                  textStart: nativeText?.substring(0, 200)
                })
                if (nativeText) {
                  localDocInfo = {
                    s3Key: s3KeyToUse,
                    filename: s3KeyToUse.split(':').pop() || s3KeyToUse.split('/').pop() || 'documento locale',
                    text: nativeText,
                    layout: []
                  }
                  console.log('[SEARCH][archive][local] Native text extracted', { s3Key: s3KeyToUse, textLength: nativeText.length })
                  fastify.log.info({ msg: '[SEARCH][archive][local] Native text extracted', s3Key: s3KeyToUse, textLength: nativeText.length })
                } else {
                  console.log('[SEARCH][ARCHIVE][LOCAL] No native text found', { s3Key: s3KeyToUse })
                }
              } else {
                console.log('[SEARCH][ARCHIVE][LOCAL] File does not exist', { s3Key: s3KeyToUse, filePath })
              }
            } catch (e: any) {
              console.error('[SEARCH][ARCHIVE][LOCAL] Error extracting native text', { s3Key: s3KeyToUse, error: e?.message, stack: e?.stack })
              fastify.log.warn({ msg: '[SEARCH][archive][local] Failed to read file', s3Key: s3KeyToUse, error: e?.message })
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
            // ✅ CORREZIONE: Usa regex per cercare nel testo normalizzato (solo case/accenti)
            // La regex gestisce flessibilmente whitespace (spazi, newline, tab) tra le parole
            const normalizedText = normalize(localDocInfo.text)
            const searchPattern = createSearchPattern(query)

            console.log('[SEARCH][LOCAL][NORMALIZE]', {
              originalTextSample: localDocInfo.text.substring(0, 150),
              normalizedTextSample: normalizedText.substring(0, 150),
              query,
              normalizedQ,
              searchPattern: searchPattern.toString()
            })

            // ✅ CORREZIONE: Usa matchAll() invece di exec() in loop - più affidabile
            // Aggiungi flag 'g' per cercare tutte le occorrenze
            const searchPatternGlobal = new RegExp(searchPattern.source, searchPattern.flags + 'g')

            const occurrences: number[] = []
            try {
              // Usa matchAll() che è più efficiente e affidabile
              const matches = normalizedText.matchAll(searchPatternGlobal)

              for (const match of matches) {
                if (match.index !== undefined) {
                  occurrences.push(match.index)
                }
              }
            } catch (error: any) {
              console.error('[SEARCH][LOCAL][REGEX-ERROR]', {
                error: error?.message,
                pattern: searchPatternGlobal.toString()
              })
            }

            // Log riassuntivo mantenuto - utile per debug senza essere eccessivo
            if (occurrences.length > 0) {
              console.log('[SEARCH][LOCAL][REGEX-RESULT]', {
                totalMatches: occurrences.length,
                firstMatchIndex: occurrences[0]
              })
            }

            // Log ridotto - informazioni già presenti in REGEX-RESULT

            if (occurrences.length > 0) {
              // Processa occorrenze con layout se disponibile
              const layout = localDocInfo.layout || []
              const hasLayout = layout.length > 0

              // ✅ CORREZIONE: Gli indici corrispondono direttamente al testo normalizzato (con spazi)
              // Non serve più il mapping complesso
              for (let occIdx = 0; occIdx < occurrences.length; occIdx++) {
                const charIdx = occurrences[occIdx] // Posizione nel testo normalizzato (CON spazi)

                let foundPage = 1
                let pageTextRaw = localDocInfo.text
                let pageTextNormalized = normalizedText
                let accumulatedNormalized = 0

                if (hasLayout) {
                  // ✅ CORREZIONE: Pre-calcola gli offset usando il testo completo normalizzato
                  // Ora che normalize NON modifica whitespace, i separatori sono preservati
                  const normalizedTextFull = normalize(localDocInfo.text)
                  const pagesText = localDocInfo.text.split(/\n\f\n/g)

                  // Pre-calcola gli offset per ogni pagina
                  let pageOffsets: number[] = []
                  if (occIdx === 0) {
                    let currentPos = 0
                    for (let i = 0; i < pagesText.length; i++) {
                      pageOffsets.push(currentPos)
                      const pageNorm = normalize(pagesText[i] || '')
                      currentPos += pageNorm.length

                      // Se non è l'ultima pagina, aggiungi lo spazio del separatore normalizzato
                      // Il separatore \n\f\n viene normalizzato a uno spazio da normalize() con .replace(/\s+/g, ' ')
                      if (i < pagesText.length - 1) {
                        currentPos += 1 // Il separatore normalizzato diventa uno spazio
                      }
                    }
                    // Salva per riutilizzo
                    ;(localDocInfo as any).__pageOffsets = pageOffsets
                  } else {
                    // Riutilizza gli offset già calcolati
                    pageOffsets = (localDocInfo as any).__pageOffsets || []
                  }

                  // ✅ Trova pagina usando gli offset pre-calcolati
                  for (let pageIdx = 0; pageIdx < layout.length; pageIdx++) {
                    const pageMeta = layout[pageIdx] || {}
                    const words = pageMeta.words || []

                    let pageText: string
                    if (pagesText[pageIdx] && pagesText[pageIdx].trim()) {
                      pageText = pagesText[pageIdx]
                    } else {
                      // Fallback: ricostruisci
                      const width = pageMeta.width || pageMeta.imgW || 0
                      const height = pageMeta.height || pageMeta.imgH || 0
                      if (width && height && words.length > 0) {
                        const wordsWithCoords = words
                          .filter((w: any) => w && w.text && w.text.trim())
                          .map((w: any) => ({
                            text: String(w.text || '').trim(),
                            x0: w.x0 || 0,
                            y0: w.y0 || 0,
                            x1: w.x1 || 0,
                            y1: w.y1 || 0
                          }))
                        if (wordsWithCoords.length > 0) {
                          pageText = reconstructTextFromGeometry(wordsWithCoords, width, height)
                        } else {
                          pageText = words.map((w: any) => w.text || '').join(' ')
                        }
                      } else {
                        pageText = words.map((w: any) => w.text || '').join(' ')
                      }
                    }

                    const pageTextNorm = normalize(pageText)
                    const pageLenNorm = pageTextNorm.length

                    // ✅ USA offset pre-calcolato invece di accumulare
                    const accumulatedNormalized = pageOffsets[pageIdx] || 0

                    if (charIdx >= accumulatedNormalized && charIdx < accumulatedNormalized + pageLenNorm) {
                      foundPage = pageIdx + 1
                      pageTextRaw = pageText
                      pageTextNormalized = pageTextNorm
                      break
                    }
                    // ❌ NON accumulare più qui
                  }
                } else {
                  foundPage = Math.floor(charIdx / 2000) + 1
                  pageTextNormalized = normalizedText
                  pageTextRaw = localDocInfo.text
                  accumulatedNormalized = 0
                }

                // ✅ CORREZIONE: charIdx corrisponde direttamente al testo normalizzato, usa direttamente
                const localCharIdxInPage = charIdx - accumulatedNormalized
                let snippet = extractLineBasedSnippet(pageTextRaw, localCharIdxInPage, 300, hasLayout)

                // VERIFICA CRITICA: lo snippet DEVE contenere la query cercata
                // Usa regex per verificare (gestisce whitespace flessibili)
                let snippetNormalized = normalize(snippet)
                const verifyPattern = createSearchPattern(query)
                if (!verifyPattern.test(snippetNormalized)) {
                  // Cerca nelle righe vicine
                  const searchStart = Math.max(0, localCharIdxInPage - 500)
                  const searchEnd = Math.min(pageTextRaw.length, localCharIdxInPage + 500)
                  const context = pageTextRaw.slice(searchStart, searchEnd)
                  const contextNormalized = normalize(context)
                  const contextPattern = createSearchPattern(query)
                  const contextMatch = contextPattern.exec(contextNormalized)

                  if (contextMatch) {
                    const correctPos = searchStart + contextMatch.index
                    snippet = extractLineBasedSnippet(pageTextRaw, correctPos, 300, hasLayout)
                    snippetNormalized = normalize(snippet)
                  }

                  // Verifica finale con regex - log solo se viene filtrato
                  if (!verifyPattern.test(snippetNormalized)) {
                    console.log('[SEARCH][LOCAL][SNIPPET-FILTER]', {
                      occIdx,
                      skipped: true
                    })
                    continue
                  }
                }

                // Bbox approssimativa
                let x0Pct = 0, y0Pct = 0, x1Pct = 100, y1Pct = 100
                if (hasLayout && layout[foundPage - 1]) {
                  const pageWords = layout[foundPage - 1].words || []
                  const matchingWords: any[] = []

                  // Trova la query nella pagina normalizzata per ottenere la lunghezza reale del match
                  const pagePattern = createSearchPattern(query)
                  const pageMatch = pagePattern.exec(pageTextNormalized)
                  const matchLength = pageMatch ? pageMatch[0].length : normalize(query).length

                  let charCountNorm = 0
                  for (const w of pageWords) {
                    const wText = w.text || ''
                    const wTextNorm = normalize(wText)
                    const wStart = charCountNorm
                    const wEnd = charCountNorm + wTextNorm.length

                    if (wEnd >= localCharIdxInPage && wStart < localCharIdxInPage + matchLength) {
                      matchingWords.push(w)
                    }
                    charCountNorm += wTextNorm.length + 1 // +1 per lo spazio
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

                // Deduplicazione
                let snippetKey: string
                const snippetNorm = normalize(snippet)
                const queryPattern = createSearchPattern(query)
                const queryMatch = queryPattern.exec(snippetNorm)
                if (queryMatch) {
                  const contextStart = Math.max(0, queryMatch.index - 50)
                  const contextEnd = Math.min(snippetNorm.length, queryMatch.index + queryMatch[0].length + 50)
                  snippetKey = snippetNorm.slice(contextStart, contextEnd)
                } else {
                  snippetKey = snippetNorm.substring(0, 100)
                }

                if (seenSnippets.has(snippetKey)) {
                  // Log rimosso - troppo verboso
                  continue
                }
                seenSnippets.add(snippetKey)

                // Log rimosso - viene chiamato per ogni risultato, troppo verboso

                allMatches.push({
                  id: `${docId}-${foundPage}-${charIdx}`,
                  docId: docId!,
                  filename: localDocInfo.filename,
                  page: foundPage,
                  snippet: snippet,
                  x0Pct,
                  y0Pct,
                  x1Pct,
                  y1Pct,
                  charIdx: charIdx, // Usa charIdx diretto (posizione nel testo normalizzato)
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

            // ✅ NUOVO APPROCCIO SEMPLICE: Cerca riga per riga nelle pagine
            // 1. Dividi testo in pagine
            const pagesText = searchableText.split(/\n\f\n/g)

            // 2. Crea pattern regex (già gestisce \s+ tra le parole)
            const searchPattern = createSearchPattern(query)

            console.log('[SEARCH][ARCHIVE][LINE-BY-LINE]', {
              docId: doc.id.substring(0, 20) + '...',
              totalPages: pagesText.length,
              pattern: searchPattern.toString(),
              query
            })

            let totalMatchesFound = 0

            // ✅ 3. Per ogni pagina, cerca riga per riga
            for (let pageIdx = 0; pageIdx < pagesText.length; pageIdx++) {
              const pageText = pagesText[pageIdx] || ''
              const lines = pageText.split('\n') // Dividi pagina in righe

              // Per ogni riga della pagina
              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx].trim()

                // Se la riga è vuota, salta
                if (!line) continue

                // Normalizza solo case e accenti (non whitespace) per il match
                const lineNormalized = normalize(line)

                // Cerca con regex (gestisce \s+ tra parole)
                if (searchPattern.test(lineNormalized)) {
                  // ✅ MATCH! Aggiungi questa riga ai risultati
                  totalMatchesFound++

                  // Calcola bbox approssimativa se abbiamo layout
                  let x0Pct = 0, y0Pct = 0, x1Pct = 100, y1Pct = 100
                  if (hasLayout && layout[pageIdx]) {
                    // Cerca parole nella riga per calcolare bbox
                    const pageWords = layout[pageIdx].words || []
                    const matchingWords: any[] = []

                    // Trova tutte le parole che potrebbero essere in questa riga
                    // (approssimazione: cerca parole che contengono parti della query)
                    const queryWords = query.toLowerCase().split(/\s+/)
                    for (const word of pageWords) {
                      const wordText = (word.text || '').toLowerCase()
                      if (queryWords.some(qw => wordText.includes(qw))) {
                        matchingWords.push(word)
                      }
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

                  // ✅ Aggiungi direttamente ai risultati - NESSUNA deduplicazione
                  allMatches.push({
                    id: `${doc.id}-${pageIdx + 1}-${lineIdx}`, // ID unico: docId-page-line
                    docId: doc.id,
                    filename: doc.filename,
                    page: pageIdx + 1,
                    snippet: line, // La riga completa che contiene la query
                    x0Pct,
                    y0Pct,
                    x1Pct,
                    y1Pct,
                    charIdx: 0, // Non più necessario con questo approccio
                    qLen: query.length
                  })
                }
              }
            }

            console.log('[SEARCH][ARCHIVE][RESULTS]', {
              docId: doc.id.substring(0, 20) + '...',
              totalMatchesFound,
              totalPages: pagesText.length
            })

          } catch (error) {
            console.error('[SEARCH][ARCHIVE][ERROR]', {
              docId: doc.id,
              filename: doc.filename,
              error: (error as Error).message
            })
            fastify.log.warn({ msg: '[SEARCH][archive] error processing doc', docId: doc.id, error })
          } finally {
            processedCount++
          }
        }

        // Ordina i risultati per pagina
        allMatches.sort((a, b) => {
          // Prima per pagina
          if (a.page !== b.page) {
            return a.page - b.page
          }
          // Poi per ordine di inserimento (mantieni l'ordine delle righe nella pagina)
          return 0
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

        console.log('🔍🔍🔍 [SEARCH][FINAL-RESPONSE] 🔍🔍🔍', {
          query,
          queryNormalized: normalizedQ,
          totalMatches: allMatches.length,
          processedDocs: processedCount,
          first5Matches: allMatches.slice(0, 5).map(m => ({
            docId: m.docId?.substring(0, 20) + '...',
            page: m.page,
            snippet: m.snippet.substring(0, 100)
          }))
        })

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

