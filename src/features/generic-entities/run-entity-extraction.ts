/**
 * Job di estrazione entità tipizzate practice-wide, indipendente dal montaggio della tab.
 */

import {
  averageMs,
  computeExtractionTabProgress,
  estimateRemainingMs,
  formatDurationMs,
  pushPageSample,
} from '../entities/extract-progress'
import {
  createDocumentExtractionPlan,
  updatePracticeDocumentSignature,
} from '../entities/document-extraction-plan'
import {
  buildPracticeExtractionAdapters,
  listPracticeDocMeta,
} from '../entities/practice-document-source'
import {
  getEntityDraft,
  mergeEntityDraftFromExtraction,
  replaceEntityDraft,
  setEntityExtractionProgress,
  setEntityExtractionRunning,
} from './entity-draft-store'
import { extractGenericEntitiesFromDocs } from './orchestrator'
import { reviewUncertainEntitiesWithNer } from './review/ner-service'

export type EntityExtractionJobResult = {
  warnings: string[]
}

/**
 * Esegue estrazione/aggiornamento incrementale + NER e aggiorna bozza/progresso.
 */
export async function runEntityExtraction(
  praticaId: string,
  signal?: AbortSignal
): Promise<EntityExtractionJobResult> {
  if (!praticaId.trim()) {
    throw new Error('runEntityExtraction: praticaId is required')
  }

  setEntityExtractionRunning(praticaId, true)
  let pageSamples: number[] = []
  let lastPageAt = Date.now()

  try {
    const allDocuments = listPracticeDocMeta(praticaId)
    const currentDraft = getEntityDraft(praticaId)
    const extractionPlan = createDocumentExtractionPlan(
      currentDraft?.hasExtracted ? currentDraft.extractedDocumentSignature : null,
      allDocuments.map(document => ({ id: document.docId, hash: document.hash }))
    )

    if (
      allDocuments.length === 0
      && extractionPlan.removedDocumentIds.length === 0
    ) {
      throw new Error('Nessun documento disponibile per l\'estrazione')
    }

    if (extractionPlan.documentIdsToExtract.length === 0) {
      mergeEntityDraftFromExtraction({
        praticaId,
        entities: [],
        occurrences: [],
        relations: [],
        processedDocIds: extractionPlan.removedDocumentIds,
        documentSignature: updatePracticeDocumentSignature({
          previousSignature: currentDraft?.extractedDocumentSignature ?? null,
          currentDocuments: allDocuments.map(document => ({
            id: document.docId,
            hash: document.hash,
          })),
          processedDocumentIds: [],
          removedDocumentIds: extractionPlan.removedDocumentIds,
        }),
      })
      return { warnings: [] }
    }

    if (extractionPlan.removedDocumentIds.length > 0) {
      mergeEntityDraftFromExtraction({
        praticaId,
        entities: [],
        occurrences: [],
        relations: [],
        processedDocIds: extractionPlan.removedDocumentIds,
        documentSignature: updatePracticeDocumentSignature({
          previousSignature: currentDraft?.extractedDocumentSignature ?? null,
          currentDocuments: allDocuments.map(document => ({
            id: document.docId,
            hash: document.hash,
          })),
          processedDocumentIds: [],
          removedDocumentIds: extractionPlan.removedDocumentIds,
        }),
      })
      setEntityExtractionRunning(praticaId, true)
    }

    const { adapters, skipped } = buildPracticeExtractionAdapters(
      praticaId,
      extractionPlan.documentIdsToExtract
    )
    if (adapters.length === 0) {
      throw new Error('Nessun documento supportato per l\'estrazione entità')
    }

    const metaSettled = await Promise.allSettled(adapters.map(adapter => adapter.getDocMeta()))
    const pagesTotal = metaSettled.reduce((sum, result) => {
      if (result.status !== 'fulfilled') return sum
      return sum + Math.max(0, result.value.pages || 0)
    }, 0)

    let docsDone = 0
    let pagesDone = 0
    let currentTitle: string | undefined
    let avgMsPerPage: number | null = null

    const publishDocProgress = () => {
      const base = computeExtractionTabProgress({
        docsDone,
        docsTotal: adapters.length,
        pagesDone,
        pagesTotal,
        currentTitle,
        phaseLabel: 'Entità',
      })
      const remaining = estimateRemainingMs(pagesDone, pagesTotal, avgMsPerPage)
      setEntityExtractionProgress(praticaId, {
        ...base,
        label: remaining == null
          ? base.label
          : `${base.label} · ~${formatDurationMs(remaining)}`,
      })
    }

    publishDocProgress()
    lastPageAt = Date.now()
    pageSamples = []

    const regexResult = await extractGenericEntitiesFromDocs(adapters, {
      praticaId,
      onProgress: progress => {
        const now = Date.now()
        const elapsedPage = Math.max(0, now - lastPageAt)
        lastPageAt = now
        pageSamples = pushPageSample(pageSamples, elapsedPage)
        avgMsPerPage = averageMs(pageSamples)
        docsDone = progress.docsDone
        pagesDone = progress.pagesDone
        currentTitle = progress.currentDocTitle || progress.currentDocId || currentTitle
        publishDocProgress()
      },
    })

    const failedDocIds = new Set([
      ...skipped.map(item => item.docId),
      ...regexResult.diagnostics.skipped.map(item => item.docId),
    ])
    const extractedDocIds = adapters
      .map(adapter => adapter.getIdentity().docId)
      .filter(docId => Boolean(docId) && !failedDocIds.has(docId))

    const documentSignature = updatePracticeDocumentSignature({
      previousSignature: currentDraft?.extractedDocumentSignature ?? null,
      currentDocuments: allDocuments.map(document => ({
        id: document.docId,
        hash: document.hash,
      })),
      processedDocumentIds: extractedDocIds,
      removedDocumentIds: extractionPlan.removedDocumentIds,
    })

    const merged = mergeEntityDraftFromExtraction({
      praticaId,
      entities: regexResult.entities,
      occurrences: regexResult.occurrences,
      relations: regexResult.relations,
      processedDocIds: [
        ...extractionPlan.removedDocumentIds,
        ...extractedDocIds,
      ],
      documentSignature,
    })

    const skippedMessages = [
      ...skipped.map(item => `${item.title}: ${item.detail}`),
      ...regexResult.diagnostics.skipped.map(item => `${item.title}: ${item.detail}`),
    ]

    const ner = await reviewUncertainEntitiesWithNer(
      {
        ...regexResult,
        entities: merged.entities,
        occurrences: merged.occurrences,
        relations: merged.relations,
      },
      praticaId,
      {
        signal,
        onProgress: (done, total) => {
          if (total <= 0) return
          setEntityExtractionProgress(praticaId, {
            pct: Math.round((done / Math.max(1, total)) * 100),
            label: `NER ${done}/${total}`,
            done,
            total,
          })
        },
      },
    )

    replaceEntityDraft({
      praticaId,
      entities: ner.result.entities,
      occurrences: ner.result.occurrences,
      relations: ner.result.relations,
      documentSignature,
    })

    return {
      warnings: [
        ...skippedMessages,
        ...ner.failures.map(message => `NER: ${message}`),
      ],
    }
  } catch (cause) {
    setEntityExtractionRunning(praticaId, false)
    if (signal?.aborted) {
      throw cause instanceof Error ? cause : new Error('Estrazione entità annullata')
    }
    throw cause instanceof Error ? cause : new Error('Estrazione entità fallita')
  } finally {
    setEntityExtractionProgress(praticaId, null)
    setEntityExtractionRunning(praticaId, false)
  }
}
