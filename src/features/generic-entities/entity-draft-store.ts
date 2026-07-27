/**
 * Store in memoria delle entità generiche non ancora salvate con la pratica.
 */

import { mergeEntityExtractionSlices } from './entity-draft-merge'
import type { ExtractionTabProgress } from '../entities/extract-progress'
import { createPracticeDocumentSignature } from '../entities/document-extraction-plan'
import type {
  GenericEntity,
  GenericOccurrence,
  GenericRelation,
} from './types'

export type EntityExtractionState = {
  praticaId: string
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  extractedDocumentSignature: string | null
  hasExtracted: boolean
  dirty: boolean
  extracting: boolean
  extractRequested: boolean
  /** Progresso estrazione da mostrare sulla tab del dock. */
  progress: ExtractionTabProgress | null
}

type Listener = () => void

const states = new Map<string, EntityExtractionState>()
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach(listener => listener())
}

function emptyState(praticaId: string): EntityExtractionState {
  return {
    praticaId,
    entities: [],
    occurrences: [],
    relations: [],
    extractedDocumentSignature: null,
    hasExtracted: false,
    dirty: false,
    extracting: false,
    extractRequested: false,
    progress: null,
  }
}

function cloneState(state: EntityExtractionState): EntityExtractionState {
  return {
    ...state,
    entities: [...state.entities],
    occurrences: [...state.occurrences],
    relations: [...state.relations],
    progress: state.progress ? { ...state.progress } : null,
  }
}

/** Firma stabile dell'insieme documenti usato per decidere extract/update. */
export function createEntityDocumentSignature(
  documents: Array<{ id: string; hash?: string | null }>
): string {
  return createPracticeDocumentSignature(documents)
}

/** Inizializza la bozza dai dati persistiti senza sovrascrivere una bozza esistente. */
export function initializeEntityDraft(input: {
  praticaId: string
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  documentSignature: string
  hasExtracted: boolean
  isCurrent?: boolean
}): EntityExtractionState {
  const existing = states.get(input.praticaId)
  if (existing) return cloneState(existing)

  const state: EntityExtractionState = {
    ...emptyState(input.praticaId),
    entities: [...input.entities],
    occurrences: [...input.occurrences],
    relations: [...input.relations],
    extractedDocumentSignature: input.hasExtracted && (input.isCurrent ?? true)
      ? input.documentSignature
      : null,
    hasExtracted: input.hasExtracted,
  }
  states.set(input.praticaId, state)
  notify()
  return cloneState(state)
}

/** Restituisce la bozza corrente di una pratica. */
export function getEntityDraft(praticaId: string): EntityExtractionState | null {
  const state = states.get(praticaId)
  return state ? cloneState(state) : null
}

/** Segnala avvio o fine estrazione. */
export function setEntityExtractionRunning(praticaId: string, extracting: boolean): void {
  const state = states.get(praticaId) ?? emptyState(praticaId)
  if (state.extracting === extracting && states.has(praticaId) && (extracting || state.progress == null)) {
    return
  }
  states.set(praticaId, {
    ...state,
    extracting,
    progress: extracting ? state.progress : null,
  })
  notify()
}

/** Aggiorna il progresso estrazione mostrato sulla tab. */
export function setEntityExtractionProgress(
  praticaId: string,
  progress: ExtractionTabProgress | null
): void {
  const state = states.get(praticaId) ?? emptyState(praticaId)
  states.set(praticaId, {
    ...state,
    extracting: progress != null ? true : state.extracting,
    progress,
  })
  notify()
}

/** Richiede l'estrazione e apre il pannello quando montato. */
export function requestEntityExtraction(praticaId: string): void {
  const current = states.get(praticaId) ?? emptyState(praticaId)
  states.set(praticaId, {
    ...current,
    extracting: true,
    extractRequested: true,
  })
  notify()
}

/** Consuma la richiesta pendente di estrazione. */
export function consumeEntityExtractionRequest(praticaId: string): boolean {
  const current = states.get(praticaId)
  if (!current?.extractRequested) return false
  states.set(praticaId, { ...current, extractRequested: false })
  notify()
  return true
}

/** Sostituisce la bozza con il risultato completo dell'estrazione. */
export function replaceEntityDraft(input: {
  praticaId: string
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  documentSignature: string
}): void {
  states.set(input.praticaId, {
    praticaId: input.praticaId,
    entities: [...input.entities],
    occurrences: [...input.occurrences],
    relations: [...input.relations],
    extractedDocumentSignature: input.documentSignature,
    hasExtracted: true,
    dirty: true,
    extracting: false,
    extractRequested: false,
    progress: null,
  })
  notify()
}

/**
 * Integra l'estrazione nella bozza: aggiunge/deduplica e conserva i doc non rianalizzati.
 */
export function mergeEntityDraftFromExtraction(input: {
  praticaId: string
  entities: GenericEntity[]
  occurrences: GenericOccurrence[]
  relations: GenericRelation[]
  processedDocIds: string[]
  documentSignature: string
}): EntityExtractionState {
  if (!input.praticaId.trim()) {
    throw new Error('mergeEntityDraftFromExtraction: praticaId is required')
  }
  if (!Array.isArray(input.processedDocIds)) {
    throw new Error('mergeEntityDraftFromExtraction: processedDocIds must be an array')
  }

  const previous = states.get(input.praticaId) ?? emptyState(input.praticaId)
  const merged = mergeEntityExtractionSlices(
    {
      entities: previous.entities,
      occurrences: previous.occurrences,
      relations: previous.relations,
    },
    {
      entities: input.entities,
      occurrences: input.occurrences,
      relations: input.relations,
    },
    input.processedDocIds
  )

  const state: EntityExtractionState = {
    praticaId: input.praticaId,
    entities: merged.entities,
    occurrences: merged.occurrences,
    relations: merged.relations,
    extractedDocumentSignature: input.documentSignature,
    hasExtracted: true,
    dirty: true,
    extracting: false,
    extractRequested: false,
    progress: null,
  }
  states.set(input.praticaId, state)
  notify()
  return cloneState(state)
}

/** Marca la bozza come persistita dal salvataggio generale della pratica. */
export function markEntityDraftSaved(praticaId: string, entities: GenericEntity[]): void {
  const current = states.get(praticaId)
  if (!current) return
  states.set(praticaId, {
    ...current,
    entities: [...entities],
    dirty: false,
  })
  notify()
}

/** Sottoscrive i cambiamenti dello store in memoria. */
export function subscribeEntityDraft(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
