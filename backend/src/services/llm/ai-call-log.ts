/**
 * Persistenza e riepilogo delle chiamate LLM, sempre attribuite a una pratica.
 */

import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/database.js'
import { computeGroqCallCost } from './pricing.js'

export type AppendAiCallInput = {
  praticaId: string
  operationId?: string
  purpose: string
  providerId: 'groq'
  modelId: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  error?: string | null
}

/** Calcola il costo e salva una chiamata senza contenuto/prompt sensibile. */
export async function appendAiCall(input: AppendAiCallInput) {
  validateInput(input)
  const cost = await computeGroqCallCost(
    input.modelId,
    input.inputTokens,
    input.outputTokens,
  )

  return prisma.chiamataIa.create({
    data: {
      praticaId: input.praticaId,
      operationId: input.operationId?.trim() || randomUUID(),
      purpose: input.purpose.trim(),
      providerId: input.providerId,
      modelId: input.modelId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: cost.costUsd,
      costEur: cost.costEur,
      pricingFound: cost.pricingFound,
      durationMs: input.durationMs,
      error: input.error?.slice(0, 1000) || null,
    },
  })
}

/** Elenca le chiamate di una pratica, dalla più recente. */
export async function listPracticeAiCalls(praticaId: string) {
  if (!praticaId.trim()) throw new Error('praticaId is required')
  return prisma.chiamataIa.findMany({
    where: { praticaId },
    orderBy: { createdAt: 'desc' },
  })
}

/** Rimuove esclusivamente il log della pratica indicata. */
export async function clearPracticeAiCalls(praticaId: string): Promise<number> {
  if (!praticaId.trim()) throw new Error('praticaId is required')
  const result = await prisma.chiamataIa.deleteMany({ where: { praticaId } })
  return result.count
}

/** Costruisce aggregati practice-scoped senza perdere l'informazione "prezzo mancante". */
export function summarizeAiCalls(
  calls: Array<{
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    costEur: number | null
    pricingFound: boolean
    durationMs: number
    error: string | null
  }>,
) {
  const pricedCalls = calls.filter(call => call.pricingFound)
  return {
    callCount: calls.length,
    errorCount: calls.filter(call => Boolean(call.error)).length,
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    durationMs: calls.reduce((sum, call) => sum + call.durationMs, 0),
    costUsd: pricedCalls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0),
    costEur: pricedCalls.reduce((sum, call) => sum + (call.costEur ?? 0), 0),
    unpricedCallCount: calls.length - pricedCalls.length,
  }
}

function validateInput(input: AppendAiCallInput): void {
  if (!input.praticaId?.trim()) throw new Error('praticaId is required')
  if (!input.purpose?.trim()) throw new Error('purpose is required')
  if (!input.modelId?.trim()) throw new Error('modelId is required')
  for (const [name, value] of [
    ['inputTokens', input.inputTokens],
    ['outputTokens', input.outputTokens],
    ['durationMs', input.durationMs],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`)
    }
  }
}
