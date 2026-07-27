/**
 * Infers male/female/person icon kind from explicit honorific titles or Italian tax codes.
 */

export type PersonIconKind = 'person' | 'male' | 'female'

/**
 * Returns a sex-aware person icon kind only when evidence is explicit.
 * Unknown sex falls back to the neutral person icon.
 */
export function inferPersonKind(
  title: string | undefined,
  taxCode: string | undefined,
): PersonIconKind {
  const normalizedTitle = title?.toLocaleLowerCase('it-IT').replace(/\s+/g, '') ?? ''
  if (/^(?:sig\.?ra|dott\.?ssa|dr\.?ssa|prof\.?ssa)$/u.test(normalizedTitle)) return 'female'
  if (/^(?:sig\.?|dott\.?|dr\.?|prof\.?)$/u.test(normalizedTitle)) return 'male'

  const normalizedTaxCode = taxCode?.replace(/\s+/g, '').toUpperCase()
  if (normalizedTaxCode && /^[A-Z0-9]{16}$/.test(normalizedTaxCode)) {
    const encodedDay = Number(normalizedTaxCode.slice(9, 11))
    if (Number.isInteger(encodedDay) && encodedDay >= 1 && encodedDay <= 31) return 'male'
    if (Number.isInteger(encodedDay) && encodedDay >= 41 && encodedDay <= 71) return 'female'
  }
  return 'person'
}
