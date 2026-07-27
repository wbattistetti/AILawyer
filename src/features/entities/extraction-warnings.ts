/**
 * Formatta il report dei documenti saltati o falliti durante l’estrazione.
 */

import type { SkippedDocument } from './adapters/types'

/** Costruisce un messaggio UI conciso da skipped + failures. */
export function formatExtractionWarnings(items: SkippedDocument[]): string | null {
  if (!items.length) return null
  const lines = items.map(item => {
    const reason =
      item.reason === 'unsupported'
        ? (item.detail || 'formato non supportato')
        : (item.detail || 'documento illeggibile')
    return `• ${item.title}: ${reason}`
  })
  return `Alcuni documenti non sono stati elaborati:\n${lines.join('\n')}`
}
