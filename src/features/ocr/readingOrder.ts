export type OcrWord = {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  block?: number
  par?: number
  line?: number
  conf?: number
}

export type BuiltText = {
  tokens: Array<{ txt: string; w: OcrWord; blockIdx: number; lineIdx: number }>
  joined: string
  charToTok: number[]
  width: number
  height: number
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’'`´]/g, "'")
    .toLowerCase()

export function buildReadingText(words: OcrWord[], width: number, height: number): BuiltText {
  const ws = (words || []).map((w) => ({
    text: String(w.text || ''),
    x0: Number((w as any).x0 || 0),
    y0: Number((w as any).y0 || 0),
    x1: Number((w as any).x1 || 0),
    y1: Number((w as any).y1 || 0),
    block: Number((w as any).block ?? 0),
    par: Number((w as any).par ?? 0),
    line: Number((w as any).line ?? 0),
    conf: Number((w as any).conf ?? 0),
  }))

  type LineAgg = { y0: number; y1: number; words: typeof ws }
  const blocks = new Map<number, { x0: number; y0: number; lines: Map<string, LineAgg> }>()

  for (const w of ws) {
    if (!blocks.has(w.block)) blocks.set(w.block!, { x0: w.x0, y0: w.y0, lines: new Map() })
    const B = blocks.get(w.block!)!
    B.x0 = Math.min(B.x0, w.x0)
    B.y0 = Math.min(B.y0, w.y0)
    const key = `${w.block}-${w.par}-${w.line}`
    if (!B.lines.has(key)) B.lines.set(key, { y0: w.y0, y1: w.y1, words: [] })
    const L = B.lines.get(key)!
    L.y0 = Math.min(L.y0, w.y0)
    L.y1 = Math.max(L.y1, w.y1)
    L.words.push(w)
  }

  const orderedBlocks = Array.from(blocks.values()).sort(
    (a, b) => a.x0 - b.x0 || a.y0 - b.y0
  )

  const tokens: BuiltText['tokens'] = []
  orderedBlocks.forEach((B, bi) => {
    const lines = Array.from(B.lines.values()).sort((l1, l2) => l1.y0 - l2.y0)
    lines.forEach((L, li) => {
      L.words.sort((a, b) => a.x0 - b.x0)
      L.words.forEach((w) => tokens.push({ txt: String(w.text || ''), w, blockIdx: bi, lineIdx: li }))
    })
  })

  const tokensClean = tokens
    .map((t) => t.txt.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const joined = normalize(tokensClean.join(' '))
  const charToTok: number[] = []
  {
    let ci = 0
    let ti = 0
    for (let i = 0; i < tokensClean.length; i++) {
      const s = normalize(tokensClean[i])
      for (let k = 0; k < s.length; k++) charToTok[ci++] = ti
      if (i < tokensClean.length - 1) {
        charToTok[ci] = ti
        ci++
      }
      ti++
    }
  }

  return { tokens, joined, charToTok, width, height }
}

export function matchInBuilt(b: BuiltText, query: string) {
  const out: Array<{
    wStart: number
    wEnd: number
    x0Pct: number
    y0Pct: number
    x1Pct: number
    y1Pct: number
    snippet: string
  }> = []
  let pos = 0
  const needle = normalize(query || '')
  while (true) {
    const idx = b.joined.indexOf(needle, pos)
    if (idx < 0) break
    const start = idx
    const end = idx + needle.length
    const tStart = Math.max(0, b.charToTok[start] ?? 0)
    const tEnd = Math.min(b.tokens.length - 1, b.charToTok[end - 1] ?? b.tokens.length - 1)

    let l = Infinity,
      t = Infinity,
      r = -Infinity,
      bm = -Infinity
    for (let ti = tStart; ti <= tEnd; ti++) {
      const w = b.tokens[ti].w as any
      l = Math.min(l, w.x0)
      t = Math.min(t, w.y0)
      r = Math.max(r, w.x1)
      bm = Math.max(bm, w.y1)
    }
    const maxCoord = Math.max(
      ...b.tokens.slice(tStart, tEnd + 1).map((tt) => Math.max((tt.w as any).x1, (tt.w as any).y1))
    )
    const pct = (v: number, dim: number) => Math.max(0, Math.min(1, v / Math.max(1, dim)))
    const x0Pct = maxCoord <= 1.5 ? Math.max(0, Math.min(1, l)) : pct(l, b.width)
    const x1Pct = maxCoord <= 1.5 ? Math.max(0, Math.min(1, r)) : pct(r, b.width)
    const y0Pct = maxCoord <= 1.5 ? Math.max(0, Math.min(1, t)) : pct(t, b.height)
    const y1Pct = maxCoord <= 1.5 ? Math.max(0, Math.min(1, bm)) : pct(bm, b.height)

    const startBlock = b.tokens[tStart].blockIdx
    const startLine = b.tokens[tStart].lineIdx
    const allowed: string[] = []
    for (let ti = tStart; ti < b.tokens.length && allowed.length < 18; ti++) {
      const tk = b.tokens[ti]
      if (tk.blockIdx !== startBlock) break
      if (tk.lineIdx > startLine + 2) break
      allowed.push(String(tk.txt || '').trim())
    }
    let snippet = allowed.join(' ').replace(/\s+/g, ' ').trim()
    if (snippet.length > 180) snippet = snippet.slice(0, 180).trim() + '…'

    out.push({ wStart: tStart, wEnd: tEnd, x0Pct, y0Pct, x1Pct, y1Pct, snippet })
    pos = end
  }
  return out
}


