import type { Token } from './types'

export function buildPageText(tokens: Token[]) {
  const parts: string[] = []
  const map: number[] = [] // char index -> token index
  tokens.forEach((t, idx) => {
    const s = t.text || ''
    for (let i = 0; i < s.length; i++) map.push(idx)
    parts.push(s)
    map.push(-1) // virtual space
  })
  return { text: parts.join(' '), map }
}

export function spanToBox(tokens: Token[], span: { start: number; end: number }, map: number[]) {
  const safeIdx = (i: number) => Math.max(0, Math.min(i, map.length - 1))
  const i0 = Math.max(0, Math.min(map[safeIdx(span.start)] ?? 0, tokens.length - 1))
  const i1 = Math.max(0, Math.min(map[safeIdx(Math.max(span.end - 1, 0))] ?? i0, tokens.length - 1))
  const a = tokens[Math.min(i0, i1)], b = tokens[Math.max(i0, i1)]
  return a && b
    ? {
        x0Pct: Math.min(a.x0Pct, b.x0Pct),
        x1Pct: Math.max(a.x1Pct, b.x1Pct),
        y0Pct: Math.min(a.y0Pct, b.y0Pct),
        y1Pct: Math.max(a.y1Pct, b.y1Pct),
      }
    : undefined
}



