/**
 * Client della ricerca globale, limitata ai documenti della pratica corrente.
 */

import { cryptoRandom } from '../../utils/misc'
import type {
  DocumentKind,
  DocumentMatch,
  SearchDiagnostic,
  SearchResultNode
} from './types'

export interface PracticeSearchDocument {
  id: string
  title: string
  hash: string
  kind: DocumentKind
  storageKey?: string
}

interface ArchiveSearchResponse {
  matches?: unknown
  diagnostics?: unknown
  praticaId?: unknown
}

const getApiBaseUrl = (): string =>
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Risposta ricerca globale non valida: "${field}" deve essere una stringa`)
  }
  return value
}

const requireNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Risposta ricerca globale non valida: "${field}" deve essere un numero`)
  }
  return value
}

const requirePercent = (value: unknown, field: string): number => {
  const number = requireNumber(value, field)
  if (number < 0 || number > 100) {
    throw new Error(`Risposta ricerca globale non valida: "${field}" deve essere tra 0 e 100`)
  }
  return number
}

const resolveDocumentMeta = (
  docId: string,
  match: Record<string, unknown>,
  documentsById: Map<string, PracticeSearchDocument>
): PracticeSearchDocument => {
  const known = documentsById.get(docId)
  if (known) return known

  // Il backend ha già filtrato per praticaId: usa i metadati della risposta.
  const filename = typeof match.filename === 'string' && match.filename.trim()
    ? match.filename.trim()
    : docId
  return {
    id: docId,
    title: filename,
    hash: '',
    kind: 'pdf'
  }
}

/**
 * Converte e raggruppa i match del backend per documento della pratica.
 */
export function normalizeArchiveSearchResults(
  query: string,
  documents: PracticeSearchDocument[],
  rawMatches: unknown,
  rawDiagnostics: unknown = []
): SearchResultNode {
  if (!Array.isArray(rawMatches)) {
    throw new Error('Risposta ricerca globale non valida: "matches" deve essere un array')
  }
  if (!Array.isArray(rawDiagnostics)) {
    throw new Error('Risposta ricerca globale non valida: "diagnostics" deve essere un array')
  }

  const documentsById = new Map(documents.map((document) => [document.id, document]))
  const matchesByDocument = new Map<string, DocumentMatch[]>()
  const documentOrder: PracticeSearchDocument[] = []
  const seenDocumentIds = new Set<string>()

  rawMatches.forEach((rawMatch, index) => {
    if (!rawMatch || typeof rawMatch !== 'object') {
      throw new Error(`Risposta ricerca globale non valida: match ${index} non è un oggetto`)
    }

    const match = rawMatch as Record<string, unknown>
    const docId = requireString(match.docId, `matches[${index}].docId`)
    const document = resolveDocumentMeta(docId, match, documentsById)

    if (!seenDocumentIds.has(docId)) {
      seenDocumentIds.add(docId)
      documentOrder.push(document)
    }

    const page = requireNumber(match.page, `matches[${index}].page`)
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`Risposta ricerca globale non valida: pagina "${page}"`)
    }

    const x0Pct = requirePercent(match.x0Pct, `matches[${index}].x0Pct`)
    const x1Pct = requirePercent(match.x1Pct, `matches[${index}].x1Pct`)
    const y0Pct = requirePercent(match.y0Pct, `matches[${index}].y0Pct`)
    const y1Pct = requirePercent(match.y1Pct, `matches[${index}].y1Pct`)
    if (x1Pct < x0Pct || y1Pct < y0Pct) {
      throw new Error(`Risposta ricerca globale non valida: coordinate invertite nel match ${index}`)
    }

    const documentMatches = matchesByDocument.get(docId) || []
    const normalized: DocumentMatch = {
      id: typeof match.id === 'string' ? match.id : `${docId}-${page}-${index}`,
      docId,
      docTitle: document.title,
      kind: document.kind,
      page,
      q: query,
      x0Pct,
      x1Pct,
      y0Pct,
      y1Pct,
      rects: Array.isArray(match.rects) && match.rects.length > 0
        ? match.rects.map((rect, rectIndex) => {
          if (!rect || typeof rect !== 'object') {
            throw new Error(`Risposta ricerca globale non valida: rect ${rectIndex} nel match ${index}`)
          }
          const item = rect as Record<string, unknown>
          return {
            x0Pct: requirePercent(item.x0Pct, `matches[${index}].rects[${rectIndex}].x0Pct`),
            x1Pct: requirePercent(item.x1Pct, `matches[${index}].rects[${rectIndex}].x1Pct`),
            y0Pct: requirePercent(item.y0Pct, `matches[${index}].rects[${rectIndex}].y0Pct`),
            y1Pct: requirePercent(item.y1Pct, `matches[${index}].rects[${rectIndex}].y1Pct`)
          }
        })
        : [{ x0Pct, x1Pct, y0Pct, y1Pct }],
      charIdx: typeof match.charIdx === 'number' ? match.charIdx : undefined,
      qLength: typeof match.qLen === 'number' ? match.qLen : query.length,
      snippet: requireString(match.snippet, `matches[${index}].snippet`),
      score: 1,
      ord: documentMatches.length
    }

    documentMatches.push(normalized)
    matchesByDocument.set(docId, documentMatches)
  })

  // Preferisci l'ordine dei documenti noti della pratica, poi eventuali id solo dal backend.
  const preferredOrder = [
    ...documents.filter((document) => matchesByDocument.has(document.id)),
    ...documentOrder.filter((document) => !documentsById.has(document.id))
  ]

  const groups = preferredOrder.map((document) => ({
    doc: { ...document, pages: 0 },
    matches: matchesByDocument.get(document.id) || []
  }))
  const diagnostics: SearchDiagnostic[] = rawDiagnostics.map((rawDiagnostic, index) => {
    if (!rawDiagnostic || typeof rawDiagnostic !== 'object') {
      throw new Error(`Risposta ricerca globale non valida: diagnostica ${index} non è un oggetto`)
    }
    const diagnostic = rawDiagnostic as Record<string, unknown>
    const code = requireString(diagnostic.code, `diagnostics[${index}].code`)
    if (code !== 'ocr-required') {
      throw new Error(`Risposta ricerca globale non valida: codice diagnostica "${code}"`)
    }
    const docId = requireString(diagnostic.docId, `diagnostics[${index}].docId`)
    const knownDocument = documentsById.get(docId)
    return {
      docId,
      docTitle: knownDocument?.title
        ?? requireString(diagnostic.filename, `diagnostics[${index}].filename`),
      code,
      message: requireString(diagnostic.message, `diagnostics[${index}].message`),
      ocrStatus: requireString(diagnostic.ocrStatus, `diagnostics[${index}].ocrStatus`)
    }
  })

  return {
    id: cryptoRandom(),
    query,
    scope: 'archive',
    total: rawMatches.length,
    groups,
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  }
}

/**
 * Cerca una stringa in tutti i documenti della pratica (motore unificato lato backend).
 */
export async function searchPracticeArchive(
  query: string,
  praticaId: string,
  documents: PracticeSearchDocument[]
): Promise<SearchResultNode> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) throw new Error('La query di ricerca non può essere vuota')
  if (!praticaId.trim()) throw new Error('Identificativo pratica mancante')

  const response = await fetch(`${getApiBaseUrl()}/api/search/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: normalizedQuery,
      praticaId,
      docs: documents.map((document) => ({
        id: document.id,
        ...(document.hash ? { hash: document.hash } : {}),
        ...(document.storageKey ? { storageKey: document.storageKey } : {}),
        filename: document.title
      }))
    })
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    const detail = typeof body?.error === 'string' ? `: ${body.error}` : ''
    throw new Error(`Ricerca globale non riuscita (${response.status} ${response.statusText})${detail}`)
  }

  const data = await response.json() as ArchiveSearchResponse
  return normalizeArchiveSearchResults(
    normalizedQuery,
    documents,
    data.matches,
    data.diagnostics
  )
}
