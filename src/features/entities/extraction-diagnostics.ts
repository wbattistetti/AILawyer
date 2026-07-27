/**
 * Diagnostica strutturata della pipeline anagrafica, un record per documento.
 */

import type { DocumentTextSource } from './adapters/types'

export type ExtractionDiagnosticStatus =
  | 'extracted'
  | 'no-candidates'
  | 'no-text'
  | 'failed'

export type DocumentExtractionDiagnostic = {
  docId: string
  title: string
  source: DocumentTextSource | 'unknown'
  status: ExtractionDiagnosticStatus
  pages: number
  tokenCount: number
  textCharacters: number
  candidateCount: number
  message: string
}

/** Determina un esito esplicito distinguendo testo assente e detector senza match. */
export function createExtractionDiagnostic(input: Omit<DocumentExtractionDiagnostic, 'status' | 'message'>): DocumentExtractionDiagnostic {
  if (input.tokenCount === 0 || input.textCharacters === 0) {
    return {
      ...input,
      status: 'no-text',
      message: 'Nessun testo analizzabile ricevuto dalla sorgente documentale',
    }
  }
  if (input.candidateCount === 0) {
    return {
      ...input,
      status: 'no-candidates',
      message: 'Testo disponibile, ma nessun candidato persona ha superato le regole correnti',
    }
  }
  return {
    ...input,
    status: 'extracted',
    message: `${input.candidateCount} occorrenze persona rilevate`,
  }
}

/** Diagnostica per errori di risoluzione/lettura. */
export function createFailedDiagnostic(input: {
  docId: string
  title: string
  message: string
}): DocumentExtractionDiagnostic {
  return {
    docId: input.docId,
    title: input.title,
    source: 'unknown',
    status: 'failed',
    pages: 0,
    tokenCount: 0,
    textCharacters: 0,
    candidateCount: 0,
    message: input.message,
  }
}

/** Testo sintetico per la UI quando nessuna persona viene estratta. */
export function formatZeroExtractionDiagnostics(
  diagnostics: DocumentExtractionDiagnostic[]
): string | null {
  if (diagnostics.length === 0 || diagnostics.some(item => item.candidateCount > 0)) return null
  const analyzed = diagnostics.filter(item => item.status !== 'failed')
  if (analyzed.length === 0) return null
  const lines = analyzed.map(item =>
    `• ${item.title} [${item.source}]: ${item.message} ` +
    `(pagine ${item.pages}, token ${item.tokenCount})`
  )
  return `Nessuna anagrafica rilevata. Diagnostica per documento:\n${lines.join('\n')}`
}
