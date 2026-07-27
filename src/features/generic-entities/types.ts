/**
 * Contratti tipizzati per l’estrazione practice-wide di entità generiche
 * (distinta dalle anagrafiche complete).
 */

import type {
  EntityReviewStatus,
  OrganizationUncertaintyFlag,
} from './organization-quality'

export type { EntityReviewStatus, OrganizationUncertaintyFlag }

export type GenericEntityKind =
  | 'person'
  | 'place'
  | 'organization'
  | 'vehicle'
  | 'contact'
  | 'identifier'
  | 'object'

export type RelationKind =
  | 'has-contact'
  | 'located-at'
  | 'owns-vehicle'
  | 'uses-vehicle'
  | 'mentions'

export type BoxPct = {
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
}

/** Entità canonica aggregata a livello di pratica. */
export type GenericEntity = {
  id: string
  praticaId: string
  kind: GenericEntityKind
  subtype: string
  label: string
  properties: Record<string, string>
  confidence: number
  occurrenceCount: number
  updatedAt: number
  /** Triage Fase A/B: ok | needs_review (poi llm_*). */
  reviewStatus?: EntityReviewStatus
  /** Flag di incertezza aggregati (org/venue/company). */
  reviewFlags?: OrganizationUncertaintyFlag[]
  needsReview?: boolean
}

/** Singola evidenza documentale di un’entità. */
export type GenericOccurrence = {
  id: string
  entityKey: string
  docId: string
  page: number
  title: string
  snippet: string
  box: BoxPct
  confidence: number
  propertyKeys?: string[]
  reviewStatus?: EntityReviewStatus
  flags?: OrganizationUncertaintyFlag[]
  needsReview?: boolean
}

/** Relazione conservativa tra due entità canoniche. */
export type GenericRelation = {
  id: string
  fromEntityId: string
  toEntityId: string
  kind: RelationKind
  confidence: number
  evidenceOccurrenceIds: string[]
}

/** Hit grezzo prodotto dal detector di pagina (prima della canonicalizzazione). */
export type PageEntityHit = {
  localId: string
  entityKey: string
  kind: GenericEntityKind
  subtype: string
  label: string
  properties: Record<string, string>
  confidence: number
  snippet: string
  box: BoxPct
  propertyKeys?: string[]
  start: number
  end: number
  flags?: OrganizationUncertaintyFlag[]
  needsReview?: boolean
  reviewStatus?: EntityReviewStatus
}

/** Suggerimento di relazione a livello di pagina, risolto dopo la canonicalizzazione. */
export type PageRelationHint = {
  fromLocalId: string
  toLocalId: string
  kind: RelationKind
  confidence: number
}

export type PageDetectionResult = {
  hits: PageEntityHit[]
  relationHints: PageRelationHint[]
}

export type SkippedDocumentFailure = {
  docId: string
  title: string
  reason: 'unreadable' | 'aborted' | 'error'
  detail: string
}

export type GenericExtractionProgress = {
  docsDone: number
  docsTotal: number
  pagesDone: number
  pagesTotal: number
  currentDocId?: string
  currentDocTitle?: string
}

export type GenericExtractionDiagnostics = {
  pagesProcessed: number
  hitCount: number
  relationHintCount: number
  skipped: SkippedDocumentFailure[]
}

export type GenericExtractionResult = {
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  diagnostics: GenericExtractionDiagnostics
}

export type DetectPageInput = {
  docId: string
  title: string
  page: number
  text: string
  tokens: Array<{
    text: string
    x0Pct: number
    x1Pct: number
    y0Pct: number
    y1Pct: number
  }>
}
