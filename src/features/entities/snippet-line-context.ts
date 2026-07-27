/**
 * Contesto a righe per i frammenti delle fonti: salvataggio ampio e finestra UI.
 */

export const SNIPPET_LINES = {
  /** Contesto mostrato di default nella card fonte. */
  collapsedBefore: 2,
  collapsedAfter: 2,
  /** Contesto massimo salvato / mostrato con “Espandi frammento”. */
  expandedBefore: 5,
  expandedAfter: 5,
} as const

/** Allineato alla validazione delle occorrenze persistite. */
const MAX_SNIPPET_CHARS = 4_000

export type SnippetLineWindow = {
  text: string
  lineCount: number
  canExpand: boolean
  focusLineIndex: number
}

/** Spezza il testo in righe, ignorando righe vuote ai bordi. */
export function splitSnippetLines(snippet: string): string[] {
  return snippet
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index, all) => {
      if (line.trim()) return true
      return index > 0 && index < all.length - 1
    })
}

/** Indice della riga che contiene un termine di evidenziazione, o il centro. */
export function findFocusLineIndex(lines: string[], highlightTerms: string[]): number {
  if (lines.length === 0) return 0
  const terms = highlightTerms
    .map(term => term.trim().toLocaleLowerCase('it-IT'))
    .filter(term => term.length >= 2)
  if (terms.length > 0) {
    const hit = lines.findIndex(line => {
      const lower = line.toLocaleLowerCase('it-IT')
      return terms.some(term => lower.includes(term))
    })
    if (hit >= 0) return hit
  }
  return Math.floor((lines.length - 1) / 2)
}

/**
 * Finestra di contesto intorno alla riga del match.
 * `canExpand` è true se collassando si nasconderebbe almeno una riga.
 */
export function windowSnippetLines(
  snippet: string,
  options: {
    linesBefore: number
    linesAfter: number
    highlightTerms?: string[]
  }
): SnippetLineWindow {
  const lines = splitSnippetLines(snippet)
  if (lines.length === 0) {
    return { text: '', lineCount: 0, canExpand: false, focusLineIndex: 0 }
  }

  const focus = findFocusLineIndex(lines, options.highlightTerms ?? [])
  const start = Math.max(0, focus - options.linesBefore)
  const end = Math.min(lines.length, focus + options.linesAfter + 1)
  const visible = lines.slice(start, end)
  const collapsedStart = Math.max(0, focus - SNIPPET_LINES.collapsedBefore)
  const collapsedEnd = Math.min(lines.length, focus + SNIPPET_LINES.collapsedAfter + 1)
  const canExpand = collapsedStart > 0 || collapsedEnd < lines.length

  return {
    text: visible.join('\n'),
    lineCount: lines.length,
    canExpand,
    focusLineIndex: focus,
  }
}

/**
 * Estrae fino a `linesBefore` / `linesAfter` righe intorno al match.
 * Usa esclusivamente newline reali/ricostruiti dalla geometria: non spezza mai
 * artificialmente la riga che contiene il match.
 */
export function makeLineSnippet(
  text: string,
  start: number,
  length: number,
  linesBefore = SNIPPET_LINES.expandedBefore,
  linesAfter = SNIPPET_LINES.expandedAfter
): string {
  if (typeof text !== 'string') {
    throw new Error('makeLineSnippet: text must be a string')
  }
  if (!Number.isFinite(start) || start < 0) {
    throw new Error('makeLineSnippet: invalid start')
  }
  if (!Number.isFinite(length) || length < 0) {
    throw new Error('makeLineSnippet: invalid length')
  }
  if (!Number.isInteger(linesBefore) || linesBefore < 0) {
    throw new Error('makeLineSnippet: linesBefore must be a non-negative integer')
  }
  if (!Number.isInteger(linesAfter) || linesAfter < 0) {
    throw new Error('makeLineSnippet: linesAfter must be a non-negative integer')
  }

  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
  let offset = 0
  let matchLine = 0
  for (let index = 0; index < lines.length; index++) {
    const lineEnd = offset + lines[index].length
    if (start <= lineEnd) {
      matchLine = index
      break
    }
    offset = lineEnd + 1
    matchLine = index
  }

  const from = Math.max(0, matchLine - linesBefore)
  const to = Math.min(lines.length, matchLine + linesAfter + 1)
  return clampSnippetLines(lines.slice(from, to), matchLine - from, MAX_SNIPPET_CHARS)
}

/** Riduce le righe esterne finché il testo resta sotto `maxChars`. */
export function clampSnippetLines(
  lines: string[],
  focusIndex: number,
  maxChars: number
): string {
  if (lines.length === 0) return ''
  let from = 0
  let to = lines.length
  let focus = Math.min(Math.max(0, focusIndex), lines.length - 1)
  let text = lines.slice(from, to).join('\n').trim()

  while (text.length > maxChars && to - from > 1) {
    const distBefore = focus - from
    const distAfter = to - 1 - focus
    if (distBefore > distAfter && from < focus) {
      from += 1
    } else if (to > focus + 1) {
      to -= 1
    } else if (from < focus) {
      from += 1
    } else {
      break
    }
    text = lines.slice(from, to).join('\n').trim()
  }

  if (text.length <= maxChars) return text

  const focusLine = lines[focus] ?? ''
  if (focusLine.length <= maxChars) return focusLine.trim()
  const half = Math.floor(maxChars / 2)
  return focusLine.slice(0, half).trim() + '…' + focusLine.slice(-half).trim()
}

/** Padding verticale del ritaglio PDF per N righe di contesto (~2.2% pagina / riga). */
export function cropPaddingForLines(lines: number): number {
  if (!Number.isFinite(lines) || lines < 0) {
    throw new Error('cropPaddingForLines: lines must be >= 0')
  }
  return Math.min(0.35, lines * 0.022)
}
