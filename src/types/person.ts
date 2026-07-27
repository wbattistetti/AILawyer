/**
 * Contratti condivisi per schede anagrafiche ed evidenze documentali.
 */

export type BoxPct = {
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
}

export type OccurrenceRecord = {
  id: string
  praticaId?: string
  personKey: string
  docId: string
  docTitle: string
  page: number
  snippet: string
  box: BoxPct
  createdAt: number
}

export type PersonRecord = {
  id: string
  praticaId?: string
  full_name: string
  first_name?: string
  last_name?: string
  date_of_birth?: string
  place_of_birth?: string
  tax_code?: string
  address?: string
  residence_address?: string
  domicile_address?: string
  postal_code?: string
  city?: string
  province?: string
  phone?: string
  email?: string
  profession?: string
  titles?: string[]
  confidence: number
  occCount: number
  updatedAt: number
}

export type PracticePersonsPayload = {
  persons: PersonRecord[]
  occurrences: OccurrenceRecord[]
}
