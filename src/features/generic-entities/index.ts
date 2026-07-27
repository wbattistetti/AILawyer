/**
 * API pubblica dell’estrazione tipizzata di entità generiche practice-wide.
 */

export type {
  BoxPct,
  DetectPageInput,
  EntityReviewStatus,
  GenericEntity,
  GenericEntityKind,
  GenericExtractionDiagnostics,
  GenericExtractionProgress,
  GenericExtractionResult,
  GenericOccurrence,
  GenericRelation,
  OrganizationUncertaintyFlag,
  PageDetectionResult,
  PageEntityHit,
  PageRelationHint,
  RelationKind,
  SkippedDocumentFailure,
} from './types'

export { detectGenericEntitiesOnPage } from './detect-page'
export { canonicalizeGenericExtraction } from './canonicalize'
export { extractGenericEntitiesFromDocs } from './orchestrator'
export type { ExtractGenericEntitiesOptions } from './orchestrator'
export { assessOrganizationQuality, needsOrganizationReview } from './organization-quality'
export { callLegalReview, isLegalReviewEligible } from './review/legal-review-client'
export { applySpanToOriginal } from './review/legal-review-types'
export type {
  LegalReviewEntityType,
  LegalReviewPayload,
  LegalReviewResult,
} from './review/legal-review-types'
export { reviewUncertainEntitiesWithNer } from './review/ner-service'
export type { NerReviewOutcome } from './review/ner-service'
export { isReviewEligible, buildCanonicalReviewCandidates } from './review/review-candidates'
export { reviewUncertainEntities } from './review/review-uncertain-entities'
export type { UncertainReviewOutcome } from './review/review-uncertain-entities'
export { makeEntityKey, stableHash } from './ids'
export {
  createEntityDocumentSignature,
  getEntityDraft,
  initializeEntityDraft,
  markEntityDraftSaved,
  mergeEntityDraftFromExtraction,
  replaceEntityDraft,
  requestEntityExtraction,
  subscribeEntityDraft,
} from './entity-draft-store'
