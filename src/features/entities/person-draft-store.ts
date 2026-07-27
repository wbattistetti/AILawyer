/**
 * Store in memoria delle schede anagrafiche non ancora salvate con la pratica.
 */

import type { DocSnapshot, OccurrenceRecord, PersonRecord } from './entity-index'
import type { ExtractionTabProgress } from './extract-progress'
import { mergePersonExtractionSlices } from './person-draft-merge'
import { createPracticeDocumentSignature } from './document-extraction-plan'

export type PersonExtractionState = {
  praticaId: string
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  snapshots: DocSnapshot[]
  extractedDocumentSignature: string | null
  hasExtracted: boolean
  dirty: boolean
  extracting: boolean
  /** Richiesta di estrazione in attesa che il pannello sia montato. */
  extractRequested: boolean
  /** Progresso estrazione da mostrare sulla tab del dock. */
  progress: ExtractionTabProgress | null
}

type Listener = () => void

const states = new Map<string, PersonExtractionState>()
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach(listener => listener())
}

function emptyState(praticaId: string): PersonExtractionState {
  return {
    praticaId,
    persons: [],
    occurrences: [],
    snapshots: [],
    extractedDocumentSignature: null,
    hasExtracted: false,
    dirty: false,
    extracting: false,
    extractRequested: false,
    progress: null,
  }
}

function cloneState(state: PersonExtractionState): PersonExtractionState {
  return {
    ...state,
    persons: [...state.persons],
    occurrences: [...state.occurrences],
    snapshots: [...state.snapshots],
    progress: state.progress ? { ...state.progress } : null,
  }
}

/** Crea una firma stabile dell'insieme corrente di documenti della pratica. */
export function createDocumentSignature(
  documents: Array<{ id: string; hash?: string | null }>
): string {
  return createPracticeDocumentSignature(documents)
}

/** Inizializza una pratica dai dati persistiti, senza sovrascrivere una bozza esistente. */
export function initializePersonDraft(input: {
  praticaId: string
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  documentSignature: string
  hasExtracted: boolean
  isCurrent?: boolean
}): PersonExtractionState {
  const existing = states.get(input.praticaId)
  if (existing) return cloneState(existing)

  const state: PersonExtractionState = {
    ...emptyState(input.praticaId),
    persons: [...input.persons],
    occurrences: [...input.occurrences],
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
export function getPersonDraft(praticaId: string): PersonExtractionState | null {
  const state = states.get(praticaId)
  return state ? cloneState(state) : null
}

/** Segnala l'avvio o la fine dell'estrazione. */
export function setPersonExtractionRunning(praticaId: string, extracting: boolean): void {
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
export function setPersonExtractionProgress(
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

/**
 * Richiede l'estrazione: apre il pannello e fa partire il job quando è pronto.
 * Funziona anche se la bozza non è ancora stata inizializzata dal backend.
 */
export function requestPersonExtraction(praticaId: string): void {
  const current = states.get(praticaId) ?? emptyState(praticaId)
  states.set(praticaId, {
    ...current,
    extracting: true,
    extractRequested: true,
  })
  notify()
}

/** Consuma la richiesta di estrazione; true se c'era una richiesta pendente. */
export function consumePersonExtractionRequest(praticaId: string): boolean {
  const current = states.get(praticaId)
  if (!current?.extractRequested) return false
  states.set(praticaId, { ...current, extractRequested: false })
  notify()
  return true
}

/** Sostituisce la bozza con il risultato completo dell'estrazione corrente. */
export function replacePersonDraft(input: {
  praticaId: string
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  snapshots: DocSnapshot[]
  documentSignature: string
}): void {
  states.set(input.praticaId, {
    praticaId: input.praticaId,
    persons: [...input.persons],
    occurrences: [...input.occurrences],
    snapshots: [...input.snapshots],
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
 * Integra l'estrazione anagrafiche nella bozza senza cancellare i documenti non rianalizzati.
 */
export function mergePersonDraftFromExtraction(input: {
  praticaId: string
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  snapshots: DocSnapshot[]
  processedDocIds: string[]
  documentSignature: string
}): PersonExtractionState {
  if (!input.praticaId.trim()) {
    throw new Error('mergePersonDraftFromExtraction: praticaId is required')
  }
  if (!Array.isArray(input.processedDocIds)) {
    throw new Error('mergePersonDraftFromExtraction: processedDocIds must be an array')
  }

  const previous = states.get(input.praticaId) ?? emptyState(input.praticaId)
  const merged = mergePersonExtractionSlices(
    {
      persons: previous.persons,
      occurrences: previous.occurrences,
      snapshots: previous.snapshots,
    },
    {
      persons: input.persons,
      occurrences: input.occurrences,
      snapshots: input.snapshots,
    },
    input.processedDocIds
  )

  const state: PersonExtractionState = {
    praticaId: input.praticaId,
    persons: merged.persons,
    occurrences: merged.occurrences,
    snapshots: merged.snapshots,
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

/** Integra schede create manualmente senza scrivere sul backend. */
export function mergePersonsIntoDraft(
  praticaId: string,
  incoming: PersonRecord[]
): void {
  const current = states.get(praticaId)
  if (!current) {
    throw new Error(`Bozza anagrafiche non inizializzata per la pratica ${praticaId}`)
  }
  const byId = new Map(current.persons.map(person => [person.id, person]))
  incoming.forEach(person => byId.set(person.id, person))
  states.set(praticaId, {
    ...current,
    persons: Array.from(byId.values()),
    dirty: true,
  })
  notify()
}

/** Rimuove una scheda e tutte le sue evidenze dalla bozza in memoria. */
export function removePersonFromDraft(praticaId: string, personId: string): void {
  const current = states.get(praticaId)
  if (!current) {
    throw new Error(`Bozza anagrafiche non inizializzata per la pratica ${praticaId}`)
  }
  states.set(praticaId, {
    ...current,
    persons: current.persons.filter(person => person.id !== personId),
    occurrences: current.occurrences.filter(occurrence => occurrence.personKey !== personId),
    dirty: true,
  })
  notify()
}

/** Marca la bozza come persistita dal comando generale "Salva pratica". */
export function markPersonDraftSaved(
  praticaId: string,
  persons: PersonRecord[]
): void {
  const current = states.get(praticaId)
  if (!current) return
  states.set(praticaId, {
    ...current,
    persons: [...persons],
    dirty: false,
  })
  notify()
}

/** Sottoscrive i cambiamenti dello store in memoria. */
export function subscribePersonDraft(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
