import type { DetectFn, ThingOut } from './types'
import { buildPageText, spanToBox } from './util'

const RG = /\b(?:N\.?\s?R\.?\s?G\.?|R\.?\s?G\.?)\s?\d+\/\d{2,4}\b/gi
const PROC = /\bproc\.?\s?pen\.?\s?\d+\/\d{2,4}\b/gi

export const detectDocrefs: DetectFn = ({ page, tokens }) => {
  const { text, map } = buildPageText(tokens)
  const out: ThingOut[] = []
  for (const m of text.matchAll(RG)) push('Riferimento RG','DOCREF', m)
  for (const m of text.matchAll(PROC)) push('Procedimento','DOCREF', m)
  return out

  function push(label: string, type: string, m: RegExpMatchArray) {
    const span = { start: m.index!, end: m.index! + m[0].length }
    out.push({ id: `doc_${page}_${m.index}`, kind: 'docref', label, value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type } })
  }
}



