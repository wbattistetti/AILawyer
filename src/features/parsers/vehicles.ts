import type { DetectFn, ThingOut } from './types'
import { buildPageText, spanToBox } from './util'

const TARGA_NEW = /\b[A-Z]{2}\d{3}[A-Z]{2}\b/g
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/g
const MK = ['fiat','alfa romeo','lancia','ferrari','maserati','lamborghini','pagani','audi','bmw','mercedes','volkswagen',
            'volvo','peugeot','citroen','renault','toyota','lexus','nissan','honda','kia','hyundai','ford','opel','seat','skoda']

export const detectVehicles: DetectFn = ({ page, tokens }) => {
  const { text, map } = buildPageText(tokens)
  const out: ThingOut[] = []

  for (const m of text.matchAll(TARGA_NEW)) push('Targa','PLATE', m)
  for (const m of text.matchAll(VIN))       push('Telaio (VIN)','VIN', m)

  const low = text.toLowerCase()
  MK.forEach(mk => {
    let i = low.indexOf(mk)
    while (i >= 0) {
      const span = { start: i, end: i + mk.length }
      out.push({ id: `mk_${page}_${i}`, kind: 'vehicle', label: 'Marca', value: text.substr(i, mk.length), page, span, box: spanToBox(tokens, span, map), meta: { type: 'MAKE' } })
      i = low.indexOf(mk, i + mk.length)
    }
  })

  return out.filter(x => {
    if (x.meta?.type !== 'PLATE') return true
    const ctx = text.slice(Math.max(0, x.span!.start - 12), x.span!.end + 12).toLowerCase()
    return /\b(targa|auto|veicolo|motoveicolo|autovettura|moto)\b/.test(ctx) || true
  })

  function push(label: string, type: string, m: RegExpMatchArray) {
    const span = { start: m.index!, end: m.index! + m[0].length }
    out.push({ id: `${type.toLowerCase()}_${page}_${m.index}`, kind: 'vehicle', label, value: m[0], page, span, box: spanToBox(tokens, span, map), meta: { type } })
  }
}



