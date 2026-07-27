/**
 * Merge incrementale dei risultati di estrazione anagrafiche.
 * Conserva evidenze e schede dei documenti non rianalizzati.
 */

import type { DocSnapshot, OccurrenceRecord, PersonRecord } from './entity-index'

export type PersonExtractionSlice = {
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
  snapshots: DocSnapshot[]
}

/**
 * Unisce bozza precedente e nuova estrazione anagrafiche senza duplicare le schede.
 */
export function mergePersonExtractionSlices(
  previous: PersonExtractionSlice,
  incoming: PersonExtractionSlice,
  processedDocIds: readonly string[]
): PersonExtractionSlice {
  if (!Array.isArray(processedDocIds)) {
    throw new Error('mergePersonExtractionSlices: processedDocIds must be an array')
  }
  const processed = new Set(processedDocIds.filter(Boolean))

  const keptOccurrences = previous.occurrences.filter(
    occurrence => !processed.has(occurrence.docId)
  )
  const occurrenceById = new Map<string, OccurrenceRecord>()
  for (const occurrence of keptOccurrences) {
    occurrenceById.set(occurrence.id, occurrence)
  }
  for (const occurrence of incoming.occurrences) {
    occurrenceById.set(occurrence.id, occurrence)
  }
  const occurrences = [...occurrenceById.values()]

  const personById = new Map<string, PersonRecord>()
  for (const person of previous.persons) {
    personById.set(person.id, clonePerson(person))
  }
  for (const person of incoming.persons) {
    const existing = personById.get(person.id)
    personById.set(person.id, existing ? mergePersonRecord(existing, person) : clonePerson(person))
  }

  const counts = new Map<string, number>()
  for (const occurrence of occurrences) {
    counts.set(occurrence.personKey, (counts.get(occurrence.personKey) ?? 0) + 1)
  }

  const persons = [...personById.values()]
    .map(person => ({
      ...person,
      occCount: counts.get(person.id) ?? 0,
    }))
    .filter(person => person.occCount > 0)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  const snapshotByDocId = new Map<string, DocSnapshot>()
  for (const snapshot of previous.snapshots) {
    if (!processed.has(snapshot.docId)) {
      snapshotByDocId.set(snapshot.docId, snapshot)
    }
  }
  for (const snapshot of incoming.snapshots) {
    snapshotByDocId.set(snapshot.docId, snapshot)
  }

  return {
    persons,
    occurrences,
    snapshots: [...snapshotByDocId.values()],
  }
}

function clonePerson(person: PersonRecord): PersonRecord {
  return {
    ...person,
    titles: [...(person.titles ?? [])],
  }
}

function mergePersonRecord(existing: PersonRecord, incoming: PersonRecord): PersonRecord {
  const titles = new Set([...(existing.titles ?? []), ...(incoming.titles ?? [])])
  return {
    ...existing,
    full_name: incoming.full_name || existing.full_name,
    first_name: existing.first_name || incoming.first_name,
    last_name: existing.last_name || incoming.last_name,
    date_of_birth: existing.date_of_birth || incoming.date_of_birth,
    place_of_birth: existing.place_of_birth || incoming.place_of_birth,
    tax_code: existing.tax_code || incoming.tax_code,
    address: existing.address || incoming.address,
    residence_address: existing.residence_address || incoming.residence_address,
    domicile_address: existing.domicile_address || incoming.domicile_address,
    postal_code: existing.postal_code || incoming.postal_code,
    city: existing.city || incoming.city,
    province: existing.province || incoming.province,
    phone: existing.phone || incoming.phone,
    email: existing.email || incoming.email,
    profession: existing.profession || incoming.profession,
    confidence: Math.max(existing.confidence, incoming.confidence),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    titles: Array.from(titles),
    occCount: existing.occCount,
  }
}
