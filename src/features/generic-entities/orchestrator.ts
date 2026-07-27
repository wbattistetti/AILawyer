/**
 * Orchestrator practice-wide su DocAdapter[] con AbortSignal, progress e continuità su fallimenti.
 */

import type { DocAdapter } from '../entities/adapters/types'
import { canonicalizeGenericExtraction, type CanonicalPageBatch } from './canonicalize'
import { detectGenericEntitiesOnPage } from './detect-page'
import type {
  GenericExtractionProgress,
  GenericExtractionResult,
  SkippedDocumentFailure,
} from './types'

export type ExtractGenericEntitiesOptions = {
  praticaId: string
  signal?: AbortSignal
  nowMs?: number
  onProgress?: (progress: GenericExtractionProgress) => void
  onDocFailure?: (failure: SkippedDocumentFailure) => void
}

/**
 * Estrae entità generiche da più documenti, proseguendo dopo errori per-documento.
 */
export async function extractGenericEntitiesFromDocs(
  adapters: DocAdapter[],
  options: ExtractGenericEntitiesOptions
): Promise<GenericExtractionResult> {
  if (!Array.isArray(adapters)) {
    throw new Error('extractGenericEntitiesFromDocs: adapters must be an array')
  }
  if (!options?.praticaId) {
    throw new Error('extractGenericEntitiesFromDocs: praticaId is required')
  }

  const updatedAt = options.nowMs ?? Date.now()
  const batches: CanonicalPageBatch[] = []
  const skipped: SkippedDocumentFailure[] = []
  const docsTotal = adapters.length
  let docsDone = 0
  let pagesDone = 0
  let pagesTotal = 0

  const emitProgress = (current?: { docId: string; title: string }) => {
    options.onProgress?.({
      docsDone,
      docsTotal,
      pagesDone,
      pagesTotal,
      currentDocId: current?.docId,
      currentDocTitle: current?.title,
    })
  }

  for (const adapter of adapters) {
    if (options.signal?.aborted) {
      const identity = safeIdentity(adapter)
      const failure: SkippedDocumentFailure = {
        docId: identity.docId,
        title: identity.title,
        reason: 'aborted',
        detail: 'Extraction aborted by signal',
      }
      skipped.push(failure)
      options.onDocFailure?.(failure)
      break
    }

    const identity = safeIdentity(adapter)
    try {
      const meta = await adapter.getDocMeta()
      pagesTotal += Math.max(0, meta.pages || 0)
      emitProgress({ docId: identity.docId, title: identity.title })

      for await (const page of adapter.streamPageTokens()) {
        if (options.signal?.aborted) {
          throw Object.assign(new Error('Extraction aborted by signal'), { name: 'AbortError' })
        }
        if (!page || !Number.isInteger(page.page) || page.page < 1) {
          throw new Error(`Invalid page payload from document ${identity.docId}`)
        }
        if (!Array.isArray(page.tokens)) {
          throw new Error(`Invalid tokens for ${identity.docId} page ${page.page}`)
        }

        const detected = detectGenericEntitiesOnPage({
          docId: identity.docId,
          title: identity.title,
          page: page.page,
          tokens: page.tokens,
        })
        batches.push({
          docId: identity.docId,
          title: identity.title,
          page: page.page,
          hits: detected.hits,
          relationHints: detected.relationHints,
        })
        pagesDone += 1
        emitProgress({ docId: identity.docId, title: identity.title })
      }
      docsDone += 1
      emitProgress({ docId: identity.docId, title: identity.title })
    } catch (error) {
      const aborted = options.signal?.aborted || (error as { name?: string })?.name === 'AbortError'
      const failure: SkippedDocumentFailure = {
        docId: identity.docId,
        title: identity.title,
        reason: aborted ? 'aborted' : 'unreadable',
        detail: error instanceof Error ? error.message : String(error),
      }
      skipped.push(failure)
      options.onDocFailure?.(failure)
      if (aborted) break
      docsDone += 1
      emitProgress({ docId: identity.docId, title: identity.title })
    }
  }

  return canonicalizeGenericExtraction({
    praticaId: options.praticaId,
    batches,
    skipped,
    updatedAt,
  })
}

function safeIdentity(adapter: DocAdapter): { docId: string; title: string } {
  try {
    const identity = adapter.getIdentity()
    return {
      docId: identity.docId || 'unknown',
      title: identity.title || identity.docId || 'unknown',
    }
  } catch (error) {
    return {
      docId: 'unknown',
      title: error instanceof Error ? error.message : 'unknown',
    }
  }
}
