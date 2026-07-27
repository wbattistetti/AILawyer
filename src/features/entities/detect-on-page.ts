/**
 * Pure page-level detector that converts OCR tokens into person occurrences.
 */

import { extractPersonAddressFields } from './person-context-fields'
import { boundPersonContext } from './person-context-segmenter'
import type { OccOut, Token } from './extract-types'
import {
  bboxForSubstring,
  charOffsetToTokenIndex,
  deduplicateOccurrences,
  makeSnippet,
  normalizeAnalysisTokens,
  pageText,
  unionBoxes,
} from './extract-text-utils'
import {
  BIRTH_ANCHORS,
  extractBirthContext,
  extractNameLeftOf,
  extractPersonFields,
  isLikelyPersonName,
  makePersonKey,
  NAME_CHUNK,
  NAME_SEQUENCE_SOURCE,
  NON_NAME_WORDS,
  normalizeBirthDate,
  PARTICLE,
  splitName,
  STOP_TOKENS,
  TITLES,
} from './person-parsing'

const detectEnumeratedPeople = (tokens: Token[], text: string, page: number): OccOut[] => {
  const occurrences: OccOut[] = []
  const pattern = new RegExp(
    String.raw`(?:^|[;\n])\s*\d+\.\s*(?<nome>${NAME_SEQUENCE_SOURCE})\s*,\s*nat(?:o|a|o\/a)\s+a\s+(?<pob>[^,;]+?)\s+(?:il\s+)?(?<dob>[0-3]?\d[./-][01]?\d[./-](?:19|20)\d{2})`,
    'giu'
  )
  for (const match of text.matchAll(pattern)) {
    const fullName = (match.groups?.nome || '').replace(TITLES, '').trim()
    if (!fullName || !isLikelyPersonName(fullName)) continue
    const localOffset = match[0].indexOf(fullName)
    const offset = match.index! + (localOffset >= 0 ? localOffset : 0)
    const birthDate = normalizeBirthDate((match.groups?.dob || '').trim())
    const birthPlace = (match.groups?.pob || '').trim()
    const tailStart = match.index! + match[0].length
    const context = boundPersonContext(text.slice(tailStart))
    const addresses = extractPersonAddressFields(context)
    const { first, last } = splitName(fullName)
    occurrences.push({
      personKey: makePersonKey(fullName, birthDate, birthPlace),
      full_name: fullName,
      first_name: first,
      last_name: last,
      fields: {
        ...extractPersonFields(
          text.slice(match.index!, Math.min(text.length, match.index! + match[0].length + 350))
        ),
        date_of_birth: birthDate,
        place_of_birth: birthPlace,
        address: addresses.residence?.address,
        city: addresses.residence?.city,
        postal_code: addresses.residence?.postalCode,
        province: addresses.residence?.province,
        raw_residence_text: addresses.residence?.raw,
        domicile: addresses.domicile?.address,
        raw_domicile_text: addresses.domicile?.raw,
      },
      confidence: Math.min(1, 0.85 + (birthDate ? 0.05 : 0)),
      snippet: makeSnippet(text, offset, fullName.length),
      page,
      box: bboxForSubstring(tokens, offset, fullName.length),
    })
  }
  return occurrences
}

const detectAnchoredPeople = (tokens: Token[], text: string, page: number): OccOut[] => {
  const occurrences: OccOut[] = []
  const pattern = new RegExp(BIRTH_ANCHORS.source, 'giu')
  for (const match of text.matchAll(pattern)) {
    const anchor = match[0]
    if (/^n\.$/i.test(anchor)) {
      const tail = text.slice(match.index! + anchor.length).trimStart()
      if (/^\d+/.test(tail)) continue
    }
    const anchorToken = charOffsetToTokenIndex(tokens, match.index!)
    const name = extractNameLeftOf(tokens, anchorToken)
    if (!name) continue
    const birth = extractBirthContext(tokens, anchorToken)
    const context = boundPersonContext(text.slice(match.index! + anchor.length))
    const addresses = extractPersonAddressFields(context)
    const useBirthCity = /\bivi\s+resident[ea]/i.test(context) || /\bivi\s+res\./i.test(context)
    const { first, last } = splitName(name.text)
    occurrences.push({
      personKey: makePersonKey(name.text),
      full_name: name.text,
      first_name: first,
      last_name: last,
      fields: {
        ...extractPersonFields(context),
        date_of_birth: birth.dob,
        place_of_birth: birth.pob,
        address: addresses.residence?.address,
        city: addresses.residence?.city || (useBirthCity ? birth.pob : undefined),
        postal_code: addresses.residence?.postalCode,
        province: addresses.residence?.province,
        raw_residence_text: addresses.residence?.raw,
        raw_domicile_text: addresses.domicile?.raw,
        domicile: addresses.domicile?.address,
        domicile_city: addresses.domicile?.city,
        domicile_postal_code: addresses.domicile?.postalCode,
        domicile_province: addresses.domicile?.province,
      },
      title: name.title,
      confidence: Math.min(1, 0.75),
      snippet: makeSnippet(
        text,
        Math.max(0, text.indexOf(name.text) - 20),
        name.text.length + 40
      ),
      page,
      box: unionBoxes(tokens, name.start, name.end),
    })
  }
  return occurrences
}

const detectPreAnchorPeople = (tokens: Token[], text: string, page: number): OccOut[] => {
  const occurrences: OccOut[] = []
  const pattern = new RegExp(
    String.raw`(${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4})\s*,?\s+(?:nat(?:o|a|o\/a)(?:\s+a)?|n\.)\b`,
    'giu'
  )
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const fullName = match[1].replace(TITLES, '').trim()
    if (!fullName || !isLikelyPersonName(fullName)) continue
    const startToken = charOffsetToTokenIndex(tokens, match.index)
    const previousToken = startToken - 1
    if (previousToken >= 0) {
      const word = tokens[previousToken].text
      const lower = word.toLowerCase()
      const isParticle = new RegExp(`^${PARTICLE}$`, 'i').test(word)
      const isLowerStop = /^[a-zà-öø-ÿ]+$/.test(word) && !isParticle
      if (isLowerStop || STOP_TOKENS.has(lower) || NON_NAME_WORDS.has(lower)) continue
    }
    const { first, last } = splitName(fullName)
    occurrences.push({
      personKey: makePersonKey(fullName),
      full_name: fullName,
      first_name: first,
      last_name: last,
      fields: {},
      confidence: Math.min(1, 0.75),
      snippet: makeSnippet(text, match.index, fullName.length),
      page,
      box: bboxForSubstring(tokens, match.index, fullName.length),
    })
  }
  return occurrences
}

/** Extracts person occurrences from one tokenized page without runtime side effects. */
export function detectOnPage(inputTokens: Token[], page: number): OccOut[] {
  const tokens = normalizeAnalysisTokens(inputTokens)
  const text = pageText(tokens)
  return deduplicateOccurrences([
    ...detectEnumeratedPeople(tokens, text, page),
    ...detectAnchoredPeople(tokens, text, page),
    ...detectPreAnchorPeople(tokens, text, page),
  ])
}
