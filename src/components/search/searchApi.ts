/**
 * Client HTTP e validazione delle risposte della ricerca documentale.
 */

import type { DocumentKind, DocumentMatch } from './types'

interface ArchiveSearchResponse {
  matches?: unknown
}

interface SearchArchiveOptions {
  docId: string
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

const normalizeBackendMatch = (
  value: unknown,
  query: string,
  options: SearchArchiveOptions,
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

  return {
    id: typeof match.id === 'string' ? match.id : `${options.docId}-${page}-${index}`,
    docId: options.docId,
    docTitle: options.documentTitle || '',
    kind: options.documentKind,
    page,
    q: query,
    x0Pct: requireFiniteNumber(match.x0Pct, 'x0Pct'),
    x1Pct: requireFiniteNumber(match.x1Pct, 'x1Pct'),
    y0Pct: requireFiniteNumber(match.y0Pct, 'y0Pct'),
    y1Pct: requireFiniteNumber(match.y1Pct, 'y1Pct'),
    charIdx: typeof match.charIdx === 'number' ? match.charIdx : undefined,
    qLength: typeof match.qLen === 'number' ? match.qLen : query.length,
    snippet: requireString(match.snippet, 'snippet'),
    score: typeof match.score === 'number' ? match.score : 0
  }
}

/**
 * Cerca un documento indicizzato dal backend e restituisce match canonici.
 */
export async function searchArchiveDocument(
  query: string,
  options: SearchArchiveOptions
): Promise<DocumentMatch[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('La query di ricerca non può essere vuota')
  }
  if (!options.docId.trim()) {
    throw new Error('docId è obbligatorio per la ricerca documentale')
  }

  const response = await fetch(
    `${getApiBaseUrl()}/api/search/archive?q=${encodeURIComponent(normalizedQuery)}&docId=${encodeURIComponent(options.docId)}`
  )

  if (!response.ok) {
    throw new Error(`Ricerca non riuscita (${response.status} ${response.statusText})`)
  }

  const data = (await response.json()) as ArchiveSearchResponse
  if (!Array.isArray(data.matches)) {
    throw new Error('Risposta ricerca non valida: "matches" deve essere un array')
  }

  return data.matches.map((match, index) =>
    normalizeBackendMatch(match, normalizedQuery, options, index)
  )
}
