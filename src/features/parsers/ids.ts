import type { DetectFn, ThingOut } from './types'

// Whole-word identifiers
const CF = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g
const IBAN_IT = /\bIT\d{2}[A-Z]\d{10,30}\b/ig

// Partita IVA with explicit prefix only (avoid random 11-digit numbers)
// Accepts: "Partita IVA", "P.IVA", "P IVA", "PIVA", case-insensitive, optional separators
const PIVA_PREFIX = /(?:partita\s*iva|p\.?\s*iva|pi\s*va|piva)/i
const PIVA_PATTERN = new RegExp(`${PIVA_PREFIX.source}\\s*[:\-]?\\s*\\b(\\d{11})\\b`, 'gi')

export const detectIds: DetectFn = ({ page, tokens }) => {
  const text = tokens.map(t => t.text).join(' ')
  const out: ThingOut[] = []
  for (const m of text.matchAll(CF)) out.push({ id: `cf_${page}_${m.index}`, kind: 'id', label: 'Codice fiscale', value: m[0], page })
  for (const m of text.matchAll(PIVA_PATTERN)) {
    const val = (m[1] || '').trim()
    if (val) out.push({ id: `piva_${page}_${m.index}`, kind: 'id', label: 'Partita IVA', value: val, page })
  }
  for (const m of text.matchAll(IBAN_IT)) out.push({ id: `iban_${page}_${m.index}`, kind: 'id', label: 'IBAN', value: m[0], page })
  return out
}


