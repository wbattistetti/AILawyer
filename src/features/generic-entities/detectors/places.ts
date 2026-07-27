/**
 * Detector di luoghi: indirizzi strutturati e venue nominate (ristorante/bar/hotel).
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import { assessOrganizationQuality } from '../organization-quality'
import { ROAD_START, VENUE_CATEGORY } from '../patterns'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'

const ADDRESS_TAIL =
  /^(?<street>(?:via|viale|v\.le|corso|c\.so|piazza|p\.zza|piazzale|largo|vicolo|strada|località|loc\.)\s+[^,;]{1,60}?\d+[A-Za-z]?)(?:\s*,\s*(?<cap>\d{5}))?(?:\s+(?<city>[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]+(?:\s+[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]+)*))?(?:\s*\((?<province>[A-Z]{2})\))?/i

/**
 * Estrae indirizzi e venue come entità place con proprietà tipizzate quando presenti.
 */
export function detectPlaces(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectPlaces: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(ROAD_START)) {
    if (match.index == null) continue
    const slice = text.slice(match.index, match.index + 140)
    const parsed = slice.match(ADDRESS_TAIL)
    if (!parsed?.groups?.street) continue
    const street = parsed.groups.street.replace(/\s+/g, ' ').trim()
    const cap = parsed.groups.cap?.trim()
    const city = parsed.groups.city?.trim()
    const province = parsed.groups.province?.trim()
    const labelParts = [street, cap, city, province ? `(${province})` : ''].filter(Boolean)
    const label = labelParts.join(', ').replace(/\s+/g, ' ').trim()
    const end = match.index + (parsed[0]?.length ?? street.length)
    const key = `${match.index}:${label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const properties: Record<string, string> = { address: street }
    if (cap) properties.cap = cap
    if (city) properties.city = city
    if (province) properties.province = province
    hits.push({
      localId: makeLocalHitId(docId, page, 'place', match.index, label),
      entityKey: makeEntityKey('place', street, cap, city, province),
      kind: 'place',
      subtype: 'address',
      label,
      properties,
      confidence: cap || city ? 0.86 : 0.7,
      snippet: makeSnippet(text, match.index, end - match.index),
      box: bboxForSubstring(tokens, match.index, end - match.index),
      propertyKeys: Object.keys(properties),
      start: match.index,
      end,
    })
  }

  for (const match of text.matchAll(VENUE_CATEGORY)) {
    if (match.index == null || !match.groups?.cat || !match.groups?.name) continue
    const category = match.groups.cat.toLowerCase()
    const nameRaw = match.groups.name.trim()
    const labelRaw = `${match.groups.cat} ${nameRaw}`.replace(/\s+/g, ' ').trim()
    const quality = assessOrganizationQuality({
      kind: 'venue',
      rawText: labelRaw,
      namePart: nameRaw,
      context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 40),
      baseConfidence: 0.82,
    })
    if (!quality.accept) continue

    const name = quality.namePart ?? nameRaw
    const label = `${match.groups.cat} ${name}`.replace(/\s+/g, ' ').trim()
    const start = match.index
    const end = start + Math.max(1, match[0].length - quality.trimEndChars)
    const key = `venue:${start}:${label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({
      localId: makeLocalHitId(docId, page, 'place', start, label),
      entityKey: makeEntityKey('place', 'venue', category, name),
      kind: 'place',
      subtype: 'venue',
      label,
      properties: { venueName: name, category },
      confidence: quality.confidence,
      snippet: makeSnippet(text, start, end - start),
      box: bboxForSubstring(tokens, start, end - start),
      propertyKeys: ['venueName', 'category'],
      start,
      end,
      flags: quality.flags.length ? [...quality.flags] : undefined,
      needsReview: quality.needsReview,
      reviewStatus: quality.reviewStatus,
    })
  }

  return hits
}
