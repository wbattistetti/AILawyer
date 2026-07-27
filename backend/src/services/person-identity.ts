/**
 * Validazione e identificazione deterministica dei dati anagrafici persistiti.
 */

import { createHash } from 'node:crypto'

const TAX_CODE_PATTERN = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/u

/**
 * Verifica struttura e carattere di controllo di un codice fiscale italiano.
 */
export function isValidItalianTaxCode(value: string): boolean {
  const code = value.trim().toUpperCase()
  if (!TAX_CODE_PATTERN.test(code)) return false

  const odd: Record<string, number> = {
    0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
    K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
    U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
  }
  const even = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sum = 0
  for (let index = 0; index < 15; index += 1) {
    const character = code[index]!
    sum += index % 2 === 0 ? odd[character]! : even.indexOf(character)
  }
  return code[15] === String.fromCharCode(65 + (sum % 26))
}

/**
 * Crea una chiave stabile per deduplicare la stessa evidenza documentale.
 */
export function createOccurrenceFingerprint(input: {
  personKey: string
  docId: string
  page: number
  snippet: string
  box: unknown
}): string {
  const canonical = JSON.stringify([
    input.personKey,
    input.docId,
    input.page,
    input.snippet.replace(/\s+/g, ' ').trim(),
    input.box,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}
