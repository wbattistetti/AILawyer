/**
 * Aggregazione pura dei costi LLM per operazione all'interno di una pratica.
 */

import type { PracticeAiCall } from '../../lib/api'

export type AiOperationCost = {
  operationId: string
  purpose: string
  modelLabel: string
  calls: number
  inputTokens: number
  outputTokens: number
  costEur: number
  unpricedCalls: number
  durationMs: number
  errors: number
  lastAt: string
}

/** Raggruppa più review della stessa estrazione in una riga di report. */
export function aggregateAiCallsByOperation(
  calls: readonly PracticeAiCall[],
): AiOperationCost[] {
  const byOperation = new Map<string, AiOperationCost>()
  for (const call of calls) {
    const current = byOperation.get(call.operationId) ?? {
      operationId: call.operationId,
      purpose: call.purpose,
      modelLabel: `${call.providerId}/${call.modelId}`,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costEur: 0,
      unpricedCalls: 0,
      durationMs: 0,
      errors: 0,
      lastAt: call.createdAt,
    }
    current.calls += 1
    current.inputTokens += call.inputTokens
    current.outputTokens += call.outputTokens
    current.durationMs += call.durationMs
    current.costEur += call.costEur ?? 0
    if (!call.pricingFound) current.unpricedCalls += 1
    if (call.error) current.errors += 1
    if (call.createdAt > current.lastAt) current.lastAt = call.createdAt
    if (!current.modelLabel.includes(`${call.providerId}/${call.modelId}`)) {
      current.modelLabel += ' + altri'
    }
    byOperation.set(call.operationId, current)
  }
  return [...byOperation.values()].sort((left, right) =>
    right.lastAt.localeCompare(left.lastAt),
  )
}

/** Formatta euro mantenendo visibili anche costi molto piccoli. */
export function formatAiCostEur(value: number): string {
  const digits = value > 0 && value < 0.01 ? 5 : 2
  return `${value.toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} €`
}
