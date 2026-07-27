/**
 * Parses person names, birth details, identity fields, and stable person keys.
 */

import { isValidItalianTaxCode } from './person-field-linker'
import type { OccOut, Token } from './extract-types'

const MONTHS = '(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\\w*'
const RX = {
  cf: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/i,
  dob1: /\b([0-3]?\d)[\/\.\-]([01]?\d)[\/\.\-]((?:19|20)\d{2})\b/i,
  dobOcr: /\b([0-3]?\d)[\/.\-]([01]?\d)\s*(?:[,\/.\-]\s*)?((?:19|20)?\d{2})\b/i,
  dob2: new RegExp(String.raw`\b([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})\b`, 'i'),
  phone: /\b(?:\+?39\s?)?(?:0\d{1,3}|3\d{2})[\s\./-]?\d{5,8}\b/i,
  email: /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/i,
  cap: /\b\d{5}\b/,
}

const CAPITAL = `[A-ZÀ-Ü]`
const LOWER = `[a-zà-ü'’\\-]+`
const ALL_CAPS = `[A-ZÀ-Ü'’\\-]{2,}`
const WORD = `(?:${CAPITAL}${LOWER}|${ALL_CAPS})`
export const PARTICLE = `(?:d'|de|di|del|della|dell'|dei|degli|delle|da|dal|van|von|mc|mac|san|santa)`
export const NAME_CHUNK = `(?:${WORD}|${PARTICLE}\\s+${WORD}|${WORD}\\s+${PARTICLE}\\s+${WORD})`
export const NAME_SEQUENCE_SOURCE = String.raw`${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4}`
export const TITLES = /^(sig\.?|sig\.ra|avv\.|dott\.ssa?|ing\.|geom\.|rag\.)\s+/i
export const BIRTH_ANCHORS = /\b(nat(?:o|a|o\/a)(?:\s+a)?|n\.)\b/iu

export const STOP_TOKENS = new Set<string>([
  'ai', 'al', 'allo', 'alla', 'alle', 'agli', 'dei', 'degli', 'delle', 'del',
  'della', 'dell', 'all', 'lo', 'la', 'il', 'l\'', 'l’', 'art', 'articolo',
  'altre', 'altro', 'persone', 'anno', 'sensi', 'riferimento', 'capo', 'cap',
  'comma', 'convivente', 'coniuge', 'marito', 'moglie', 'figlio', 'figlia',
  'persona', 'soggetto', 'comunicazione', 'notizia',
])

export const NON_NAME_WORDS = new Set<string>([
  'comunicazione', 'notizia', 'reato', 'oggetto', 'procura', 'tribunale',
  'comune', 'questura', 'prefettura', 'ministero', 'direzione', 'centrale',
  'servizio', 'sezione', 'sequestro', 'dipartimento', 'ufficio', 'protocollo',
  'prot', 'numero', 'via', 'viale', 'piazza', 'verbale', 'arresto', 'denuncia',
  'liberta',
])

const isPunctuation = (token: string): boolean => /^(,|;|:|\.|—)$/.test(token)
const isUpper = (token: string): boolean => /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’\-]+$/.test(token)
const isTitle = (token: string): boolean => /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’\-]+$/.test(token)
const isParticle = (token: string): boolean => new RegExp(`^${PARTICLE}$`, 'i').test(token)
const isLowerWord = (token: string): boolean => /^[a-zà-öø-ÿ]+$/.test(token)
const isPlaceToken = (token: string): boolean => isTitle(token) || isUpper(token) || isParticle(token)
const isNameToken = (token: string): boolean =>
  !NON_NAME_WORDS.has(token.toLowerCase()) && (isUpper(token) || isTitle(token) || isParticle(token))

/** Checks whether a candidate contains a plausible multi-token person name. */
export function isLikelyPersonName(fullName: string): boolean {
  const parts = fullName.trim().split(/\s+/).filter(part =>
    part && !STOP_TOKENS.has(part.toLowerCase())
  )
  const nameTokens = parts.filter(part => isTitle(part) || isUpper(part))
  const last = parts[parts.length - 1] ?? ''
  const containsBlacklisted = parts.some(part =>
    !isParticle(part) && NON_NAME_WORDS.has(part.toLowerCase())
  )
  return nameTokens.length >= 2 &&
    (isTitle(last) || isUpper(last)) &&
    !/(\s|^)(il|la|lo)$/i.test(fullName.trim()) &&
    !containsBlacklisted
}

const normalizeBirthYear = (raw: string): string => {
  if (raw.length === 4) return raw
  const year = Number(raw)
  return year <= 29 ? String(2000 + year) : String(1900 + year)
}

const monthIndex = (month: string): string => {
  const map: Record<string, string> = {
    gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06',
    lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12',
  }
  return map[month.slice(0, 3).toLowerCase()] ?? '01'
}

const toIsoBirthDate = (
  dayRaw: string,
  monthRaw: string,
  yearRaw: string
): string | undefined => {
  const day = Number(dayRaw)
  const month = Number(monthRaw)
  const year = Number(yearRaw)
  const currentYear = new Date().getUTCFullYear()
  if (year < 1850 || year > currentYear || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Normalizes a supported numeric or textual birth date to ISO format. */
export function normalizeBirthDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const numeric = raw.match(/([0-3]?\d)[\.\/-]([01]?\d)[\.\/-]((?:19|20)\d{2})/)
  if (numeric) return toIsoBirthDate(numeric[1], numeric[2], numeric[3])
  const ocr = raw.match(RX.dobOcr)
  if (ocr) return toIsoBirthDate(ocr[1], ocr[2], normalizeBirthYear(ocr[3]))
  const textual = raw.match(
    new RegExp(String.raw`([0-3]?\d)\s+${MONTHS}\s+((?:19|20)\d{2})`, 'i')
  )
  return textual
    ? toIsoBirthDate(textual[1], monthIndex(textual[2]), textual[3])
    : undefined
}

/** Extracts place and date of birth immediately following a birth anchor. */
export function extractBirthContext(
  tokens: Token[],
  anchorToken: number
): { pob?: string; dob?: string } {
  const output: { pob?: string; dob?: string } = {}
  const start = anchorToken + 1
  let end = Math.min(tokens.length - 1, start + 16)
  for (let index = start; index <= end; index++) {
    if (/^(?:resident|ivi|res\.?|domiciliat|identificat)/iu.test(tokens[index].text)) {
      end = Math.max(start, index - 1)
      break
    }
  }
  const aheadText = tokens.slice(start, end + 1).map(token => token.text).join(' ')
  const numeric = aheadText.match(RX.dob1)
  const ocr = aheadText.match(RX.dobOcr)
  const textual = aheadText.match(RX.dob2)
  if (numeric) output.dob = toIsoBirthDate(numeric[1], numeric[2], numeric[3])
  else if (ocr) output.dob = toIsoBirthDate(ocr[1], ocr[2], normalizeBirthYear(ocr[3]))
  else if (textual) output.dob = toIsoBirthDate(textual[1], monthIndex(textual[2]), textual[3])

  let index = start
  while (index <= end && isPunctuation(tokens[index].text)) index++
  if (index <= end && ['a', 'in'].includes(tokens[index].text.toLowerCase())) {
    const placeTokens: string[] = []
    for (index++; index <= end; index++) {
      const token = tokens[index].text
      if (isPunctuation(token) || token.toLowerCase() === 'il' || !isPlaceToken(token)) break
      placeTokens.push(token)
    }
    if (placeTokens.length > 0) output.pob = placeTokens.join(' ').replace(/\s{2,}/g, ' ').trim()
  }
  return output
}

const normalizedTitleBefore = (tokens: Token[], nameStart: number): string | undefined => {
  const single = /^(?:avv\.?t?i?|avvocato|dott\.?ssa?|dr\.?ssa?|ing\.?|geom\.?|arch\.?|rag\.?|prof\.?|giudice|magistrato|pm|p\.?m\.?|maresciallo|isp\.?|sovr\.?|ten\.?|cap\.?)$/iu
  const multi = /^(?:pubblico\s+ministero|sost\.?\s+proc\.?|sostituto\s+procuratore)$/iu
  const raw = nameStart >= 2 && multi.test(`${tokens[nameStart - 2].text} ${tokens[nameStart - 1].text}`)
    ? `${tokens[nameStart - 2].text} ${tokens[nameStart - 1].text}`
    : nameStart >= 1 && single.test(tokens[nameStart - 1].text)
      ? tokens[nameStart - 1].text
      : undefined
  if (!raw) return undefined
  const normalized = raw.replace(/\./g, '').toLowerCase().trim()
  if (normalized.startsWith('avv')) return 'Avvocato'
  if (normalized.startsWith('dott') || normalized.startsWith('dr')) {
    return normalized.includes('ssa') ? 'Dottoressa' : 'Dottore'
  }
  if (normalized.startsWith('ing')) return 'Ingegnere'
  if (normalized.startsWith('geom')) return 'Geometra'
  if (normalized.startsWith('arch')) return 'Architetto'
  if (normalized.startsWith('rag')) return 'Ragioniere'
  if (normalized.startsWith('prof')) return 'Professore'
  if (normalized.includes('pubblico ministero') || ['pm', 'p m'].includes(normalized)) return 'Pubblico Ministero'
  if (normalized.startsWith('sost')) return 'Sostituto Procuratore'
  if (normalized.startsWith('giudic')) return 'Giudice'
  if (normalized.startsWith('magist')) return 'Magistrato'
  if (normalized.startsWith('marescial')) return 'Maresciallo'
  if (normalized === 'ten' || normalized.startsWith('tenent')) return 'Tenente'
  if (normalized === 'cap' || normalized.startsWith('capit')) return 'Capitano'
  if (normalized.startsWith('isp')) return 'Ispettore'
  if (normalized.startsWith('sovr')) return 'Sovrintendente'
  return raw.trim()
}

export type ExtractedName = {
  start: number
  end: number
  text: string
  title?: string
}

/** Extracts the closest plausible person name immediately left of an anchor. */
export function extractNameLeftOf(tokens: Token[], anchorToken: number): ExtractedName | null {
  let stop = anchorToken - 1
  while (stop >= 0 && isPunctuation(tokens[stop].text)) stop--
  if (stop < 0) return null
  const minimum = Math.max(0, anchorToken - 12)
  let index = stop
  while (index >= minimum && !isPunctuation(tokens[index].text)) {
    if (isLowerWord(tokens[index].text) && !isParticle(tokens[index].text)) break
    index--
  }
  const leftBound = Math.max(minimum, index + 1)
  if (leftBound > stop) return null

  let best: { start: number; end: number } | null = null
  let segmentStart = -1
  for (let cursor = leftBound; cursor <= stop + 1; cursor++) {
    if (cursor <= stop && isNameToken(tokens[cursor].text)) {
      if (segmentStart === -1) segmentStart = cursor
    } else if (segmentStart !== -1) {
      const length = cursor - segmentStart
      if (length >= 2 && length <= 5) best = { start: segmentStart, end: cursor - 1 }
      segmentStart = -1
    }
  }
  if (!best) return null
  let start = best.start
  while (
    start <= best.end &&
    (STOP_TOKENS.has(tokens[start].text.toLowerCase()) ||
      NON_NAME_WORDS.has(tokens[start].text.toLowerCase()))
  ) start++
  if (start > best.end) return null
  const length = best.end - start + 1
  const finalStart = Math.max(start, best.end - Math.min(4, Math.max(2, length)) + 1)
  const text = tokens.slice(finalStart, best.end + 1)
    .map(token => token.text)
    .join(' ')
    .replace(/\s+,?$/, '')
    .trim()
  if (!isLikelyPersonName(text)) return null
  return { start: finalStart, end: best.end, text, title: normalizedTitleBefore(tokens, finalStart) }
}

/** Splits a normalized full name into first-name and last-name fields. */
export function splitName(fullName: string): { first: string; last: string } {
  const normalized = fullName.replace(/\s{2,}/g, ' ').trim()
  if (normalized.includes(',')) {
    const [last, first] = normalized.split(',', 2).map(part => part.trim())
    return { first, last }
  }
  const parts = normalized.split(/\s+/)
  const last = parts.pop() || ''
  return { first: parts.join(' '), last }
}

/** Extracts validated identity and contact fields from a person context. */
export function extractPersonFields(context: string): OccOut['fields'] {
  const fields: OccOut['fields'] = {}
  const taxCode = context.match(RX.cf)
  if (taxCode && isValidItalianTaxCode(taxCode[0])) fields.tax_code = taxCode[0].toUpperCase()
  const numericDate = context.match(RX.dob1)
  const textualDate = context.match(RX.dob2)
  if (numericDate) fields.date_of_birth = toIsoBirthDate(numericDate[1], numericDate[2], numericDate[3])
  else if (textualDate) fields.date_of_birth = toIsoBirthDate(textualDate[1], monthIndex(textualDate[2]), textualDate[3])
  const email = context.match(RX.email)
  if (email) fields.email = email[0]
  const phone = context.match(RX.phone)
  if (phone) fields.phone = phone[0]
  const postalCode = context.match(RX.cap)
  if (postalCode) fields.postal_code = postalCode[0]
  const profession = context.match(/\b(?:di\s+professione|professione|occupazione)\s*[:\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+){0,3})/i)
  if (profession) fields.profession = profession[1].trim()
  return fields
}

/** Builds the stable key used to group occurrences of the same person. */
export function makePersonKey(fullName: string, birthDate?: string, city?: string): string {
  const normalize = (value?: string): string =>
    (value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  const raw = `${normalize(fullName)}|${normalize(birthDate)}|${normalize(city)}`
  let hash = 2166136261
  for (let index = 0; index < raw.length; index++) {
    hash ^= raw.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `p_${(hash >>> 0).toString(16)}`
}
