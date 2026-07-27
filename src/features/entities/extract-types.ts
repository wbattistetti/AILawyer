/**
 * Shared contracts for person extraction and the Web Worker message protocol.
 */

export type Token = {
  text: string
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
}

export type PageTokens = {
  page: number
  tokens: Token[]
  docId: string
  docTitle: string
}

export type WorkerIn =
  | { type: 'beginDoc'; docId: string; docTitle: string; lenient?: boolean }
  | { type: 'page'; payload: PageTokens }
  | { type: 'endDoc'; docId: string }
  | { type: 'cancel' }

export type BoxPct = {
  x0Pct: number
  x1Pct: number
  y0Pct: number
  y1Pct: number
}

export type OccOut = {
  personKey: string
  full_name: string
  first_name?: string
  last_name?: string
  fields: Partial<{
    date_of_birth: string
    place_of_birth: string
    tax_code: string
    address: string
    postal_code: string
    city: string
    province: string
    phone: string
    email: string
    profession: string
    raw_residence_text: string
    raw_domicile_text: string
    domicile: string
    domicile_city: string
    domicile_postal_code: string
    domicile_province: string
  }>
  title?: string
  confidence: number
  snippet: string
  page: number
  box: BoxPct
}

export type WorkerOut =
  | { type: 'progress'; docId: string; page: number }
  | { type: 'occurrences'; docId: string; page: number; items: OccOut[] }
  | { type: 'done'; docId: string }
  | { type: 'error'; message: string }
