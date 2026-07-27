/**
 * Client Node → microservizio NLP locale per review NER batch di snippet.
 */

import { z } from 'zod'
import { config } from '../config/index.js'

export const nerReviewItemSchema = z.object({
  id: z.string().min(1).max(200),
  snippet: z.string().min(1).max(500),
  expectedType: z.enum(['institution', 'company', 'venue']),
  candidateSpan: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  candidateLabel: z.string().min(1).max(300),
})

export const nerReviewResultSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['confirmed', 'corrected', 'rejected', 'uncertain']),
  correctedSpan: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]).nullable(),
  detectedLabel: z.string().nullable(),
  modelId: z.string().min(1),
})

const nerBatchResponseSchema = z.object({
  ok: z.literal(true),
  results: z.array(nerReviewResultSchema),
  latency_ms: z.number().int().nonnegative(),
  model: z.string().min(1),
})

export type NerReviewItem = z.infer<typeof nerReviewItemSchema>
export type NerReviewResult = z.infer<typeof nerReviewResultSchema>

/** Invia un unico batch locale e valida rigorosamente cardinalità e ID. */
export async function reviewSnippetsWithNer(
  items: NerReviewItem[],
  signal?: AbortSignal,
): Promise<{
  results: NerReviewResult[]
  latencyMs: number
  model: string
}> {
  const validated = z.array(nerReviewItemSchema).min(1).max(500).parse(items)
  validateCandidateSpans(validated)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.NLP_TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`${config.NLP_SERVICE_URL}/ner/review-snippets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: validated }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`NLP service HTTP ${response.status}: ${text.slice(0, 500)}`)
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('NLP service returned invalid JSON')
    }
    const payload = nerBatchResponseSchema.parse(json)
    const expectedIds = new Set(validated.map(item => item.id))
    const receivedIds = new Set(payload.results.map(result => result.id))
    if (
      expectedIds.size !== receivedIds.size
      || [...expectedIds].some(id => !receivedIds.has(id))
    ) {
      throw new Error('NLP service response IDs do not match request')
    }
    return {
      results: payload.results,
      latencyMs: payload.latency_ms,
      model: payload.model,
    }
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`NLP service timeout after ${config.NLP_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

function validateCandidateSpans(items: NerReviewItem[]): void {
  for (const item of items) {
    const [start, end] = item.candidateSpan
    if (end <= start || end > item.snippet.length) {
      throw new Error(`${item.id}: candidateSpan outside snippet`)
    }
    if (item.snippet.slice(start, end) !== item.candidateLabel) {
      throw new Error(`${item.id}: candidateLabel does not match candidateSpan`)
    }
  }
}
