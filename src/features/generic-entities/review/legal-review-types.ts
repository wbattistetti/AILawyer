/**
 * Contratto Fase B: review LLM su snippet organization/venue/company.
 * L’implementazione Grok arriverà dietro POST /llm/legal-review.
 */

export type LegalReviewEntityType = 'venue' | 'company' | 'institution'

export type LegalReviewPayload = {
  praticaId: string
  operationId?: string
  /** Snippet originale (non anonimizzato in Fase B). Max consigliato ~500 char. */
  snippet: string
  expectedType: LegalReviewEntityType
  /** Span del candidato relativo allo snippet [start, end). */
  candidateSpan: [number, number]
  candidateLabel: string
  flags: string[]
  model?: string
}

export type LegalReviewResult = {
  valid: boolean
  /** Span corretto relativo allo stesso snippet originale. */
  correctedSpan: [number, number] | null
  /** Sottostringa da usare come label (deve coincidere con snippet.slice(...)). */
  normalizedLabel: string | null
  confidence: number
  model: string
  operationId: string
}

/** Applica uno span relativo allo snippet sul testo pagina originale. */
export function applySpanToOriginal(
  originalText: string,
  snippetStart: number,
  correctedSpan: [number, number]
): string {
  if (typeof originalText !== 'string') {
    throw new Error('applySpanToOriginal: originalText must be a string')
  }
  if (!Number.isInteger(snippetStart) || snippetStart < 0) {
    throw new Error('applySpanToOriginal: snippetStart must be a non-negative integer')
  }
  const [start, end] = correctedSpan
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error('applySpanToOriginal: correctedSpan must be [start, end) with end >= start')
  }
  const absStart = snippetStart + start
  const absEnd = snippetStart + end
  if (absEnd > originalText.length) {
    throw new Error('applySpanToOriginal: corrected span exceeds originalText length')
  }
  return originalText.slice(absStart, absEnd)
}
