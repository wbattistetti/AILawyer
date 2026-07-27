/**
 * Collegamento conservativo di relazioni tra hit co-presenti sulla stessa pagina.
 */

import { LINK_MAX_DISTANCE } from './patterns'
import { nearestUnique, spanDistance } from './text'
import type { PageEntityHit, PageRelationHint } from './types'

const OWNER_KINDS = new Set(['person', 'organization'])

/**
 * Collega contatti/identificatori/luoghi/veicoli agli host compatibili più vicini.
 * Non collega se la distanza supera la soglia o se esistono due candidati equidistanti.
 */
export function linkPageRelations(hits: PageEntityHit[]): PageRelationHint[] {
  if (!Array.isArray(hits)) throw new Error('linkPageRelations: hits must be an array')
  const hints: PageRelationHint[] = []
  const owners = hits.filter(hit => OWNER_KINDS.has(hit.kind))
  const contacts = hits.filter(hit => hit.kind === 'contact')
  const identifiers = hits.filter(hit => hit.kind === 'identifier')
  const places = hits.filter(hit => hit.kind === 'place')
  const vehicles = hits.filter(hit => hit.kind === 'vehicle')
  const orgs = hits.filter(hit => hit.kind === 'organization')

  for (const contact of contacts) {
    const host = nearestCompatible(contact, owners, contact.subtype === 'email' ? 'any' : 'any')
    if (!host) continue
    hints.push({
      fromLocalId: host.localId,
      toLocalId: contact.localId,
      kind: 'has-contact',
      confidence: Math.min(host.confidence, contact.confidence) * 0.95,
    })
  }

  for (const identifier of identifiers) {
    const compatible =
      identifier.subtype === 'piva'
        ? owners.filter(hit => hit.kind === 'organization')
        : identifier.subtype === 'cf'
          ? owners.filter(hit => hit.kind === 'person' || hit.kind === 'organization')
          : owners
    const host = nearestUnique(identifier, compatible, LINK_MAX_DISTANCE)
    if (!host) continue
    hints.push({
      fromLocalId: host.localId,
      toLocalId: identifier.localId,
      kind: 'mentions',
      confidence: Math.min(host.confidence, identifier.confidence) * 0.9,
    })
  }

  for (const place of places) {
    const host = nearestUnique(place, [...orgs, ...owners.filter(h => h.kind === 'person')], LINK_MAX_DISTANCE)
    if (!host) continue
    // Prefer organization venue/company for located-at
    if (host.kind === 'organization' || place.subtype === 'address') {
      hints.push({
        fromLocalId: host.localId,
        toLocalId: place.localId,
        kind: 'located-at',
        confidence: Math.min(host.confidence, place.confidence) * 0.92,
      })
    }
  }

  // Venue org + nearby address: ensure org→place located-at even if person is closer
  for (const org of orgs) {
    if (!org.properties.category && org.subtype === 'institution') continue
    const nearbyPlace = nearestUnique(org, places.filter(p => p.subtype === 'address'), LINK_MAX_DISTANCE)
    if (!nearbyPlace) continue
    const already = hints.some(
      hint =>
        hint.kind === 'located-at' &&
        hint.fromLocalId === org.localId &&
        hint.toLocalId === nearbyPlace.localId
    )
    if (already) continue
    hints.push({
      fromLocalId: org.localId,
      toLocalId: nearbyPlace.localId,
      kind: 'located-at',
      confidence: Math.min(org.confidence, nearbyPlace.confidence) * 0.93,
    })
  }

  for (const vehicle of vehicles) {
    const host = nearestUnique(vehicle, owners, LINK_MAX_DISTANCE)
    if (!host) continue
    const uses = /\b(?:usava|utilizzava|alla\s+guida|condotto)\b/iu.test(
      `${host.snippet} ${vehicle.snippet}`
    )
    hints.push({
      fromLocalId: host.localId,
      toLocalId: vehicle.localId,
      kind: uses ? 'uses-vehicle' : 'owns-vehicle',
      confidence: Math.min(host.confidence, vehicle.confidence) * 0.88,
    })
  }

  return hints

  function nearestCompatible(
    target: PageEntityHit,
    candidates: PageEntityHit[],
    _mode: 'any'
  ): PageEntityHit | null {
    void _mode
    return nearestUnique(target, candidates, LINK_MAX_DISTANCE)
  }
}

/** Verifica se due hit sono entro la soglia di linking (utility testabile). */
export function areLinkable(a: PageEntityHit, b: PageEntityHit, max = LINK_MAX_DISTANCE): boolean {
  return spanDistance(a.start, a.end, b.start, b.end) <= max
}
