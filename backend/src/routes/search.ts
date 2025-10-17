import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/database'

// Helper per normalizzare il testo (uguale al frontend)
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export async function searchRoutes(fastify: FastifyInstance) {
  
  // Ricerca globale in tutti i documenti dell'archivio
  fastify.get<{ Querystring: { q?: string; limit?: string } }>(
    '/search/archive',
    async (request, reply) => {
      try {
        const query = (request.query.q || '').trim()
        if (!query) {
          return reply.status(400).send({ error: 'Query mancante' })
        }

        const limit = parseInt(request.query.limit || '50', 10)
        const normalizedQ = normalize(query)

        fastify.log.info({ msg: '[SEARCH][archive] start', query, normalizedQ, limit })

        // 1. Trova tutti i documenti con OCR completato
        // SQLite non supporta ILIKE, quindi prendiamo tutti e filtriamo in memoria
        const documenti = await prisma.documento.findMany({
          where: {
            ocrStatus: 'completed',
            NOT: {
              ocrText: null
            }
          },
          select: {
            id: true,
            filename: true,
            ocrText: true,
            ocrLayout: true
          }
        })
        
        // Filtra per query (case-insensitive)
        const filteredDocs = documenti.filter(doc => {
          const text = normalize((doc.ocrText || '') as string)
          return text.includes(normalizedQ)
        }).slice(0, limit)

        fastify.log.info({ msg: '[SEARCH][archive] docs found', count: documenti.length })

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

        // 2. Per ogni documento filtrato, trova le occorrenze con bbox
        for (const doc of filteredDocs) {
          try {
            const ocrText = (doc.ocrText || '') as string
            const normalizedText = normalize(ocrText)
            
            // Cerca tutte le occorrenze
            let startIdx = 0
            const occurrences: number[] = []
            while (true) {
              const idx = normalizedText.indexOf(normalizedQ, startIdx)
              if (idx === -1) break
              occurrences.push(idx)
              startIdx = idx + 1
              if (occurrences.length >= 10) break // Max 10 match per documento
            }

            if (occurrences.length === 0) continue

            // Parse layout
            const layout = typeof doc.ocrLayout === 'string' 
              ? (() => { try { return JSON.parse(doc.ocrLayout) } catch { return [] } })()
              : (doc.ocrLayout || [])

            // Per ogni occorrenza, trova la pagina e bbox
            for (const charIdx of occurrences) {
              let accumulated = 0
              let foundPage = -1
              let pageWords: any[] = []
              let pageTextRaw = ''

              // Trova in quale pagina si trova il carattere
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

              if (foundPage === -1) continue

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
          } catch (error) {
            fastify.log.warn({ msg: '[SEARCH][archive] error processing doc', docId: doc.id, error })
          }
        }

        fastify.log.info({ msg: '[SEARCH][archive] done', totalMatches: allMatches.length })

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

