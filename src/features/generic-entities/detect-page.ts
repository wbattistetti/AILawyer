/**
 * Detector puro per-pagina: esegue i detector tipizzati e collega le relazioni.
 */

import { detectContacts, detectIdentifiers } from './detectors/contacts'
import { detectObjects } from './detectors/objects'
import { detectOrganizations } from './detectors/organizations'
import { detectPersonMentions } from './detectors/persons'
import { detectPlaces } from './detectors/places'
import { detectVehicles } from './detectors/vehicles'
import { linkPageRelations } from './link-relations'
import { buildPageText } from './text'
import type { DetectPageInput, PageDetectionResult, PageEntityHit } from './types'
import type { PageToken } from './text'

export type DetectOnPageArgs = {
  docId: string
  title: string
  page: number
  tokens: PageToken[]
}

/**
 * Rileva entità generiche strutturate su una pagina di token.
 * Fallisce chiaramente su input incompleto; non usa randomness.
 */
export function detectGenericEntitiesOnPage(args: DetectOnPageArgs): PageDetectionResult {
  if (!args || typeof args !== 'object') {
    throw new Error('detectGenericEntitiesOnPage: args is required')
  }
  if (!args.docId) throw new Error('detectGenericEntitiesOnPage: docId is required')
  if (!args.title && args.title !== '') {
    throw new Error('detectGenericEntitiesOnPage: title is required')
  }
  if (!Number.isInteger(args.page) || args.page < 1) {
    throw new Error('detectGenericEntitiesOnPage: page must be an integer >= 1')
  }
  if (!Array.isArray(args.tokens)) {
    throw new Error('detectGenericEntitiesOnPage: tokens must be an array')
  }

  const text = buildPageText(args.tokens)
  const input: DetectPageInput = {
    docId: args.docId,
    title: args.title,
    page: args.page,
    text,
    tokens: args.tokens,
  }

  const hits = dedupeHits([
    ...detectPersonMentions(input),
    ...detectPlaces(input),
    ...detectOrganizations(input),
    ...detectVehicles(input),
    ...detectContacts(input),
    ...detectIdentifiers(input),
    ...detectObjects(input),
  ])

  return {
    hits,
    relationHints: linkPageRelations(hits),
  }
}

function dedupeHits(hits: PageEntityHit[]): PageEntityHit[] {
  const byKey = new Map<string, PageEntityHit>()
  for (const hit of hits) {
    const stamp = `${hit.entityKey}|${hit.start}|${hit.end}`
    const existing = byKey.get(stamp)
    if (!existing || hit.confidence > existing.confidence) byKey.set(stamp, hit)
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind))
}
