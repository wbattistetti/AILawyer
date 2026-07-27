/**
 * Risolve varianti OCR della stessa persona senza fondere omonimi arbitrariamente.
 */

import type { PersonRecord } from './entity-index'

type CandidateFields = Partial<PersonRecord> & {
  date_of_birth?: string
  tax_code?: string
}

const normalize = (value?: string): string =>
  (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokens = (value?: string): string[] => normalize(value).split(' ').filter(Boolean)

const normalizeDob = (raw?: string): string | undefined => {
  if (!raw) return undefined
  const match = raw.match(/([0-3]?\d)[./-]([01]?\d)[./-]((?:19|20)\d{2})/)
  if (!match) return raw
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

const levenshtein = (left: string, right: string): number => {
  if (!left) return right.length
  if (!right) return left.length
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

const nameSimilarity = (left: string, right: string): number => {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return 0
  if (a === b) return 1
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

const isTokenSubset = (left: string, right: string): boolean => {
  const a = tokens(left)
  const b = new Set(tokens(right))
  return a.length >= 2 && a.every(token => b.has(token))
}

/** Verifica che due record non abbiano campi identificativi incompatibili. */
export function areIdentityFieldsCompatible(
  existing: Partial<PersonRecord>,
  incoming: CandidateFields
): boolean {
  const pairs: Array<[unknown, unknown]> = [
    [normalizeDob(existing.date_of_birth), normalizeDob(incoming.date_of_birth)],
    [normalize(existing.tax_code), normalize(incoming.tax_code)],
  ]
  return pairs.every(([left, right]) => !left || !right || left === right)
}

/**
 * Punteggio match:
 * - CF uguale: identità forte;
 * - nome esatto: comportamento standard;
 * - fuzzy/subset solo con stessa data di nascita.
 */
export function identityMatchScore(
  existing: PersonRecord,
  incomingName: string,
  incoming: CandidateFields
): number {
  if (!areIdentityFieldsCompatible(existing, incoming)) return -1

  const existingCf = normalize(existing.tax_code)
  const incomingCf = normalize(incoming.tax_code)
  if (existingCf && incomingCf && existingCf === incomingCf) return 120

  const existingName = normalize(existing.full_name)
  const candidateName = normalize(incomingName)
  if (existingName === candidateName) return 100

  const sameDob = Boolean(
    normalizeDob(existing.date_of_birth) &&
    normalizeDob(existing.date_of_birth) === normalizeDob(incoming.date_of_birth)
  )
  if (!sameDob) return -1

  if (
    isTokenSubset(existing.full_name, incomingName) ||
    isTokenSubset(incomingName, existing.full_name)
  ) return 90

  const similarity = nameSimilarity(existing.full_name, incomingName)
  return similarity >= 0.78 ? Math.round(similarity * 80) : -1
}

/** Restituisce il miglior ID compatibile oppure null. */
export function findBestPersonMatch(
  persons: Iterable<PersonRecord>,
  incomingName: string,
  incoming: CandidateFields
): string | null {
  let bestId: string | null = null
  let bestScore = -1
  for (const person of persons) {
    const score = identityMatchScore(person, incomingName, incoming)
    if (score > bestScore) {
      bestScore = score
      bestId = person.id
    }
  }
  return bestScore >= 0 ? bestId : null
}

