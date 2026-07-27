/**
 * Qualità e confini per organization/venue/company: trim, reject, flag, needsReview.
 * Fase A della pipeline ibrida (regex strette + triage; LLM in Fase B).
 */

import { INSTITUTION_WORDS, LEGAL_BOILERPLATE } from './patterns'

/** Flag di incertezza su candidati organization/venue/company. */
export type OrganizationUncertaintyFlag =
  | 'endsWithStopWord'
  | 'containsLegalBoilerplate'
  | 'ocrWeirdness'
  | 'venueNoProperName'
  | 'companySuffixInAddress'
  | 'spanTooLong'
  | 'incompleteInstitution'
  | 'trailingDescriptivePhrase'
  | 'pubblicoMisreadAsPub'

/** Stato review UI / merge della pipeline regex → LLM. */
export type EntityReviewStatus =
  | 'ok'
  | 'needs_review'
  | 'ner_verified'
  | 'ner_corrected'
  | 'ner_uncertain'
  | 'ner_unavailable'
  | 'llm_verified'
  | 'llm_corrected'
  | 'review_failed'

export type OrganizationCandidateKind = 'venue' | 'company' | 'institution'

export type OrganizationQualityInput = {
  kind: OrganizationCandidateKind
  /** Testo grezzo del match (label o span). */
  rawText: string
  /** Sola parte “nome” (senza categoria venue / senza forma sociale). */
  namePart?: string
  /** Forma sociale se company (es. SNC, SPA). */
  legalForm?: string
  /** Caratteri immediatamente prima del match (per snc in indirizzo). */
  textBefore?: string
  /** Contesto snippet o riga intorno al match. */
  context?: string
  baseConfidence: number
}

export type OrganizationQualityResult = {
  /** false = non emettere l’hit. */
  accept: boolean
  /** Label dopo trim dei confini destri. */
  label: string
  /** namePart eventualmente trimmato. */
  namePart?: string
  /** Quanti caratteri togliere dalla fine del match grezzo. */
  trimEndChars: number
  flags: OrganizationUncertaintyFlag[]
  needsReview: boolean
  reviewStatus: EntityReviewStatus
  confidence: number
  rejectReason?: OrganizationUncertaintyFlag
}

/** Parole che non possono chiudere un nome di ente/venue. */
const TRAILING_STOP = new Set([
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'uno',
  'una',
  'di',
  'del',
  'della',
  'dello',
  'dei',
  'degli',
  'delle',
  'da',
  'dal',
  'dalla',
  'in',
  'nel',
  'nella',
  'su',
  'sul',
  'sulla',
  'con',
  'per',
  'tra',
  'fra',
  'a',
  'ad',
  'al',
  'alla',
  'ai',
  'agli',
  'alle',
  'o',
  'oppure',
  'ed',
  'e',
  'presso',
  'verso',
  'durante',
  'specie',
  'ubicato',
  'ubicata',
  'ubicati',
  'nelle',
  'vicinanze',
  'sede',
  'sopperire',
  'perquisire',
  'proceduto',
  'procedere',
  'ai',
  'sensi',
  'comma',
  'art',
  'articolo',
  'ore',
  'notturne',
  'cronica',
  'carenza',
])

/** Inizio di frase descrittiva dopo un nome (taglia da qui in poi). */
const DESCRIPTIVE_TAIL =
  /\s+(?:specie|durante|per\s+sopperire|ubicato|ubicata|nelle\s+vicinanze|ai\s+sensi|o\s+della|presso\s+il)\b/iu

const OCR_WEIRD =
  /(?:\b\w\s+\w{2,}\b)|(?:['’]\s*[A-Za-z])|(?:=\s*[A-ZÀ-Ü]{2,}\s*=)|(?:\b[A-ZÀ-Ü]{1,2}\b\s+presso)|(?:\bGr\b)/u

const PUBBLICO_AS_PUB =
  /\bpub\s*y?\s*lico\b|\bpubblico\b|\bpub\s*blico\b/iu

const ROAD_BEFORE =
  /\b(?:via|viale|v\.le|corso|c\.so|piazza|p\.zza|piazzale|largo|vicolo|strada|localit[aà]|loc\.)\b/iu

const MAX_SPAN_WORDS = 8

/**
 * Valuta e eventualmente ritaglia un candidato organization/venue/company.
 */
export function assessOrganizationQuality(
  input: OrganizationQualityInput
): OrganizationQualityResult {
  if (!input || typeof input.rawText !== 'string') {
    throw new Error('assessOrganizationQuality: rawText is required')
  }
  if (!Number.isFinite(input.baseConfidence)) {
    throw new Error('assessOrganizationQuality: baseConfidence must be finite')
  }

  const flags: OrganizationUncertaintyFlag[] = []
  let label = collapseWs(input.rawText)
  let namePart = input.namePart ? collapseWs(input.namePart) : undefined
  let trimEndChars = 0

  if (input.kind === 'company' && isCompanySuffixInAddress(input)) {
    return reject('companySuffixInAddress', input.baseConfidence)
  }

  if (input.kind === 'venue' && looksLikePubblicoMisread(input)) {
    return reject('pubblicoMisreadAsPub', input.baseConfidence)
  }

  if (input.kind === 'institution' && isIncompleteInstitution(label)) {
    flags.push('incompleteInstitution')
  }

  const beforeTrim = label
  const trimmed = trimTrailingStops(label)
  if (trimmed.text !== beforeTrim) {
    flags.push('endsWithStopWord')
    trimEndChars += beforeTrim.length - trimmed.text.length
    label = trimmed.text
    if (namePart) {
      namePart = trimTrailingStops(namePart).text
    }
  }

  const descriptiveCut = cutDescriptiveTail(label)
  if (descriptiveCut.cut) {
    flags.push('trailingDescriptivePhrase')
    trimEndChars += label.length - descriptiveCut.text.length
    label = descriptiveCut.text
    if (namePart) {
      const nameCut = cutDescriptiveTail(namePart)
      namePart = nameCut.text
    }
  }

  if (LEGAL_BOILERPLATE.test(label) || (input.context && LEGAL_BOILERPLATE.test(input.context))) {
    flags.push('containsLegalBoilerplate')
    if (input.kind === 'venue') {
      return reject('containsLegalBoilerplate', input.baseConfidence, flags)
    }
  }

  if (input.kind === 'venue' && !hasProperNameToken(namePart ?? label)) {
    flags.push('venueNoProperName')
    return reject('venueNoProperName', input.baseConfidence, flags)
  }

  if (input.kind === 'venue' && isInstitutionWordName(namePart ?? label)) {
    flags.push('venueNoProperName')
    return reject('venueNoProperName', input.baseConfidence, flags)
  }

  if (!label || wordCount(label) === 0) {
    return reject('venueNoProperName', input.baseConfidence, flags)
  }

  if (wordCount(label) > MAX_SPAN_WORDS) {
    flags.push('spanTooLong')
  }

  const ocrSource = `${label} ${input.context ?? ''}`
  if (OCR_WEIRD.test(ocrSource)) {
    flags.push('ocrWeirdness')
  }

  const endsStop = endsWithStopWord(label)
  if (endsStop) flags.push('endsWithStopWord')

  const needsReview = shouldNeedsReview(input.kind, flags, label)
  const confidence = adjustConfidence(input.baseConfidence, flags, needsReview)

  return {
    accept: true,
    label,
    namePart: namePart || undefined,
    trimEndChars,
    flags: uniqueFlags(flags),
    needsReview,
    reviewStatus: needsReview ? 'needs_review' : 'ok',
    confidence,
  }
}

/**
 * Heuristica needsReview (anche riusabile con NER in Fase C).
 */
export function needsOrganizationReview(
  kind: OrganizationCandidateKind,
  flags: readonly OrganizationUncertaintyFlag[],
  label: string
): boolean {
  return shouldNeedsReview(kind, flags, label)
}

function shouldNeedsReview(
  kind: OrganizationCandidateKind,
  flags: readonly OrganizationUncertaintyFlag[],
  label: string
): boolean {
  if (flags.length === 0) return false
  const hard = new Set<OrganizationUncertaintyFlag>([
    'ocrWeirdness',
    'incompleteInstitution',
    'spanTooLong',
    'containsLegalBoilerplate',
    'trailingDescriptivePhrase',
    'endsWithStopWord',
  ])
  if (flags.some(flag => hard.has(flag))) return true
  if (kind === 'institution' && endsWithStopWord(label)) return true
  return false
}

function adjustConfidence(
  base: number,
  flags: readonly OrganizationUncertaintyFlag[],
  needsReview: boolean
): number {
  let score = base
  score -= flags.length * 0.06
  if (needsReview) score -= 0.08
  return Math.max(0.35, Math.min(0.95, Number(score.toFixed(3))))
}

function reject(
  reason: OrganizationUncertaintyFlag,
  baseConfidence: number,
  priorFlags: OrganizationUncertaintyFlag[] = []
): OrganizationQualityResult {
  const flags = uniqueFlags([...priorFlags, reason])
  return {
    accept: false,
    label: '',
    trimEndChars: 0,
    flags,
    needsReview: true,
    reviewStatus: 'needs_review',
    confidence: Math.max(0.2, baseConfidence - 0.4),
    rejectReason: reason,
  }
}

function isCompanySuffixInAddress(input: OrganizationQualityInput): boolean {
  const form = (input.legalForm ?? '').replace(/\./g, '').toUpperCase()
  if (form !== 'SNC') return false
  const before = `${input.textBefore ?? ''} ${input.rawText}`
  return ROAD_BEFORE.test(before)
}

function looksLikePubblicoMisread(input: OrganizationQualityInput): boolean {
  const cat = input.rawText.trim().toLowerCase()
  if (!cat.startsWith('pub')) return false
  const ctx = `${input.rawText} ${input.context ?? ''} ${input.namePart ?? ''}`
  return PUBBLICO_AS_PUB.test(ctx) || /\bpub\s+\w/i.test(input.rawText)
}

function trimTrailingStops(text: string): { text: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  while (tokens.length > 0) {
    const last = normalizeToken(tokens[tokens.length - 1]!)
    if (!TRAILING_STOP.has(last)) break
    tokens.pop()
  }
  return { text: tokens.join(' ') }
}

function cutDescriptiveTail(text: string): { text: string; cut: boolean } {
  const match = DESCRIPTIVE_TAIL.exec(text)
  if (!match || match.index == null || match.index < 3) {
    return { text, cut: false }
  }
  return { text: text.slice(0, match.index).trim(), cut: true }
}

function hasProperNameToken(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  // Esige almeno un token con iniziale maiuscola (nome proprio / ente).
  return tokens.some(token => /^[A-ZÀ-Ü]/.test(token.replace(/^[^A-Za-zÀ-ü]+/, '')))
}

/** Evita "locale Commissariato…" / "bar Questura…" come venue commerciali. */
function isInstitutionWordName(text: string): boolean {
  const first = normalizeToken(text.trim().split(/\s+/)[0] ?? '')
  if (!first) return false
  if (INSTITUTION_WORDS.has(first)) return true
  return /^(commissariato|stazione|caserma|comando|reparto)$/i.test(first)
}

function isIncompleteInstitution(label: string): boolean {
  const lower = label.toLowerCase().trim()
  if (/\bprocura\s+della\s*$/i.test(label)) return true
  if (/\bpresso\s+il\s*$/i.test(label)) return true
  if (/\bprocura\s+della\s+repubblica\s*$/i.test(label)) return false
  if (/^(carabinieri|polizia|tribunale|procura|questura)$/i.test(lower)) return false
  return endsWithStopWord(label)
}

function endsWithStopWord(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return TRAILING_STOP.has(normalizeToken(tokens[tokens.length - 1]!))
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function uniqueFlags(
  flags: readonly OrganizationUncertaintyFlag[]
): OrganizationUncertaintyFlag[] {
  return [...new Set(flags)]
}
