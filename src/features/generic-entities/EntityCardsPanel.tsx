/**
 * Pannello di consultazione delle entità tipizzate.
 * L'estrazione parte dalla toolbar tramite EntityExtractionHost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleDollarSign, LayoutList, Loader2, Sparkles, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { AiCostsModal } from '../ai-costs/AiCostsModal'
import { getEntityIcon } from '../entity-icon-registry'
import { getEntityVisual } from '../entity-visual-catalog'
import {
  findPracticeDocument,
  listPracticeDocMeta,
} from '../entities/practice-document-source'
import { ENTITY_KIND_FILTERS } from './display'
import { EntityAccordion } from './EntityAccordion'
import {
  createEntityDocumentSignature,
  getEntityDraft,
  initializeEntityDraft,
  replaceEntityDraft,
  setEntityExtractionRunning,
  subscribeEntityDraft,
} from './entity-draft-store'
import { isReviewEligible } from './review/review-candidates'
import { reviewUncertainEntities } from './review/review-uncertain-entities'
import type {
  GenericEntity,
  GenericEntityKind,
  GenericOccurrence,
  GenericRelation,
} from './types'

/** Icona del chip filtro: LayoutList per Tutti, altrimenti registry entità. */
function filterChipIcon(id: 'all' | GenericEntityKind): LucideIcon {
  if (id === 'all') return LayoutList
  return getEntityIcon(id)
}

/** Pannello practice-wide delle entità tipizzate. */
export function EntityCardsPanel({
  praticaId,
  onOpenOccurrence,
}: {
  praticaId: string
  onOpenOccurrence: (
    occurrence: GenericOccurrence,
    context?: { highlightQuery?: string; highlightTerms?: string[] }
  ) => void
}) {
  const [entities, setEntities] = useState<GenericEntity[]>([])
  const [occurrences, setOccurrences] = useState<GenericOccurrence[]>([])
  const [relations, setRelations] = useState<GenericRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | GenericEntityKind>('all')
  const [aiCostsOpen, setAiCostsOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [reviewProgress, setReviewProgress] = useState<{
    phase: 'llm'
    done: number
    total: number
  } | null>(null)
  const manualReviewRef = useRef(false)
  const operationAbortRef = useRef<AbortController | null>(null)
  const closeAiCosts = useCallback(() => setAiCostsOpen(false), [])

  useEffect(() => () => operationAbortRef.current?.abort(), [praticaId])

  useEffect(() => {
    void refreshState().catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Caricamento entità fallito')
      setLoading(false)
    })
  }, [praticaId])

  useEffect(() => {
    return subscribeEntityDraft(() => {
      const draft = getEntityDraft(praticaId)
      if (!draft) return
      setEntities(draft.entities)
      setOccurrences(draft.occurrences)
      setRelations(draft.relations)
      setExtracting(draft.extracting)
    })
  }, [praticaId])

  async function refreshState() {
    setLoading(true)
    const all = listPracticeDocMeta(praticaId)
    let draft = getEntityDraft(praticaId)
    if (!draft) {
      const remote = await api.getPracticeEntities(praticaId)
      draft = initializeEntityDraft({
        praticaId,
        entities: remote.entities,
        occurrences: remote.occurrences,
        relations: remote.relations,
        documentSignature: createEntityDocumentSignature(
          all.map(document => ({ id: document.docId, hash: document.hash }))
        ),
        hasExtracted: remote.entities.length > 0,
        isCurrent: all.length > 0,
      })
    }
    setEntities(draft.entities)
    setOccurrences(draft.occurrences)
    setRelations(draft.relations)
    setExtracting(draft.extracting)
    setLoading(false)
  }

  async function onManualAiReview() {
    if (manualReviewRef.current || extracting) return
    const unresolved = entities.filter(
      entity => entity.needsReview && isReviewEligible(entity),
    )
    if (unresolved.length === 0) return

    manualReviewRef.current = true
    const controller = new AbortController()
    operationAbortRef.current?.abort()
    operationAbortRef.current = controller
    setError(null)
    setWarnings([])
    try {
      const review = await reviewUncertainEntities(
        {
          entities,
          occurrences,
          relations,
          diagnostics: {
            pagesProcessed: 0,
            hitCount: entities.length,
            relationHintCount: relations.length,
            skipped: [],
          },
        },
        praticaId,
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            setReviewProgress(total > 0 ? { phase: 'llm', done, total } : null)
          },
        },
      )
      const draft = getEntityDraft(praticaId)
      replaceEntityDraft({
        praticaId,
        entities: review.result.entities,
        occurrences: review.result.occurrences,
        relations: review.result.relations,
        documentSignature: draft?.extractedDocumentSignature ?? '',
      })
      setEntities(review.result.entities)
      setOccurrences(review.result.occurrences)
      setRelations(review.result.relations)
      setWarnings(review.failures.map(message => `Review IA: ${message}`))
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Review IA fallita')
      }
    } finally {
      if (operationAbortRef.current === controller) {
        operationAbortRef.current = null
      }
      manualReviewRef.current = false
      setReviewProgress(null)
      setEntityExtractionRunning(praticaId, false)
    }
  }

  const filteredEntities = useMemo(
    () => filter === 'all' ? entities : entities.filter(entity => entity.kind === filter),
    [entities, filter]
  )

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    map.set('all', entities.length)
    for (const entity of entities) {
      map.set(entity.kind, (map.get(entity.kind) ?? 0) + 1)
    }
    return map
  }, [entities])

  const unresolvedCount = useMemo(
    () => entities.filter(entity => entity.needsReview && isReviewEligible(entity)).length,
    [entities],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">Entità</div>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          disabled={
            unresolvedCount === 0
            || reviewProgress !== null
            || extracting
          }
          onClick={() => { void onManualAiReview() }}
          title="Invia all'IA solo le entità che il NER non ha risolto"
        >
          {reviewProgress?.phase === 'llm'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
          Rivedi con IA{unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border bg-white px-2.5 py-1 text-xs hover:bg-neutral-50"
          onClick={() => setAiCostsOpen(true)}
        >
          <CircleDollarSign className="h-3.5 w-3.5" />
          Costi IA
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {ENTITY_KIND_FILTERS.map(item => {
          const Icon = filterChipIcon(item.id)
          const active = filter === item.id
          const visual = item.id === 'all' ? null : getEntityVisual(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:brightness-95"
              style={{
                borderColor: visual?.color ?? '#cbd5e1',
                backgroundColor: active ? (visual?.color ?? '#0284c7') : (visual?.softColor ?? '#f5f5f5'),
                color: active ? '#ffffff' : (visual?.color ?? '#404040'),
              }}
              onClick={() => setFilter(item.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              <span className="ml-0.5 opacity-80">{counts.get(item.id) ?? 0}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="whitespace-pre-wrap border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {warnings.length > 0 && !error && (
        <details className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer">
            {warnings.length} avvis{warnings.length === 1 ? 'o' : 'i'} durante la verifica
          </summary>
          <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-auto pl-5 text-xs">
            {warnings.map((message, index) => (
              <li key={`${index}:${message}`}>{message}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex-1 overflow-auto px-3">
        {loading ? (
          <div className="p-4 text-sm text-neutral-500">Caricamento…</div>
        ) : extracting && entities.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">Sto estraendo le entità…</div>
        ) : (
          <EntityAccordion
            entities={filteredEntities}
            occurrences={occurrences}
            relations={relations}
            onOpenOccurrence={onOpenOccurrence}
            showKind={filter === 'all'}
            getOccurrencePdfUrl={occurrence => {
              const document = findPracticeDocument(praticaId, occurrence.docId)
              if (!document) return undefined
              const isPdf = document.mime?.includes('pdf')
                || document.filename.toLowerCase().endsWith('.pdf')
              const storageKey = document.ocrPdfKey || document.s3Key
              return isPdf && storageKey ? api.getLocalFileUrl(storageKey) : undefined
            }}
            isOccurrenceScanned={occurrence =>
              findPracticeDocument(praticaId, occurrence.docId)?.hasNativeText === false
            }
          />
        )}
        {!loading && !extracting && filteredEntities.length === 0 && (
          <div className="p-6">
            <div className="text-sm text-neutral-500">
              {entities.length === 0
                ? 'Nessuna entità disponibile.'
                : 'Nessuna entità per questo filtro.'}
            </div>
          </div>
        )}
      </div>
      <AiCostsModal
        praticaId={praticaId}
        open={aiCostsOpen}
        onClose={closeAiCosts}
      />
    </div>
  )
}

export default EntityCardsPanel
