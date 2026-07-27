/**
 * Review LLM di candidati organization/company/venue su snippet originale.
 * Lo span è l'unica fonte autorevole; la label viene ricostruita dallo snippet.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { config } from '../../config/index.js'
import { appendAiCall } from './ai-call-log.js'
import { callGroqChat } from './groq-client.js'

const MAX_SNIPPET_CHARS = 500

export const legalReviewRequestSchema = z.object({
  praticaId: z.string().min(1),
  operationId: z.string().min(1).optional(),
  snippet: z.string().min(1).max(MAX_SNIPPET_CHARS),
  expectedType: z.enum(['venue', 'company', 'institution']),
  candidateSpan: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  candidateLabel: z.string().min(1).max(300),
  flags: z.array(z.string().min(1).max(80)).max(20),
  model: z.string().min(1).max(160).optional(),
})

const legalReviewResponseSchema = z.object({
  valid: z.boolean(),
  correctedSpan: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]).nullable(),
  normalizedLabel: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
})

export type LegalReviewRequest = z.infer<typeof legalReviewRequestSchema>
export type LegalReviewResponse = z.infer<typeof legalReviewResponseSchema> & {
  model: string
  operationId: string
}

const SYSTEM_PROMPT = `Sei un validatore deterministico di entità in testi legali italiani con OCR.
Devi valutare esclusivamente il candidato indicato dall'utente.
Tipi ammessi: institution, company, venue.
Correggi solo i confini, senza inventare o correggere ortograficamente il testo.
correctedSpan usa indici [start,end) relativi allo snippet originale.
normalizedLabel deve essere esattamente snippet.slice(start,end).
Se non esiste una vera entità del tipo atteso, restituisci valid=false e campi null.
Rispondi esclusivamente con JSON:
{"valid":boolean,"correctedSpan":[number,number]|null,"normalizedLabel":string|null,"confidence":number}`

/** Esegue review, valida l'output e registra sempre costo/errore per la pratica. */
export async function reviewLegalEntity(
  rawInput: unknown,
  signal?: AbortSignal,
): Promise<LegalReviewResponse> {
  const input = legalReviewRequestSchema.parse(rawInput)
  validateCandidateSpan(input)
  const model = input.model ?? config.GROQ_LEGAL_REVIEW_MODEL
  const operationId = input.operationId ?? randomUUID()
  const startedAt = Date.now()
  let inputTokens = 0
  let outputTokens = 0

  try {
    const completion = await callGroqChat({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userMessage: JSON.stringify({
        snippet: input.snippet,
        expectedType: input.expectedType,
        candidateSpan: input.candidateSpan,
        candidateLabel: input.candidateLabel,
        flags: input.flags,
      }),
      maxTokens: 300,
      temperature: 0,
      jsonMode: true,
      ...(signal ? { signal } : {}),
    })
    inputTokens = completion.usage.inputTokens
    outputTokens = completion.usage.outputTokens

    const parsedJson = parseJsonObject(completion.content)
    const rawResult = legalReviewResponseSchema.parse(parsedJson)
    const result = normalizeReviewResult(input.snippet, rawResult)

    await appendAiCall({
      praticaId: input.praticaId,
      operationId,
      purpose: 'legal-entity-review',
      providerId: 'groq',
      modelId: completion.model,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - startedAt,
    })

    return {
      ...result,
      model: completion.model,
      operationId,
    }
  } catch (error) {
    const original = error instanceof Error ? error : new Error(String(error))
    try {
      await appendAiCall({
        praticaId: input.praticaId,
        operationId,
        purpose: 'legal-entity-review',
        providerId: 'groq',
        modelId: model,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        error: original.message,
      })
    } catch (logError) {
      const detail = logError instanceof Error ? logError.message : String(logError)
      throw new Error(`${original.message}; AI cost logging failed: ${detail}`, {
        cause: original,
      })
    }
    throw original
  }
}

function validateCandidateSpan(input: LegalReviewRequest): void {
  const [start, end] = input.candidateSpan
  if (end <= start || end > input.snippet.length) {
    throw new Error('candidateSpan must be non-empty and inside snippet')
  }
  if (input.snippet.slice(start, end) !== input.candidateLabel) {
    throw new Error('candidateLabel must exactly match snippet candidateSpan')
  }
}

function normalizeReviewResult(
  snippet: string,
  result: z.infer<typeof legalReviewResponseSchema>,
): z.infer<typeof legalReviewResponseSchema> {
  if (!result.valid) {
    return { ...result, correctedSpan: null, normalizedLabel: null }
  }
  if (!result.correctedSpan) {
    throw new Error('Invalid LLM result: accepted entity requires correctedSpan')
  }
  const [start, end] = result.correctedSpan
  if (end <= start || end > snippet.length) {
    throw new Error('Invalid LLM result: correctedSpan outside snippet')
  }
  return {
    ...result,
    normalizedLabel: snippet.slice(start, end),
  }
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Groq legal-review response is not valid JSON')
  }
}
