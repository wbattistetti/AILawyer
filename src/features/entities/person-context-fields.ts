/**
 * Estrae residenza e domicilio da un contesto già segmentato per singola persona.
 */

import {
  findNextPersonBoundary,
  normalizePersonContextText,
} from './person-context-segmenter'

export type ParsedAddress = {
  address?: string
  postalCode?: string
  city?: string
  province?: string
  raw?: string
}

export type PersonAddressFields = {
  residence?: ParsedAddress
  domicile?: ParsedAddress
}

const ADDRESS_PREFIX = String.raw`(?:via|viale|piazza|corso|largo|vicolo|contrada|localit[aà])`
const CITY = String.raw`[A-ZÀ-Ü][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-ZÀ-Ü][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+)*`

const cleanCapturedAddress = (raw: string): string | null => {
  let value = normalizePersonContextText(raw)
  const fieldBoundary = value.search(
    /,\s*(?:identificat[oa]|sedicente|(?:di\s+fatto\s+)?domiciliat[oa]|del\s+foro|codice\s+fiscale|documento|professione|occupazione)\b/iu
  )
  if (fieldBoundary >= 0) value = value.slice(0, fieldBoundary)
  const narrativeBoundary = value.search(
    /\.\.+\s+(?:e\s+della|resisi|arrestat[oa]|denunciat[oa]|verbale|alla\s+procura)\b/iu
  )
  if (narrativeBoundary >= 0) value = value.slice(0, narrativeBoundary)
  value = value.replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').trim()

  if (!value || value.length > 160) return null
  if (/\bnat(?:o|a)(?:\s+a)?\b/iu.test(value)) return null
  if (findNextPersonBoundary(value) !== null) return null
  return value
}

const matchAddress = (context: string, patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    const match = context.match(pattern)
    const value = match?.[1] ? cleanCapturedAddress(match[1]) : null
    if (value) return value
  }
  return null
}

/** Converte un indirizzo testuale in componenti senza confondere nascita e residenza. */
export function parseContextAddress(raw: string): ParsedAddress {
  const normalized = normalizePersonContextText(raw)
  const addressInput = normalized.replace(/^(?:a|in)\s+/iu, '')
  let address = addressInput
  let city: string | undefined
  let province: string | undefined
  let postalCode: string | undefined

  const cityThenStreet = addressInput.match(
    new RegExp(String.raw`^(${CITY})(?:\s*\(([A-Z]{2})\))?\s+(?:in|alla?|presso)\s+(${ADDRESS_PREFIX}\b.+)$`, 'iu')
  )
  if (cityThenStreet) {
    city = cityThenStreet[1]
    province = cityThenStreet[2]?.toUpperCase()
    address = cityThenStreet[3]
  }

  const capThenCity = addressInput.match(
    new RegExp(String.raw`\b(\d{5})\s+(${CITY})(?:\s*\(([A-Z]{2})\))?`, 'u')
  )
  if (capThenCity) {
    postalCode = capThenCity[1]
    city = city || capThenCity[2]
    province = province || capThenCity[3]?.toUpperCase()
    if (!cityThenStreet) {
      address = addressInput.slice(0, capThenCity.index).replace(/[\s,;-]+$/, '').trim()
    }
  }

  if (!province) {
    const provinceMatch = addressInput.match(/\(([A-Z]{2})\)/u)
    if (provinceMatch) province = provinceMatch[1].toUpperCase()
  }

  return {
    ...(address ? { address } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    raw: normalized,
  }
}

/** Estrae i soli campi indirizzo appartenenti alla persona corrente. */
export function extractPersonAddressFields(context: string): PersonAddressFields {
  const normalized = normalizePersonContextText(context)
  const residenceRaw = matchAddress(normalized, [
    /\bresident[ea]\s+(?:in\s+)?(.+)$/iu,
    /\bivi\s+res\.?\s+(?:in\s+)?(.+)$/iu,
    /\be\s+res\.?\s+(?:in\s+)?(.+)$/iu,
  ])
  const domicileRaw = matchAddress(normalized, [
    /\b(?:di\s+fatto\s+)?domiciliat[oa]\s+(?:in\s+)?(.+)$/iu,
    /\bdomicilio\s+(?:eletto\s+)?(?:in\s+)?(.+)$/iu,
  ])

  return {
    ...(residenceRaw ? { residence: parseContextAddress(residenceRaw) } : {}),
    ...(domicileRaw ? { domicile: parseContextAddress(domicileRaw) } : {}),
  }
}

