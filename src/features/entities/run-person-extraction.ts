/**
 * Job di estrazione anagrafiche practice-wide, indipendente dal montaggio della tab.
 */

import {
  averageMs,
  computeExtractionTabProgress,
  estimateRemainingMs,
  formatDurationMs,
  pushPageSample,
} from './extract-progress'
import { loadOcrState } from '../../utils/ocrState'
import {
  createDocumentExtractionPlan,
  updatePracticeDocumentSignature,
} from './document-extraction-plan'
import { formatOcrInProgressMessage } from './document-extraction-readiness'
import { extractPersonsFromDocs } from './extract-orchestrator'
import { formatZeroExtractionDiagnostics } from './extraction-diagnostics'
import { formatExtractionWarnings } from './extraction-warnings'
import {
  getPersonDraft,
  mergePersonDraftFromExtraction,
  setPersonExtractionProgress,
  setPersonExtractionRunning,
} from './person-draft-store'
import {
  buildPracticeExtractionAdapters,
  listPracticeDocMeta,
} from './practice-document-source'

export type PersonExtractionJobResult = {
  warning: string | null
}

/**
 * Esegue estrazione/aggiornamento incrementale e aggiorna la bozza + progresso toolbar.
 */
export async function runPersonExtraction(
  praticaId: string
): Promise<PersonExtractionJobResult> {
  if (!praticaId.trim()) {
    throw new Error('runPersonExtraction: praticaId is required')
  }

  setPersonExtractionRunning(praticaId, true)
  let pageSamples: number[] = []
  let lastPageAt = Date.now()

  try {
    const allDocuments = listPracticeDocMeta(praticaId)
    const currentDraft = getPersonDraft(praticaId)
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
      mergePersonDraftFromExtraction({
        praticaId,
        persons: [],
        occurrences: [],
        snapshots: [],
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
      return { warning: null }
    }

    if (extractionPlan.removedDocumentIds.length > 0) {
      mergePersonDraftFromExtraction({
        praticaId,
        persons: [],
        occurrences: [],
        snapshots: [],
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
      setPersonExtractionRunning(praticaId, true)
    }

    const ocrHints = {
      progressByDocId: loadOcrState(praticaId).progress || {},
    }
    const { adapters, skipped, waitingOnOcr } = buildPracticeExtractionAdapters(
      praticaId,
      extractionPlan.documentIdsToExtract,
      ocrHints
    )
    if (waitingOnOcr.length > 0) {
      throw new Error(formatOcrInProgressMessage(waitingOnOcr.map(item => item.title)))
    }
    if (adapters.length === 0) {
      const warningMessage = formatExtractionWarnings(skipped)
      throw new Error(warningMessage || 'Nessun documento supportato per l\'estrazione')
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

    const publishProgress = () => {
      const base = computeExtractionTabProgress({
        docsDone,
        docsTotal: adapters.length,
        pagesDone,
        pagesTotal,
        currentTitle,
        phaseLabel: 'Anagrafiche',
      })
      const remaining = estimateRemainingMs(pagesDone, pagesTotal, avgMsPerPage)
      setPersonExtractionProgress(praticaId, {
        ...base,
        label: remaining == null
          ? base.label
          : `${base.label} · ~${formatDurationMs(remaining)}`,
      })
    }

    publishProgress()
    lastPageAt = Date.now()
    pageSamples = []

    const result = await extractPersonsFromDocs(
      adapters,
      ({ page }) => {
        const now = Date.now()
        const elapsedPage = Math.max(0, now - lastPageAt)
        lastPageAt = now
        pageSamples = pushPageSample(pageSamples, elapsedPage)
        avgMsPerPage = averageMs(pageSamples)
        pagesDone = Math.min(pagesTotal, pagesDone + 1)
        void page
        publishProgress()
      },
      {
        persist: false,
        onStartDoc: info => {
          lastPageAt = Date.now()
          currentTitle = info.title
          publishProgress()
        },
        onDoneDoc: () => {
          docsDone = Math.min(adapters.length, docsDone + 1)
          publishProgress()
        },
      }
    )

    const failedDocIds = new Set([
      ...skipped.map(item => item.docId),
      ...result.failures.map(item => item.docId),
    ])
    const extractedDocIds = adapters
      .map(adapter => adapter.getIdentity().docId)
      .filter(docId => Boolean(docId) && !failedDocIds.has(docId))

    mergePersonDraftFromExtraction({
      praticaId,
      persons: result.persons,
      occurrences: result.occurrences,
      snapshots: result.snapshots,
      processedDocIds: [
        ...extractionPlan.removedDocumentIds,
        ...extractedDocIds,
      ],
      documentSignature: updatePracticeDocumentSignature({
        previousSignature: currentDraft?.extractedDocumentSignature ?? null,
        currentDocuments: allDocuments.map(document => ({
          id: document.docId,
          hash: document.hash,
        })),
        processedDocumentIds: extractedDocIds,
        removedDocumentIds: extractionPlan.removedDocumentIds,
      }),
    })

    const partialWarning = formatExtractionWarnings([...skipped, ...result.failures])
    const zeroResultDiagnostic = formatZeroExtractionDiagnostics(result.diagnostics)
    const messages = [partialWarning, zeroResultDiagnostic].filter(
      (message): message is string => Boolean(message)
    )
    return { warning: messages.length > 0 ? messages.join('\n\n') : null }
  } catch (cause) {
    setPersonExtractionRunning(praticaId, false)
    throw cause instanceof Error ? cause : new Error('Estrazione anagrafiche fallita')
  } finally {
    setPersonExtractionProgress(praticaId, null)
    setPersonExtractionRunning(praticaId, false)
  }
}
