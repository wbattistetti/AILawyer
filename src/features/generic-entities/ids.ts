/**
 * Hash e chiavi deterministiche per entità/occorrenze (nessuna randomness).
 */

/** Hash djb2 esadecimale stabile su stringa. */
export function stableHash(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('stableHash: input must be a string')
  }
  let hash = 5381
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Normalizza testo per chiavi di deduplicazione. */
export function normalizeKeyPart(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Costruisce una entityKey deterministica `kind:hash`.
 * Fallisce se kind o parts sono invalidi.
 */
export function makeEntityKey(kind: string, ...parts: Array<string | undefined>): string {
  if (!kind || typeof kind !== 'string') {
    throw new Error('makeEntityKey: kind is required')
  }
  const normalized = parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map(normalizeKeyPart)
  if (normalized.length === 0) {
    throw new Error(`makeEntityKey: at least one non-empty part required for kind=${kind}`)
  }
  return `${kind}:${stableHash(normalized.join('|'))}`
}

/** ID locale di hit di pagina, deterministico su doc/page/kind/offset. */
export function makeLocalHitId(
  docId: string,
  page: number,
  kind: string,
  start: number,
  label: string
): string {
  if (!docId) throw new Error('makeLocalHitId: docId is required')
  if (!Number.isInteger(page) || page < 1) throw new Error('makeLocalHitId: page must be >= 1')
  if (!Number.isInteger(start) || start < 0) throw new Error('makeLocalHitId: start must be >= 0')
  return `hit:${stableHash([docId, String(page), kind, String(start), normalizeKeyPart(label)].join('|'))}`
}

/** ID occorrenza deterministico. */
export function makeOccurrenceId(
  entityKey: string,
  docId: string,
  page: number,
  start: number
): string {
  return `occ:${stableHash([entityKey, docId, String(page), String(start)].join('|'))}`
}

/** ID relazione deterministico. */
export function makeRelationId(
  kind: string,
  fromEntityId: string,
  toEntityId: string
): string {
  return `rel:${stableHash([kind, fromEntityId, toEntityId].join('|'))}`
}
