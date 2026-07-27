/**
 * Client ibrido Fase B: chiama il gateway Groq backend per gli snippet incerti.
 */

import type { LegalReviewPayload, LegalReviewResult } from './legal-review-types'
import { isReviewEligible } from './review-candidates'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const MAX_SNIPPET_CHARS = 500

/**
 * Invia uno snippet incerto a review LLM.
 * Non maschera PII in Fase B (solo lunghezza limitata).
 */
export async function callLegalReview(
  payload: LegalReviewPayload,
  options?: { signal?: AbortSignal }
): Promise<LegalReviewResult> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('callLegalReview: payload is required')
  }
  if (!payload.snippet?.trim()) {
    throw new Error('callLegalReview: snippet is required')
  }
  if (!payload.praticaId?.trim()) {
    throw new Error('callLegalReview: praticaId is required')
  }
  if (!payload.expectedType) {
    throw new Error('callLegalReview: expectedType is required')
  }
  if (!Array.isArray(payload.candidateSpan) || payload.candidateSpan.length !== 2) {
    throw new Error('callLegalReview: candidateSpan must be [start, end]')
  }

  const snippet = payload.snippet.slice(0, MAX_SNIPPET_CHARS)
  const response = await fetch(`${API_BASE}/llm/legal-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      snippet,
    }),
    signal: options?.signal,
  })

  if (response.status === 404) {
    throw new Error(
      'callLegalReview: pratica o endpoint /llm/legal-review non disponibile'
    )
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const data = (await response.json()) as { error?: string; message?: string }
      detail = data.error || data.message || detail
    } catch {
      // keep statusText
    }
    throw new Error(`callLegalReview: ${detail}`)
  }

  const data = (await response.json()) as LegalReviewResult
  if (typeof data.valid !== 'boolean') {
    throw new Error('callLegalReview: invalid response (missing valid)')
  }
  if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence)) {
    throw new Error('callLegalReview: invalid response (confidence)')
  }
  return data
}

/** True se l’entità è nel perimetro multipass org/venue/company. */
export function isLegalReviewEligible(kind: string, subtype: string): boolean {
  return isReviewEligible({ kind, subtype })
}
