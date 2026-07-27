/**
 * Contratti interni del gateway LLM. Nessun tipo contiene credenziali.
 */

export type LlmUsage = {
  inputTokens: number
  outputTokens: number
}

export type GroqModel = {
  id: string
  ownedBy: string
  contextWindow: number | null
}

export type GroqChatInput = {
  model: string
  systemPrompt: string
  userMessage: string
  maxTokens: number
  temperature: number
  jsonMode?: boolean
  signal?: AbortSignal
}

export type GroqChatResult = {
  content: string
  model: string
  usage: LlmUsage
}

export type ModelPricing = {
  modelId: string
  inputUsdPer1M: number
  outputUsdPer1M: number
  source: string
  asOf: string
}

export type CallCost = {
  pricingFound: boolean
  costUsd: number | null
  costEur: number | null
  usdToEur: number | null
}
