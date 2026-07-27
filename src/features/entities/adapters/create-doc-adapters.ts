/**
 * Factory unica: sceglie l’adapter corretto (PDF/Word) o marca il documento come saltato.
 */

import { api } from '../../../lib/api'
import type { Documento } from '../../../types'
import { resolveExtractionDocumentKind, unsupportedDocumentDetail } from './document-kind'
import { MammothDocAdapter } from './MammothDocAdapter'
import { ResolvedContentDocAdapter } from './ResolvedContentDocAdapter'
import type { AdapterBuildResult, SkippedDocument } from './types'

function resolveFileUrl(doc: Documento): string {
  const localUrl = (doc as { localUrl?: string }).localUrl
  if (localUrl) return localUrl
  return api.getLocalFileUrl(doc.s3Key)
}

/**
 * Costruisce gli adapter di estrazione per i documenti della pratica.
 * I formati non supportati finiscono in `skipped` senza interrompere il batch.
 */
export function createDocAdapters(
  docs: Documento[]
): AdapterBuildResult {
  const adapters: AdapterBuildResult['adapters'] = []
  const skipped: SkippedDocument[] = []

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

    const common = {
      praticaId: doc.praticaId,
      docId: doc.id,
      title: doc.filename,
      hash: doc.hash,
    }

    if (kind === 'pdf') {
      adapters.push(new ResolvedContentDocAdapter({
        ...common,
        storageKey: doc.s3Key,
      }))
      continue
    }

    adapters.push(new MammothDocAdapter({
      ...common,
      url: resolveFileUrl(doc),
    }))
  }

  return { adapters, skipped }
}
