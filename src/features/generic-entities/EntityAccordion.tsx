/**
 * Accordion multi-apertura delle schede entità tipizzate.
 */

import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { EntityTypeIcon } from '../EntityTypeIcon'
import { inferPersonKind } from '../person-icon-kind'
import { EntityEvidenceSection } from './EntityEvidenceSection'
import {
  entityCardSubtitle,
  entityDisplayLabel,
  entitySubtypeLabel,
  kindLabel,
  listEntityProperties,
  relationsForEntity,
  reviewStatusLabel,
} from './display'
import { buildEntityHighlightTerms } from './entity-highlight-terms'
import type {
  GenericEntity,
  GenericOccurrence,
  GenericRelation,
} from './types'

type EntityAccordionProps = {
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  onOpenOccurrence?: (
    occurrence: GenericOccurrence,
    context?: { highlightQuery?: string; highlightTerms?: string[] }
  ) => void
  getOccurrencePdfUrl?: (occurrence: GenericOccurrence) => string | undefined
  isOccurrenceScanned?: (occurrence: GenericOccurrence) => boolean
  showKind?: boolean
}

/** Alterna l'apertura indipendente di una scheda. */
export function toggleEntityExpansion(
  current: ReadonlySet<string>,
  entityId: string
): Set<string> {
  const next = new Set(current)
  if (next.has(entityId)) next.delete(entityId)
  else next.add(entityId)
  return next
}

/** Mostra le schede entità espandibili con proprietà, relazioni e fonti. */
export function EntityAccordion({
  entities,
  occurrences,
  relations,
  onOpenOccurrence,
  getOccurrencePdfUrl,
  isOccurrenceScanned,
  showKind = false,
}: EntityAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const entitiesById = useMemo(
    () => new Map(entities.map(entity => [entity.id, entity])),
    [entities]
  )
  const occurrencesByEntity = useMemo(() => {
    const grouped = new Map<string, GenericOccurrence[]>()
    occurrences.forEach(occurrence => {
      const current = grouped.get(occurrence.entityKey) ?? []
      current.push(occurrence)
      grouped.set(occurrence.entityKey, current)
    })
    return grouped
  }, [occurrences])

  return (
    <div className="divide-y">
      {entities.map(entity => {
        const isOpen = openIds.has(entity.id)
        const visualKind =
          entity.kind === 'person'
            ? inferPersonKind(entity.properties.title, entity.properties.taxCode)
            : entity.kind
        const related = relationsForEntity(entity.id, relations, entitiesById)
        const properties = listEntityProperties(entity)
        const subtitle = entityCardSubtitle(entity)
        const subtypeLabel = entitySubtypeLabel(entity)
        const highlightTerms = buildEntityHighlightTerms(entity)
        const reviewLabel = reviewStatusLabel(entity.reviewStatus)
        const reviewClass =
          entity.reviewStatus === 'llm_verified' || entity.reviewStatus === 'ner_verified'
            ? 'bg-emerald-100 text-emerald-800'
            : entity.reviewStatus === 'llm_corrected' || entity.reviewStatus === 'ner_corrected'
              ? 'bg-sky-100 text-sky-800'
              : 'bg-amber-100 text-amber-800'
        return (
          <div key={entity.id} className="py-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setOpenIds(current => toggleEntityExpansion(current, entity.id))}
              aria-expanded={isOpen}
            >
              <EntityTypeIcon
                kind={visualKind}
                label={entityDisplayLabel(entity)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {showKind && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px]">
                      {kindLabel(entity.kind)}
                    </span>
                  )}
                  {subtypeLabel && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      {subtypeLabel}
                    </span>
                  )}
                  {reviewLabel && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${reviewClass}`}
                      title={
                        entity.reviewFlags?.length
                          ? `Segnali: ${entity.reviewFlags.join(', ')}`
                          : 'Candidato incerto — in attesa di review'
                      }
                    >
                      {reviewLabel}
                    </span>
                  )}
                  <span className="font-medium">
                    {entityDisplayLabel(entity)}
                    {typeof entity.occurrenceCount === 'number'
                      ? ` (${entity.occurrenceCount})`
                      : ''}
                  </span>
                </div>
                {subtitle && (
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    {subtitle}
                  </div>
                )}
              </div>
              <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="mt-2 rounded-xl bg-neutral-50 p-3">
                {properties.length === 0 ? (
                  <div className="text-sm text-neutral-500">Nessuna proprietà catturata.</div>
                ) : (
                  <div className="space-y-2">
                    {properties.map(property => (
                      <div
                        key={property.key}
                        className="grid grid-cols-[8rem_1fr] items-baseline gap-2 text-sm"
                      >
                        <span className="text-neutral-500">{property.label}</span>
                        <span className="break-words font-medium">{property.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {related.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-neutral-200 pt-2">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-neutral-600">
                      <Link2 className="h-3.5 w-3.5" />
                      Relazioni
                    </div>
                    {related.map(item => (
                      <div key={item.id} className="text-sm">
                        <span className="text-neutral-500">{item.label}: </span>
                        <span className="font-medium">{item.targetLabel}</span>
                      </div>
                    ))}
                  </div>
                )}

                <EntityEvidenceSection
                  occurrences={occurrencesByEntity.get(entity.id) ?? []}
                  onOpenOccurrence={
                    onOpenOccurrence
                      ? (occurrence) => onOpenOccurrence(occurrence, {
                          highlightQuery:
                            entity.properties.plate
                            || entity.properties.taxCode
                            || entity.properties.vatNumber
                            || entity.properties.iban
                            || entityDisplayLabel(entity),
                          highlightTerms,
                        })
                      : undefined
                  }
                  getPdfUrl={getOccurrencePdfUrl}
                  isScanned={isOccurrenceScanned}
                  highlightTerms={highlightTerms}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
