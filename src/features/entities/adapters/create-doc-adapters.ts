/**
 * Factory unica: sceglie l’adapter corretto (PDF nativo client / OCR backend / Word)
 * o marca il documento come saltato / in attesa OCR.
 */

import { api } from '../../../lib/api'
import type { Documento } from '../../../types'
import {
  classifyExtractionReadiness,
  type OcrUiHints,
} from '../document-extraction-readiness'
import { ClientPdfDocAdapter } from './ClientPdfDocAdapter'
import { resolveExtractionDocumentKind, unsupportedDocumentDetail } from './document-kind'
import { MammothDocAdapter } from './MammothDocAdapter'
import { ResolvedContentDocAdapter } from './ResolvedContentDocAdapter'
import { hasStoredOcrText, StoredOcrDocAdapter } from './StoredOcrDocAdapter'
import type { AdapterBuildResult, SkippedDocument } from './types'

export type WaitingOnOcrDocument = {
  docId: string
  title: string
}

export type CreateDocAdaptersResult = AdapterBuildResult & {
  waitingOnOcr: WaitingOnOcrDocument[]
}

function resolveFileUrl(doc: Documento): string {
  const localUrl = (doc as { localUrl?: string }).localUrl
  if (localUrl) return localUrl
  if (!doc.s3Key?.trim()) {
    throw new Error(`URL file mancante per "${doc.filename}"`)
  }
  return api.getLocalFileUrl(doc.s3Key)
}

/**
 * Costruisce gli adapter di estrazione per i documenti della pratica.
 * I formati non supportati o non pronti finiscono in `skipped` / `waitingOnOcr`.
 */
export function createDocAdapters(
  docs: Documento[],
  hints?: OcrUiHints
): CreateDocAdaptersResult {
  const adapters: AdapterBuildResult['adapters'] = []
  const skipped: SkippedDocument[] = []
  const waitingOnOcr: WaitingOnOcrDocument[] = []

  for (const doc of docs) {
    const kind = resolveExtractionDocumentKind(doc)
    if (kind === 'unsupported') {
      skipped.push({
        docId: doc.id,
        title: doc.filename,
        reason: 'unsupported',
        detail: unsupportedDocumentDetail(doc),
      })
      continue
    }

    const readiness = classifyExtractionReadiness(doc, hints)
    if (readiness.status === 'ocr-in-progress') {
      waitingOnOcr.push({ docId: doc.id, title: doc.filename })
      continue
    }
    if (readiness.status === 'ocr-required') {
      skipped.push({
        docId: doc.id,
        title: doc.filename,
        reason: 'unreadable',
        detail: readiness.detail,
      })
      continue
    }
    if (readiness.status === 'unsupported') {
      skipped.push({
        docId: doc.id,
        title: doc.filename,
        reason: 'unsupported',
        detail: readiness.detail || unsupportedDocumentDetail(doc),
      })
      continue
    }

    const common = {
      praticaId: doc.praticaId,
      docId: doc.id,
      title: doc.filename,
      hash: doc.hash,
    }

    if (kind === 'word') {
      adapters.push(new MammothDocAdapter({
        ...common,
        url: resolveFileUrl(doc),
      }))
      continue
    }

    if (readiness.status === 'ready-native') {
      adapters.push(new ClientPdfDocAdapter({
        ...common,
        url: resolveFileUrl(doc),
      }))
      continue
    }

    // OCR già sul documento in store (pratica riaperta) → niente round-trip API.
    if (hasStoredOcrText(doc)) {
      adapters.push(new StoredOcrDocAdapter({
        ...common,
        ocrText: doc.ocrText!,
        ocrLayout: doc.ocrLayout,
      }))
      continue
    }

    adapters.push(new ResolvedContentDocAdapter({
      ...common,
      storageKey: doc.s3Key,
    }))
  }

  return { adapters, skipped, waitingOnOcr }
}
