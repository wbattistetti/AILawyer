/**
 * Detector di organizzazioni, istituzioni e società (incl. categorie venue).
 * Applica confini stretti e triage needsReview (Fase A).
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import {
  assessOrganizationQuality,
  type OrganizationUncertaintyFlag,
} from '../organization-quality'
import {
  COMPANY_SUFFIX,
  INSTITUTION_LETTERHEAD_ORG,
  INSTITUTION_PHRASE,
  VENUE_CATEGORY,
} from '../patterns'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'

const LETTERHEAD_WINDOW = 320

const ADDRESS_IN_WINDOW =
  /\b(?<road>via|viale|v\.le|corso|c\.so|piazzale|piazza|p\.zza)\s+(?<street>[A-Za-zÀ-ü0-9'’.\-\s]{2,60}?)\s*,\s*(?<cap>\d{5})\s+(?<city>[A-ZÀ-Ü][A-Za-zÀ-ü'’\-]+)/iu

const PHONE_IN_WINDOW =
  /\btel(?:efono)?\.?\s*(?<phone>(?:\+?39[\s./-]?)?(?:0\d{1,3}|3\d{2})[\s./-]?\d{5,8})\b/iu

const PEC_IN_WINDOW =
  /\bp\.?\s*e\.?\s*c\.?\s*(?<pec>[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})\b/iu

type LetterheadExtras = {
  street?: string
  cap?: string
  city?: string
  phone?: string
  pec?: string
}

/**
 * Estrae indirizzo/tel/PEC nella finestra successiva al nome dell’ente.
 * Parsing procedurale: più stabile della mega-regex unica su testo OCR.
 */
export function extractLetterheadExtras(windowText: string): LetterheadExtras {
  if (typeof windowText !== 'string') {
    throw new Error('extractLetterheadExtras: windowText must be a string')
  }
  const address = windowText.match(ADDRESS_IN_WINDOW)
  const phone = windowText.match(PHONE_IN_WINDOW)
  const pec = windowText.match(PEC_IN_WINDOW)
  const streetRaw = address?.groups?.street?.replace(/\s+/g, ' ').trim()
  const road = address?.groups?.road?.replace(/\s+/g, ' ').trim()
  return {
    street: streetRaw && road ? `${road} ${streetRaw}` : streetRaw,
    cap: address?.groups?.cap?.trim(),
    city: address?.groups?.city?.trim(),
    phone: phone?.groups?.phone?.replace(/[\s./-]+/g, ''),
    pec: pec?.groups?.pec?.toLowerCase(),
  }
}

/**
 * Estrae organizzazioni/istituzioni/aziende con subtype, proprietà e review flags.
 */
export function detectOrganizations(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectOrganizations: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(INSTITUTION_LETTERHEAD_ORG)) {
    if (match.index == null || !match.groups?.org) continue
    const orgRaw = match.groups.org.replace(/\s+/g, ' ').trim()
    const windowText = text.slice(match.index, match.index + LETTERHEAD_WINDOW)
    const quality = assessOrganizationQuality({
      kind: 'institution',
      rawText: orgRaw,
      context: windowText.slice(0, 160),
      baseConfidence: 0.88,
    })
    if (!quality.accept) continue

    const extras = extractLetterheadExtras(windowText)
    const properties: Record<string, string> = { institutionName: quality.label }
    if (extras.street) {
      properties.address = [extras.street, extras.cap, extras.city].filter(Boolean).join(', ')
    }
    if (extras.cap) properties.postalCode = extras.cap
    if (extras.city) properties.city = extras.city
    if (extras.phone) properties.phone = extras.phone
    if (extras.pec) properties.pec = extras.pec

    const hasExtras = Boolean(extras.phone || extras.pec || extras.street)
    const end = match.index + Math.max(1, match[0].length - quality.trimEndChars)
    push({
      start: match.index,
      end,
      label: quality.label,
      subtype: 'institution',
      properties,
      confidence: hasExtras ? Math.max(quality.confidence, 0.9) : quality.confidence,
      keyParts: ['institution-header', quality.label, extras.city, extras.phone, extras.pec],
      flags: quality.flags,
      needsReview: quality.needsReview,
      reviewStatus: quality.reviewStatus,
    })
  }

  for (const match of text.matchAll(COMPANY_SUFFIX)) {
    if (match.index == null || !match.groups?.name || !match.groups?.form) continue
    const formRaw = match.groups.form
    const form = formRaw.replace(/\s+/g, '').toUpperCase()
    const nameRaw = match.groups.name.trim()
    const labelRaw = `${nameRaw} ${formRaw}`.replace(/\s+/g, ' ').trim()
    const textBefore = text.slice(Math.max(0, match.index - 40), match.index)
    const quality = assessOrganizationQuality({
      kind: 'company',
      rawText: labelRaw,
      namePart: nameRaw,
      legalForm: form,
      textBefore,
      context: text.slice(match.index, match.index + match[0].length + 40),
      baseConfidence: 0.88,
    })
    if (!quality.accept) continue

    const name = quality.namePart ?? nameRaw
    const label = quality.trimEndChars > 0
      ? `${name} ${formRaw}`.replace(/\s+/g, ' ').trim()
      : quality.label
    push({
      start: match.index,
      end: match.index + Math.max(1, match[0].length - quality.trimEndChars),
      label,
      subtype: 'company',
      properties: { legalName: name, legalForm: form },
      confidence: quality.confidence,
      keyParts: ['company', name, form],
      flags: quality.flags,
      needsReview: quality.needsReview,
      reviewStatus: quality.reviewStatus,
    })
  }

  for (const match of text.matchAll(INSTITUTION_PHRASE)) {
    if (match.index == null || !match.groups?.name) continue
    const nameRaw = match.groups.name.replace(/\s+/g, ' ').trim()
    const quality = assessOrganizationQuality({
      kind: 'institution',
      rawText: nameRaw,
      context: text.slice(match.index, match.index + match[0].length + 60),
      baseConfidence: 0.9,
    })
    if (!quality.accept) continue

    push({
      start: match.index,
      end: match.index + Math.max(1, match[0].length - quality.trimEndChars),
      label: quality.label,
      subtype: 'institution',
      properties: { institutionName: quality.label },
      confidence: quality.confidence,
      keyParts: ['institution', quality.label],
      flags: quality.flags,
      needsReview: quality.needsReview,
      reviewStatus: quality.reviewStatus,
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
      baseConfidence: 0.84,
    })
    if (!quality.accept) continue

    const name = quality.namePart ?? nameRaw
    const label = `${match.groups.cat} ${name}`.replace(/\s+/g, ' ').trim()
    push({
      start: match.index,
      end: match.index + Math.max(1, match[0].length - quality.trimEndChars),
      label,
      subtype: category,
      properties: { organizationName: name, category },
      confidence: quality.confidence,
      keyParts: ['venue-org', category, name],
      flags: quality.flags,
      needsReview: quality.needsReview,
      reviewStatus: quality.reviewStatus,
    })
  }

  return hits

  function push(args: {
    start: number
    end: number
    label: string
    subtype: string
    properties: Record<string, string>
    confidence: number
    keyParts: string[]
    flags?: OrganizationUncertaintyFlag[]
    needsReview?: boolean
    reviewStatus?: PageEntityHit['reviewStatus']
  }) {
    const dedupe = `${args.start}:${args.label.toLowerCase()}`
    if (seen.has(dedupe)) {
      const existing = hits.find(hit => hit.start === args.start)
      if (existing) {
        for (const [key, value] of Object.entries(args.properties)) {
          if (!existing.properties[key] || value.length > existing.properties[key].length) {
            existing.properties[key] = value
          }
        }
        existing.confidence = Math.max(existing.confidence, args.confidence)
        existing.propertyKeys = Object.keys(existing.properties)
        existing.flags = mergeFlags(existing.flags, args.flags)
        existing.needsReview = Boolean(existing.needsReview || args.needsReview)
        existing.reviewStatus = existing.needsReview ? 'needs_review' : (args.reviewStatus ?? 'ok')
      }
      return
    }
    seen.add(dedupe)
    hits.push({
      localId: makeLocalHitId(docId, page, 'organization', args.start, args.label),
      entityKey: makeEntityKey('organization', ...args.keyParts),
      kind: 'organization',
      subtype: args.subtype,
      label: args.label,
      properties: args.properties,
      confidence: args.confidence,
      snippet: makeSnippet(text, args.start, Math.max(1, args.end - args.start)),
      box: bboxForSubstring(tokens, args.start, Math.max(1, args.end - args.start)),
      propertyKeys: Object.keys(args.properties),
      start: args.start,
      end: args.end,
      flags: args.flags?.length ? [...args.flags] : undefined,
      needsReview: args.needsReview ?? false,
      reviewStatus: args.reviewStatus ?? (args.needsReview ? 'needs_review' : 'ok'),
    })
  }
}

function mergeFlags(
  left?: OrganizationUncertaintyFlag[],
  right?: OrganizationUncertaintyFlag[]
): OrganizationUncertaintyFlag[] | undefined {
  if (!left?.length && !right?.length) return undefined
  return [...new Set([...(left ?? []), ...(right ?? [])])]
}
