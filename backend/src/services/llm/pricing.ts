/**
 * Prezzi Groq verificati e conversione USD/EUR con tasso ECB.
 * Un modello senza prezzo noto resta esplicitamente "n/d": non inventiamo costi.
 */

import { config } from '../../config/index.js'
import type { CallCost, ModelPricing } from './types.js'

const ECB_DAILY_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
const FX_CACHE_MS = 12 * 60 * 60 * 1000

/**
 * Prezzo ufficiale Groq rilevato il 24 luglio 2026.
 * Aggiungere modelli solo dopo verifica su https://groq.com/pricing.
 */
const VERIFIED_GROQ_PRICING: Readonly<Record<string, ModelPricing>> = {
  'llama-3.3-70b-versatile': {
    modelId: 'llama-3.3-70b-versatile',
    inputUsdPer1M: 0.59,
    outputUsdPer1M: 0.79,
    source: 'https://groq.com/pricing',
    asOf: '2026-07-24',
  },
  'llama-3.1-8b-instant': {
    modelId: 'llama-3.1-8b-instant',
    inputUsdPer1M: 0.05,
    outputUsdPer1M: 0.08,
    source: 'https://groq.com/pricing',
    asOf: '2026-07-24',
  },
}

let fxCache: { value: number; fetchedAt: number; source: 'ecb' | 'fallback' } | null = null

/** Restituisce il prezzo verificato, oppure null per un modello non prezzato. */
export function getGroqModelPricing(modelId: string): ModelPricing | null {
  return VERIFIED_GROQ_PRICING[modelId] ?? null
}

/** Elenca esclusivamente i prezzi verificati esposti al frontend. */
export function listGroqPricing(): ModelPricing[] {
  return Object.values(VERIFIED_GROQ_PRICING)
}

/** Calcola il costo token senza attribuire costo zero ai modelli sconosciuti. */
export async function computeGroqCallCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<CallCost> {
  validateTokenCount(inputTokens, 'inputTokens')
  validateTokenCount(outputTokens, 'outputTokens')
  const pricing = getGroqModelPricing(modelId)
  if (!pricing) {
    return {
      pricingFound: false,
      costUsd: null,
      costEur: null,
      usdToEur: null,
    }
  }

  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputUsdPer1M
    + (outputTokens / 1_000_000) * pricing.outputUsdPer1M
  const usdToEur = await getUsdToEur()

  return {
    pricingFound: true,
    costUsd,
    costEur: costUsd * usdToEur,
    usdToEur,
  }
}

/** Recupera USD→EUR da ECB e usa il fallback configurato solo se ECB non risponde. */
export async function getUsdToEur(): Promise<number> {
  if (fxCache && Date.now() - fxCache.fetchedAt < FX_CACHE_MS) {
    return fxCache.value
  }

  try {
    const response = await fetch(ECB_DAILY_URL, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) {
      throw new Error(`ECB HTTP ${response.status}`)
    }
    const xml = await response.text()
    const match = xml.match(/currency=['"]USD['"]\s+rate=['"]([0-9.]+)['"]/)
    const eurToUsd = Number(match?.[1])
    if (!Number.isFinite(eurToUsd) || eurToUsd <= 0) {
      throw new Error('ECB USD rate missing')
    }
    fxCache = {
      value: 1 / eurToUsd,
      fetchedAt: Date.now(),
      source: 'ecb',
    }
  } catch {
    fxCache = {
      value: config.USD_TO_EUR_FALLBACK,
      fetchedAt: Date.now(),
      source: 'fallback',
    }
  }
  return fxCache.value
}

/** Espone tasso e provenienza senza effettuare una seconda richiesta. */
export async function getExchangeRateSnapshot(): Promise<{
  usdToEur: number
  source: 'ecb' | 'fallback'
}> {
  const usdToEur = await getUsdToEur()
  return {
    usdToEur,
    source: fxCache?.source ?? 'fallback',
  }
}

function validateTokenCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}
