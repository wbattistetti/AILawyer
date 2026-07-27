/**
 * Preferenza locale del modello Groq per legal-review.
 * La chiave API resta esclusivamente nel backend.
 */

const STORAGE_KEY = 'legal-review-groq-model'
export const DEFAULT_LEGAL_REVIEW_MODEL = 'llama-3.3-70b-versatile'
export const LEGAL_REVIEW_MODEL_CHANGED_EVENT = 'legal-review-model-changed'

/** Legge il modello scelto, con default stabile. */
export function loadLegalReviewModel(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || DEFAULT_LEGAL_REVIEW_MODEL
  } catch {
    return DEFAULT_LEGAL_REVIEW_MODEL
  }
}

/** Salva un model id validato dal catalogo live. */
export function saveLegalReviewModel(modelId: string): string {
  const normalized = modelId.trim()
  if (!normalized) throw new Error('saveLegalReviewModel: modelId is required')
  localStorage.setItem(STORAGE_KEY, normalized)
  window.dispatchEvent(new CustomEvent(LEGAL_REVIEW_MODEL_CHANGED_EVENT))
  return normalized
}
