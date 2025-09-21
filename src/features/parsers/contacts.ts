import type { DetectFn, ThingOut } from './types'
import { buildPageText, spanToBox } from './util'

const EMAIL = /(?<=\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?=\b)/gi
const TEL = /\b(?:\+?39)?\s?(?:0|\(0\))?\d(?:[\s\-]?\d){6,}\b/g

export const detectContacts: DetectFn = ({ page, tokens }) => {
  const { text, map } = buildPageText(tokens)
  const out: ThingOut[] = []
  for (const m of text.matchAll(EMAIL)) {
    const span = { start: m.index!, end: m.index! + m[0].length }
    out.push({ id: `mail_${page}_${m.index}`, kind: 'contact', label: 'Email', value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type: 'EMAIL' } })
  }
  for (const m of text.matchAll(TEL)) {
    const span = { start: m.index!, end: m.index! + m[0].length }
    out.push({ id: `tel_${page}_${m.index}`, kind: 'contact', label: 'Telefono', value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type: 'TEL' } })
  }
  return out
}


