/**
 * Selezione canonica condivisa da NER e LLM: una sola evidenza per entità.
 */

import type { GenericEntity, GenericExtractionResult, GenericOccurrence } from '../types'
import type { LegalReviewEntityType } from './legal-review-types'

export type CanonicalReviewCandidate = {
  entity: GenericEntity
  occurrence: GenericOccurrence
  expectedType: LegalReviewEntityType
  candidateSpan: [number, number]
  candidateLabel: string
}

const MAX_REVIEW_SNIPPET_CHARS = 500

/** True per il perimetro iniziale institution/company/venue. */
export function isReviewEligible(entity: { kind: string; subtype: string }): boolean {
  if (entity.kind === 'place' && entity.subtype === 'venue') return true
  if (entity.kind !== 'organization') return false
  if (entity.subtype === 'company' || entity.subtype === 'institution') return true
  return [
    'bar',
    'ristorante',
    'trattoria',
    'osteria',
    'pizzeria',
    'hotel',
    'albergo',
    'pub',
    'discoteca',
    'locale',
    'caffè',
    'caffe',
  ].includes(entity.subtype)
}

/** Costruisce al massimo un candidato per entità canonica, con span esatto nello snippet. */
export function buildCanonicalReviewCandidates(
  extraction: Pick<GenericExtractionResult, 'entities' | 'occurrences'>,
  shouldInclude: (entity: GenericEntity) => boolean,
): { candidates: CanonicalReviewCandidate[]; missingEntityIds: string[] } {
  const occurrencesByEntity = groupOccurrences(extraction.occurrences)
  const candidates: CanonicalReviewCandidate[] = []
  const missingEntityIds: string[] = []

  for (const entity of extraction.entities) {
    if (!isReviewEligible(entity) || !shouldInclude(entity)) continue
    const evidence = occurrencesByEntity.get(entity.id) ?? []
    const match = findRepresentative(evidence, entity.label)
    if (!match) {
      missingEntityIds.push(entity.id)
      continue
    }
    candidates.push({
      entity,
      occurrence: match.occurrence,
      expectedType: toExpectedType(entity),
      candidateSpan: match.span,
      candidateLabel: match.label,
    })
  }
  return { candidates, missingEntityIds }
}

function groupOccurrences(
  occurrences: GenericOccurrence[],
): Map<string, GenericOccurrence[]> {
  const grouped = new Map<string, GenericOccurrence[]>()
  for (const occurrence of occurrences) {
    const current = grouped.get(occurrence.entityKey) ?? []
    current.push(occurrence)
    grouped.set(occurrence.entityKey, current)
  }
  return grouped
}

function findRepresentative(
  occurrences: GenericOccurrence[],
  label: string,
): {
  occurrence: GenericOccurrence
  span: [number, number]
  label: string
} | null {
  const sorted = [...occurrences].sort(
    (left, right) => left.snippet.length - right.snippet.length,
  )
  for (const occurrence of sorted) {
    let start = occurrence.snippet.indexOf(label)
    if (start < 0) {
      start = occurrence.snippet
        .toLocaleLowerCase('it')
        .indexOf(label.toLocaleLowerCase('it'))
    }
    if (start < 0) continue
    const reviewWindow = centerReviewSnippet(occurrence.snippet, start, label.length)
    return {
      occurrence: { ...occurrence, snippet: reviewWindow.snippet },
      span: reviewWindow.span,
      label: reviewWindow.snippet.slice(...reviewWindow.span),
    }
  }
  return null
}

/** Mantiene il payload NER entro 500 caratteri senza accorciare la fonte UI. */
function centerReviewSnippet(
  snippet: string,
  labelStart: number,
  labelLength: number,
): { snippet: string; span: [number, number] } {
  if (snippet.length <= MAX_REVIEW_SNIPPET_CHARS) {
    return {
      snippet,
      span: [labelStart, labelStart + labelLength],
    }
  }

  const availableContext = MAX_REVIEW_SNIPPET_CHARS - labelLength
  const before = Math.floor(availableContext / 2)
  let from = Math.max(0, labelStart - before)
  let to = Math.min(snippet.length, from + MAX_REVIEW_SNIPPET_CHARS)
  from = Math.max(0, to - MAX_REVIEW_SNIPPET_CHARS)
  to = Math.min(snippet.length, to)

  return {
    snippet: snippet.slice(from, to),
    span: [labelStart - from, labelStart - from + labelLength],
  }
}

function toExpectedType(entity: GenericEntity): LegalReviewEntityType {
  if (entity.subtype === 'company') return 'company'
  if (entity.subtype === 'institution') return 'institution'
  return 'venue'
}
