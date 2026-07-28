/**
 * Gate di readiness per estrazione anagrafiche / ricerca: DB non richiesto.
 * Pronto = testo nativo oppure OCR completato (anche solo in memoria UI).
 */

import type { Documento } from '../../types'
import { loadOcrState } from '../../utils/ocrState'
import { resolveExtractionDocumentKind, unsupportedDocumentDetail } from './adapters/document-kind'

export type ExtractionReadinessStatus =
  | 'ready-native'
  | 'ready-ocr'
  | 'ocr-in-progress'
  | 'ocr-required'
  | 'unsupported'

export type ExtractionReadiness = {
  status: ExtractionReadinessStatus
  detail?: string
}

export type OcrUiHints = {
  progressByDocId?: Record<string, number>
}

const isOcrCompletedStatus = (status: Documento['ocrStatus'] | undefined): boolean =>
  status === 'completed' || status === 'low_confidence'

const isOcrProcessingStatus = (status: Documento['ocrStatus'] | undefined): boolean =>
  status === 'processing'

/**
 * Legge progress OCR dalla UI (memory/localStorage) per documenti non ancora persistiti.
 */
export function resolveOcrUiProgress(
  praticaId: string | undefined,
  docId: string,
  hints?: OcrUiHints
): number | undefined {
  const fromHint = hints?.progressByDocId?.[docId]
  if (typeof fromHint === 'number' && Number.isFinite(fromHint)) return fromHint
  if (!praticaId?.trim()) return undefined
  const stored = loadOcrState(praticaId).progress?.[docId]
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : undefined
}

/**
 * Classifica se un documento può entrare nell’estrazione senza dipendere dal DB.
 */
export function classifyExtractionReadiness(
  doc: Documento,
  hints?: OcrUiHints
): ExtractionReadiness {
  const kind = resolveExtractionDocumentKind(doc)
  if (kind === 'unsupported') {
    return { status: 'unsupported', detail: unsupportedDocumentDetail(doc) }
  }

  if (kind === 'word') {
    return { status: 'ready-native' }
  }

  // hasNativeText true → pronto; undefined → prova testo nativo client (rilevazione thumbnail ancora in corso)
  if (doc.hasNativeText !== false) {
    return { status: 'ready-native' }
  }

  // Testo OCR già sul documento (es. pratica ricaricata) → pronto indipendentemente dal badge UI
  if (doc.ocrText?.trim()) {
    return { status: 'ready-ocr' }
  }

  const uiProgress = resolveOcrUiProgress(doc.praticaId, doc.id, hints)
  if (isOcrProcessingStatus(doc.ocrStatus) || (typeof uiProgress === 'number' && uiProgress >= 0 && uiProgress < 100)) {
    return {
      status: 'ocr-in-progress',
      detail: 'OCR in corso: attendi il completamento e riprova',
    }
  }

  if (isOcrCompletedStatus(doc.ocrStatus) || uiProgress === 100) {
    return { status: 'ready-ocr' }
  }

  return {
    status: 'ocr-required',
    detail: 'OCR non completato: avvia la trascrizione e attendi "Trascritto"',
  }
}

/** Elenco titoli con OCR ancora in corso. */
export function listOcrInProgressTitles(
  documents: Documento[],
  hints?: OcrUiHints
): string[] {
  return documents
    .filter(doc => classifyExtractionReadiness(doc, hints).status === 'ocr-in-progress')
    .map(doc => doc.filename)
}

/** Messaggio bloccante quando almeno un documento ha OCR in corso. */
export function formatOcrInProgressMessage(titles: string[]): string {
  if (titles.length === 0) {
    throw new Error('formatOcrInProgressMessage: titles non può essere vuoto')
  }
  const lines = titles.map(title => `• ${title}`)
  return (
    `OCR ancora in corso su alcuni documenti. Attendi il completamento e riprova:\n${lines.join('\n')}`
  )
}
