/**
 * Utility testo/geometria riusate dall’estrazione anagrafiche, tipizzate per PageToken.
 */

import type { PageToken } from '../entities/adapters/types'
import {
  bboxForSubstring as baseBboxForSubstring,
  makeSnippet as baseMakeSnippet,
  normalizeAnalysisTokens,
  pageText as basePageText,
} from '../entities/extract-text-utils'
import type { BoxPct } from './types'

export type TextToken = PageToken

/** Costruisce il testo normalizzato di pagina da token OCR. */
export function buildPageText(tokens: TextToken[]): string {
  if (!Array.isArray(tokens)) throw new Error('buildPageText: tokens must be an array')
  return basePageText(normalizeAnalysisTokens(tokens))
}

/** Box unione per una sottostringa del testo normalizzato. */
export function bboxForSubstring(tokens: TextToken[], start: number, length: number): BoxPct {
  if (!Array.isArray(tokens)) throw new Error('bboxForSubstring: tokens must be an array')
  if (!Number.isFinite(start) || start < 0) throw new Error('bboxForSubstring: invalid start')
  if (!Number.isFinite(length) || length < 0) throw new Error('bboxForSubstring: invalid length')
  return baseBboxForSubstring(normalizeAnalysisTokens(tokens), start, length)
}

/** Snippet compatto attorno a un match. */
export function makeSnippet(text: string, start: number, length: number): string {
  if (typeof text !== 'string') throw new Error('makeSnippet: text must be a string')
  return baseMakeSnippet(text, start, length)
}

/** Finestra di contesto testuale attorno a un offset. */
export function contextWindow(text: string, start: number, end: number, radius = 80): string {
  if (typeof text !== 'string') throw new Error('contextWindow: text must be a string')
  const from = Math.max(0, start - radius)
  const to = Math.min(text.length, end + radius)
  return text.slice(from, to)
}

/** Distanza assoluta tra due span (0 se si sovrappongono). */
export function spanDistance(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  if (aEnd < bStart) return bStart - aEnd
  if (bEnd < aStart) return aStart - bEnd
  return 0
}

/** Trova il candidato più vicino entro `maxDistance`, o null se ambiguo/assente. */
export function nearestUnique<T extends { start: number; end: number }>(
  target: { start: number; end: number },
  candidates: T[],
  maxDistance: number
): T | null {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new Error('nearestUnique: maxDistance must be >= 0')
  }
  let best: T | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let tie = false
  for (const candidate of candidates) {
    const distance = spanDistance(target.start, target.end, candidate.start, candidate.end)
    if (distance > maxDistance) continue
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tie = false
    } else if (distance === bestDistance) {
      tie = true
    }
  }
  return tie ? null : best
}
