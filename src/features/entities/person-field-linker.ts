/**
 * Estrae candidati persona e collega i campi anagrafici al relativo contesto testuale.
 */

export type FieldWithIndices = {
  value: string
  startIndex: number
  endIndex: number
}

export type ExtractedPersonWithIndices = {
  fullName: string
  fullNameIndices: { startIndex: number; endIndex: number }
  birthDate: FieldWithIndices | null
  birthPlace: FieldWithIndices | null
  residence: FieldWithIndices | null
  domicile: FieldWithIndices | null
  taxCode: FieldWithIndices | null
  phone: FieldWithIndices | null
  email: FieldWithIndices | null
  postalCode: FieldWithIndices | null
  city: FieldWithIndices | null
  province: FieldWithIndices | null
  profession: FieldWithIndices | null
  titles: string[]
  fields: Array<FieldWithIndices & { label: string }>
}

export type PersonExtractionResult = {
  persons: ExtractedPersonWithIndices[]
}

const MONTH_NAMES = 'gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?'
const TAX_CODE = /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/iu
const PHONE = /\b(?:\+?39\s?)?(?:0\d{1,3}|3\d{2})[\s./-]?\d{5,8}\b/iu
const EMAIL = /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/iu
const CAP = /\b\d{5}\b/u
const PROVINCE = /\(([A-Z]{2})\)/u
const CITY_WITH_PROVINCE = /\b([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+)*)\s*\(([A-Z]{2})\)/u

const CAP_LETTER = `[A-ZÀ-Ü]`
const LOWER = `[a-zà-ü'’\\-]+`
const ALL_CAPS = `[A-ZÀ-Ü'’\\-]{2,}`
const WORD = `(?:${CAP_LETTER}${LOWER}|${ALL_CAPS})`
const PARTICLE = `(?:d'|de|di|del|della|dell'|dei|degli|delle|da|dal|van|von|mc|mac|san|santa)`
const NAME_CHUNK = `(?:${WORD}|${PARTICLE}\\s+${WORD}|${WORD}\\s+${PARTICLE}\\s+${WORD})`
const NAME_SEQUENCE = new RegExp(String.raw`${NAME_CHUNK}(?:\s+${NAME_CHUNK}){1,4}`, 'giu')

const STOP_TOKENS = new Set([
  'ai', 'al', 'allo', 'alla', 'alle', 'agli', 'dei', 'degli', 'delle', 'del', 'della', 'dell',
  'lo', 'la', 'il', 'art', 'articolo', 'altre', 'altro', 'persone', 'anno', 'sensi',
  'riferimento', 'capo', 'cap', 'comma', 'convivente', 'coniuge', 'marito', 'moglie',
  'figlio', 'figlia', 'persona', 'soggetto', 'comunicazione', 'notizia'
])
const NON_NAME_WORDS = new Set([
  'comunicazione', 'notizia', 'reato', 'oggetto', 'procura', 'tribunale', 'comune',
  'questura', 'prefettura', 'ministero', 'direzione', 'centrale', 'servizio', 'sezione',
  'sequestro', 'dipartimento', 'ufficio', 'protocollo', 'prot', 'numero', 'via', 'viale', 'piazza'
])

const TITLE_PATTERN = /(?:avv\.?t?o?|avvocato|dott\.?ssa?|dr\.?ssa?|ing\.?|geom\.?|arch\.?|rag\.?|prof\.?|professore|professoressa|giudice|magistrato|p\.?m\.?|maresciallo|isp\.?|sovr\.?|ten\.?|cap\.?)\s*$/iu
const PROFESSION_PATTERN = /\b(?:di\s+professione|professione|occupazione)\s*[:\-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+){0,3})/iu

type Candidate = {
  fullName: string
  startIndex: number
  endIndex: number
}

function isLikelyPersonName(fullName: string): boolean {
  const parts = fullName.trim().split(/\s+/).filter(part => !STOP_TOKENS.has(part.toLowerCase()))
  if (parts.length < 2 || parts.length > 5) return false
  return parts.every(part =>
    new RegExp(`^${PARTICLE}$`, 'iu').test(part) ||
    (/^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’\-]+$/u.test(part) || /^[A-ZÀ-Ü][A-ZÀ-Ü'’\-]+$/u.test(part)) &&
      !NON_NAME_WORDS.has(part.toLowerCase())
  )
}

function findCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(NAME_SEQUENCE)) {
    if (match.index == null) continue
    const fullName = match[0].trim()
    if (!isLikelyPersonName(fullName)) continue
    const key = fullName.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      fullName,
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  return candidates
}

function firstField(
  context: string,
  contextStart: number,
  pattern: RegExp,
  captureGroup = 0,
  transform: (value: string) => string = value => value.trim()
): FieldWithIndices | null {
  const match = pattern.exec(context)
  const raw = match?.[captureGroup]
  if (!match || !raw) return null
  const relativeStart = match.index + match[0].indexOf(raw)
  return {
    value: transform(raw),
    startIndex: contextStart + relativeStart,
    endIndex: contextStart + relativeStart + raw.length
  }
}

function normalizeTitle(raw: string): string {
  const value = raw.replace(/\./g, '').trim().toLowerCase()
  if (value.startsWith('avv')) return 'Avvocato'
  if (value.startsWith('dott') || value.startsWith('dr')) return value.includes('ssa') ? 'Dottoressa' : 'Dottore'
  if (value.startsWith('prof')) return value.includes('ssa') ? 'Professoressa' : 'Professore'
  if (value.startsWith('ing')) return 'Ingegnere'
  if (value.startsWith('geom')) return 'Geometra'
  if (value.startsWith('arch')) return 'Architetto'
  if (value.startsWith('rag')) return 'Ragioniere'
  if (/^p\s*m$/u.test(value)) return 'Pubblico Ministero'
  return raw.trim()
}

function titleBefore(text: string, candidateStart: number): string[] {
  const prefix = text.slice(Math.max(0, candidateStart - 40), candidateStart)
  const match = prefix.match(TITLE_PATTERN)
  return match ? [normalizeTitle(match[0])] : []
}

function birthFields(context: string, contextStart: number) {
  const numericDate = /\b(?:nat(?:o|a|o\/a)(?:\s+(?:il|a))?\s+)?([0-3]?\d[./-][01]?\d[./-](?:19|20)\d{2})\b/iu
  const namedDate = new RegExp(String.raw`\b(?:nat(?:o|a|o\/a)(?:\s+(?:il|a))?\s+)?([0-3]?\d\s+(?:${MONTH_NAMES})\s+(?:19|20)\d{2})\b`, 'iu')
  const placePatterns = [
    /\b(?:nat(?:o|a|o\/a)|n\.)\s+(?:a|in)\s+([^,;\n.]+?)(?=\s*,?\s+il\b|[,;\n.]|$)/iu,
    /\b(?:nat(?:o|a|o\/a))\s+il\s+[^,;\n]+,\s+(?:a|in)\s+([^,;\n.]+)/iu
  ]
  const birthDate =
    firstField(context, contextStart, numericDate, 1) ??
    firstField(context, contextStart, namedDate, 1)
  let birthPlace: FieldWithIndices | null = null
  for (const pattern of placePatterns) {
    birthPlace = firstField(context, contextStart, pattern, 1)
    if (birthPlace) break
  }
  return { birthDate, birthPlace }
}

function addressField(context: string, contextStart: number, kind: 'residence' | 'domicile') {
  const prefix = kind === 'residence'
    ? String.raw`(?:resident[ea]|res\.)\s+(?:in\s+)?`
    : String.raw`(?:domiciliat[oa]|domicilio(?:\s+eletto)?)\s+(?:in\s+)?`
  const pattern = new RegExp(
    String.raw`\b${prefix}(.+?)(?=\s+(?:domiciliat[oa]|domicilio|codice\s+fiscale|c\.?f\.?|tel\.?|telefono|e-?mail)\b|[;\n]|$)`,
    'iu'
  )
  return firstField(context, contextStart, pattern, 1, value => value.replace(/[\s,.-]+$/u, '').trim())
}

function fieldInside(parent: FieldWithIndices | null, pattern: RegExp, captureGroup = 0): FieldWithIndices | null {
  if (!parent) return null
  return firstField(parent.value, parent.startIndex, pattern, captureGroup)
}

/**
 * Estrae persone e campi usando finestre che terminano prima del candidato successivo.
 */
export function linkPersonFields(input: string): PersonExtractionResult {
  if (!input?.trim()) return { persons: [] }
  const text = input.replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, ' ')
  const candidates = findCandidates(text)
  const persons = candidates.map((candidate, index): ExtractedPersonWithIndices => {
    const nextStart = candidates[index + 1]?.startIndex ?? text.length
    const contextEnd = Math.min(nextStart, candidate.endIndex + 500)
    const context = text.slice(candidate.startIndex, contextEnd)
    const contextStart = candidate.startIndex
    const { birthDate, birthPlace } = birthFields(context, contextStart)
    const residence = addressField(context, contextStart, 'residence')
    const domicile = addressField(context, contextStart, 'domicile')
    const addressForLocation = residence ?? domicile
    const cityMatch = fieldInside(addressForLocation, CITY_WITH_PROVINCE, 1)
    const provinceMatch = fieldInside(addressForLocation, PROVINCE, 1)
    const taxCodeCandidate = firstField(context, contextStart, TAX_CODE, 0, value => value.toUpperCase())
    const taxCode = taxCodeCandidate && isValidItalianTaxCode(taxCodeCandidate.value) ? taxCodeCandidate : null

    return {
      fullName: candidate.fullName,
      fullNameIndices: { startIndex: candidate.startIndex, endIndex: candidate.endIndex },
      birthDate,
      birthPlace,
      residence,
      domicile,
      taxCode,
      phone: firstField(context, contextStart, PHONE),
      email: firstField(context, contextStart, EMAIL, 0, value => value.toLowerCase()),
      postalCode: fieldInside(addressForLocation, CAP),
      city: cityMatch,
      province: provinceMatch
        ? { ...provinceMatch, value: provinceMatch.value.toUpperCase() }
        : null,
      profession: firstField(context, contextStart, PROFESSION_PATTERN, 1),
      titles: titleBefore(text, candidate.startIndex),
      fields: []
    }
  })
  return { persons }
}

/**
 * Verifica struttura e carattere di controllo di un codice fiscale italiano.
 */
export function isValidItalianTaxCode(value: string): boolean {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9]{16}$/u.test(code) || !TAX_CODE.test(code)) return false
  const odd: Record<string, number> = {
    0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
    K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
    U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23
  }
  const even = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sum = 0
  for (let index = 0; index < 15; index += 1) {
    const char = code[index]
    sum += index % 2 === 0 ? odd[char] : even.indexOf(char)
  }
  return code[15] === String.fromCharCode(65 + (sum % 26))
}
