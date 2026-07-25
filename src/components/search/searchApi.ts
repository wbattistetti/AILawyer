/**
 * Client HTTP e validazione delle risposte della ricerca documentale.
 */

import type {
  DocumentKind,
  DocumentLocator,
  DocumentMatch,
  SearchMatchRect
} from './types'

interface DocumentSearchResponse {
  matches?: unknown
}

interface SearchDocumentOptions {
  locator: DocumentLocator
  documentKind: DocumentKind
  documentTitle?: string
}

const getApiBaseUrl = (): string =>
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

const requireFiniteNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Risposta ricerca non valida: "${field}" deve essere un numero`)
  }
  return value
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Risposta ricerca non valida: "${field}" deve essere una stringa`)
  }
  return value
}

const requirePercent = (value: unknown, field: string): number => {
  const number = requireFiniteNumber(value, field)
  if (number < 0 || number > 100) {
    throw new Error(`Risposta ricerca non valida: "${field}" deve essere tra 0 e 100`)
  }
  return number
}

const normalizeRect = (value: unknown, field: string): SearchMatchRect => {
  if (!value || typeof value !== 'object') {
    throw new Error(`Risposta ricerca non valida: "${field}" deve essere un rettangolo`)
  }
  const rect = value as Record<string, unknown>
  const normalized = {
    x0Pct: requirePercent(rect.x0Pct, `${field}.x0Pct`),
    x1Pct: requirePercent(rect.x1Pct, `${field}.x1Pct`),
    y0Pct: requirePercent(rect.y0Pct, `${field}.y0Pct`),
    y1Pct: requirePercent(rect.y1Pct, `${field}.y1Pct`)
  }
  if (normalized.x1Pct < normalized.x0Pct || normalized.y1Pct < normalized.y0Pct) {
    throw new Error(`Risposta ricerca non valida: "${field}" ha estremi invertiti`)
  }
  return normalized
}

const normalizeBackendMatch = (
  value: unknown,
  query: string,
  options: SearchDocumentOptions,
  index: number
): DocumentMatch => {
  if (!value || typeof value !== 'object') {
    throw new Error(`Risposta ricerca non valida: match ${index} non è un oggetto`)
  }

  const match = value as Record<string, unknown>
  const page = requireFiniteNumber(match.page, 'page')
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Risposta ricerca non valida: pagina ${page}`)
  }
  if (!Array.isArray(match.rects)) {
    throw new Error(`Risposta ricerca non valida: "rects" del match ${index} deve essere un array`)
  }

  return {
    id: typeof match.id === 'string' ? match.id : `${options.locator.id}-${page}-${index}`,
    docId: options.locator.id,
    docTitle: options.documentTitle || '',
    kind: options.documentKind,
    page,
    q: query,
    x0Pct: requirePercent(match.x0Pct, 'x0Pct'),
    x1Pct: requirePercent(match.x1Pct, 'x1Pct'),
    y0Pct: requirePercent(match.y0Pct, 'y0Pct'),
    y1Pct: requirePercent(match.y1Pct, 'y1Pct'),
    rects: match.rects.map((rect, rectIndex) =>
      normalizeRect(rect, `matches[${index}].rects[${rectIndex}]`)
    ),
    charIdx: typeof match.charIdx === 'number' ? match.charIdx : undefined,
    qLength: typeof match.qLen === 'number' ? match.qLen : query.length,
    snippet: requireString(match.snippet, 'snippet'),
    score: typeof match.score === 'number' ? match.score : 0
  }
}

/**
 * Cerca un documento tramite il resolver unificato del backend.
 */
export async function searchDocument(
  query: string,
  options: SearchDocumentOptions
): Promise<DocumentMatch[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('La query di ricerca non può essere vuota')
  }
  if (!options.locator.id.trim()) {
    throw new Error('docId è obbligatorio per la ricerca documentale')
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    docId: options.locator.id
  })
  if (options.locator.hash) params.set('hash', options.locator.hash)
  if (options.locator.storageKey) params.set('storageKey', options.locator.storageKey)
  if (options.locator.filename) params.set('filename', options.locator.filename)

  const response = await fetch(`${getApiBaseUrl()}/api/search/document?${params.toString()}`)

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: unknown } | null
    const detail = typeof errorBody?.error === 'string' ? `: ${errorBody.error}` : ''
    throw new Error(`Ricerca non riuscita (${response.status} ${response.statusText})${detail}`)
  }

  const data = (await response.json()) as DocumentSearchResponse
  if (!Array.isArray(data.matches)) {
    throw new Error('Risposta ricerca non valida: "matches" deve essere un array')
  }

  return data.matches.map((match, index) =>
    normalizeBackendMatch(match, normalizedQuery, options, index)
  )
}
