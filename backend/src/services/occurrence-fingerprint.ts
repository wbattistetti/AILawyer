/**
 * Hash deterministico per deduplicare evidenze documentali senza dipendere dal dominio.
 */

import { createHash } from 'node:crypto'

/**
 * Normalizza lo snippet per rendere stabili fingerprint su whitespace equivalente.
 */
export function normalizeEvidenceSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim()
}

/**
 * Produce un fingerprint SHA-256 a partire da parti già canonicalizzate.
 */
export function createEvidenceFingerprint(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}
