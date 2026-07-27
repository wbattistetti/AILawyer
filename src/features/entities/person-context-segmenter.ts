/**
 * Segmenta il testo OCR affinché ogni candidato persona veda solo il proprio contesto.
 */

const NAME_TOKEN = String.raw`(?:\p{Lu}[\p{Ll}'’\-]{1,}|\p{Lu}{2,})`
const PERSON_NAME = String.raw`(?:${NAME_TOKEN}\s+){1,4}${NAME_TOKEN}`
const BIRTH_MARKER = String.raw`nat(?:o|a)(?:\s*a)?`

const NEXT_PERSON = new RegExp(
  String.raw`(?:^|[\.,;:]\s+)(?:\d+\.\s*)?${PERSON_NAME}\s*,?\s+${BIRTH_MARKER}\b`,
  'gu'
)

/** Normalizza errori OCR frequenti senza alterare il contenuto semantico. */
export function normalizePersonContextText(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/\bnatoa\b/giu, 'nato a')
    .replace(/\bnataa\b/giu, 'nata a')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Indice del prossimo blocco persona, incluso il delimitatore che lo precede. */
export function findNextPersonBoundary(text: string): number | null {
  NEXT_PERSON.lastIndex = 0
  const match = NEXT_PERSON.exec(text)
  return match?.index ?? null
}

/**
 * Restituisce il contesto della persona corrente fermandosi prima della successiva.
 */
export function boundPersonContext(text: string, maxLength = 500): string {
  const normalized = normalizePersonContextText(text).slice(0, maxLength)
  const boundary = findNextPersonBoundary(normalized)
  return (boundary === null ? normalized : normalized.slice(0, boundary))
    .replace(/[\s,;:.-]+$/, '')
    .trim()
}

