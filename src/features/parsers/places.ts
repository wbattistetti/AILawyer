import type { DetectFn, ThingOut } from './types'
import { buildPageText, spanToBox } from './util'

const ROAD = /\b(?:via|viale|v\.le|corso|c\.so|piazza|p\.zza|piazzale|largo|vicolo|vico|strada|ss\s?\d+|sp\s?\d+|località|loc\.)\b/gi
const CAP = /\b\d{5}\b/g
const PROV = /\([A-Z]{2}\)/g
const INSTITUTIONS = [
  'pubblico ministero','procura della repubblica','direzione distrettuale antimafia','guardia di finanza',
  'carabinieri','questura','tribunale','gip','gup','dia','ros','dda'
]

export const detectPlaces: DetectFn = ({ page, tokens }) => {
  const { text, map } = buildPageText(tokens)
  const out: ThingOut[] = []

  for (const m of text.matchAll(ROAD)) {
    const start = m.index!
    const slice = text.slice(start, start + 120)
    const capIdx = slice.search(/\b\d{5}\b/)
    const provIdx = slice.search(/\([A-Z]{2}\)/)
    const commaIdx = slice.indexOf(',')
    const endRel = Math.max(capIdx >= 0 ? capIdx + 5 : -1, provIdx >= 0 ? provIdx + 4 : -1, commaIdx >= 0 ? commaIdx + 1 : -1)
    const end = start + (endRel > 0 ? endRel : Math.min(80, slice.length))
    const span = { start, end }
    const value = text.slice(start, end).replace(/\s{2,}/g, ' ').trim()
    out.push({ id: `addr_${page}_${start}`, kind: 'place', label: 'Indirizzo', value, page, span, box: spanToBox(tokens, span, map), meta: { type: 'ADDR' } })
  }

  const low = text.toLowerCase()
  for (const key of INSTITUTIONS) {
    let idx = low.indexOf(key)
    while (idx >= 0) {
      const span = { start: idx, end: idx + key.length }
      out.push({ id: `inst_${page}_${idx}`, kind: 'place', label: 'Istituzione', value: text.substr(idx, key.length), page, span, box: spanToBox(tokens, span, map), meta: { type: 'ORG' } })
      idx = low.indexOf(key, idx + key.length)
    }
  }

  for (const m of text.matchAll(CAP)) {
    const span = { start: m.index!, end: m.index! + 5 }
    out.push({ id: `cap_${page}_${m.index}`, kind: 'place', label: 'CAP', value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type: 'CAP' } })
  }
  for (const m of text.matchAll(PROV)) {
    const span = { start: m.index!, end: m.index! + m[0].length }
    out.push({ id: `prov_${page}_${m.index}`, kind: 'place', label: 'Provincia', value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type: 'PROV' } })
  }

  return dedup(out)
}

function dedup(items: ThingOut[]) {
  const k = (x: ThingOut) => `${x.kind}|${x.page}|${x.value}`
  const map = new Map<string, ThingOut>()
  for (const it of items) if (!map.has(k(it))) map.set(k(it), it)
  return Array.from(map.values())
}



