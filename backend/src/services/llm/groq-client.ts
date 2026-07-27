/**
 * Client server-side Groq OpenAI-compatible con timeout, retry limitato e parsing rigoroso.
 */

import { z } from 'zod'
import { config } from '../../config/index.js'
import type { GroqChatInput, GroqChatResult, GroqModel } from './types.js'

const MAX_ATTEMPTS = 3
const MODEL_CACHE_MS = 5 * 60 * 1000
const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,160}$/

const modelsResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    owned_by: z.string().optional().default('groq'),
    context_window: z.number().int().positive().nullable().optional(),
  })),
})

const chatResponseSchema = z.object({
  model: z.string().min(1),
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().default(0),
    completion_tokens: z.number().int().nonnegative().default(0),
  }).optional(),
})

let modelCache: { models: GroqModel[]; fetchedAt: number } | null = null

/** True quando la chiave Groq è configurata nel processo backend. */
export function isGroqConfigured(): boolean {
  return Boolean(config.GROQ_API_KEY?.trim())
}

/** Elenca i modelli realmente disponibili per la chiave corrente. */
export async function listGroqModels(force = false): Promise<GroqModel[]> {
  requireApiKey()
  if (!force && modelCache && Date.now() - modelCache.fetchedAt < MODEL_CACHE_MS) {
    return modelCache.models
  }

  const response = await requestGroq('/models', { method: 'GET' })
  const payload = modelsResponseSchema.parse(await response.json())
  const models = payload.data
    .filter(item => isChatModelId(item.id))
    .map(item => ({
      id: item.id,
      ownedBy: item.owned_by,
      contextWindow: item.context_window ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  modelCache = { models, fetchedAt: Date.now() }
  return models
}

/** Verifica che un model id sia sintatticamente sicuro e presente nel catalogo live. */
export async function assertGroqModelAvailable(modelId: string): Promise<void> {
  if (!MODEL_ID_PATTERN.test(modelId)) {
    throw new Error('Invalid Groq model id')
  }
  const models = await listGroqModels()
  if (!models.some(model => model.id === modelId)) {
    throw new Error(`Groq model not available: ${modelId}`)
  }
}

/** Esegue una chat completion Groq e restituisce contenuto + uso token validati. */
export async function callGroqChat(input: GroqChatInput): Promise<GroqChatResult> {
  validateChatInput(input)
  await assertGroqModelAvailable(input.model)

  const response = await requestGroq(
    '/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userMessage },
        ],
        temperature: input.temperature,
        max_completion_tokens: input.maxTokens,
        ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    input.signal,
  )

  const payload = chatResponseSchema.parse(await response.json())
  return {
    content: payload.choices[0]!.message.content,
    model: payload.model,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    },
  }
}

async function requestGroq(
  path: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const apiKey = requireApiKey()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.GROQ_TIMEOUT_MS)
    const abort = () => controller.abort()
    externalSignal?.addEventListener('abort', abort, { once: true })

    try {
      const response = await fetch(`${config.GROQ_API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...init.headers,
        },
        signal: controller.signal,
      })
      if (response.ok) return response

      const detail = (await response.text()).slice(0, 500)
      const retryable = response.status === 429 || response.status >= 500
      lastError = new Error(`Groq HTTP ${response.status}: ${detail || response.statusText}`)
      if (!retryable || attempt === MAX_ATTEMPTS) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const aborted = controller.signal.aborted || externalSignal?.aborted
      if (aborted || attempt === MAX_ATTEMPTS) throw lastError
    } finally {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abort)
    }

    await delay(250 * 2 ** (attempt - 1))
  }

  throw lastError ?? new Error('Groq request failed')
}

function requireApiKey(): string {
  const apiKey = config.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured on the backend')
  }
  return apiKey
}

function validateChatInput(input: GroqChatInput): void {
  if (!input.systemPrompt.trim()) throw new Error('systemPrompt is required')
  if (!input.userMessage.trim()) throw new Error('userMessage is required')
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 32 || input.maxTokens > 8192) {
    throw new Error('maxTokens must be an integer between 32 and 8192')
  }
  if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
    throw new Error('temperature must be between 0 and 2')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isChatModelId(modelId: string): boolean {
  return !/(?:whisper|speech|tts|audio|guard|moderation)/iu.test(modelId)
}
