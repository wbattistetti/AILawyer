/**
 * Detector di contatti (telefono/email) e identificatori (CF/P.IVA/IBAN).
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import { EMAIL, IBAN, PHONE, PIVA, TAX_CODE } from '../patterns'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'

/**
 * Estrae telefoni ed email come entità contact tipizzate.
 */
export function detectContacts(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectContacts: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(PHONE)) {
    if (match.index == null || !match.groups?.phone) continue
    const value = match.groups.phone.replace(/[\s./-]+/g, '')
    if (value.length < 9) continue
    const label = match.groups.phone.trim()
    const start = match.index + match[0].indexOf(match.groups.phone)
    const end = start + match.groups.phone.length
    const key = `phone:${value}`
    if (seen.has(`${start}:${key}`)) continue
    seen.add(`${start}:${key}`)
    hits.push({
      localId: makeLocalHitId(docId, page, 'contact', start, label),
      entityKey: makeEntityKey('contact', 'phone', value),
      kind: 'contact',
      subtype: 'phone',
      label,
      properties: { phone: value },
      confidence: 0.8,
      snippet: makeSnippet(text, start, end - start),
      box: bboxForSubstring(tokens, start, end - start),
      propertyKeys: ['phone'],
      start,
      end,
    })
  }

  for (const match of text.matchAll(EMAIL)) {
    if (match.index == null || !match.groups?.email) continue
    const value = match.groups.email.toLowerCase()
    const start = match.index
    const end = start + match[0].length
    hits.push({
      localId: makeLocalHitId(docId, page, 'contact', start, value),
      entityKey: makeEntityKey('contact', 'email', value),
      kind: 'contact',
      subtype: 'email',
      label: value,
      properties: { email: value },
      confidence: 0.9,
      snippet: makeSnippet(text, start, end - start),
      box: bboxForSubstring(tokens, start, end - start),
      propertyKeys: ['email'],
      start,
      end,
    })
  }

  return hits
}

/**
 * Estrae CF, P.IVA e IBAN come entità identifier.
 */
export function detectIdentifiers(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectIdentifiers: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []

  for (const match of text.matchAll(TAX_CODE)) {
    if (match.index == null || !match.groups?.cf) continue
    const value = match.groups.cf.toUpperCase()
    push('cf', value, match.index, match.index + value.length, 0.95)
  }
  for (const match of text.matchAll(PIVA)) {
    if (match.index == null || !match.groups?.piva) continue
    const value = match.groups.piva
    const local = match[0].lastIndexOf(value)
    const start = match.index + (local >= 0 ? local : 0)
    push('piva', value, start, start + value.length, 0.93)
  }
  for (const match of text.matchAll(IBAN)) {
    if (match.index == null || !match.groups?.iban) continue
    const value = match.groups.iban.toUpperCase()
    push('iban', value, match.index, match.index + value.length, 0.94)
  }

  return hits

  function push(subtype: string, value: string, start: number, end: number, confidence: number) {
    hits.push({
      localId: makeLocalHitId(docId, page, 'identifier', start, value),
      entityKey: makeEntityKey('identifier', subtype, value),
      kind: 'identifier',
      subtype,
      label: value,
      properties: { [subtype]: value },
      confidence,
      snippet: makeSnippet(text, start, end - start),
      box: bboxForSubstring(tokens, start, end - start),
      propertyKeys: [subtype],
      start,
      end,
    })
  }
}
