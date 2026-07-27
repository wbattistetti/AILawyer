/**
 * Suddivide un frammento testuale nelle parti normali/evidenziate.
 */

export type HighlightedSnippetPart = {
  text: string
  highlighted: boolean
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Evidenzia tutte le occorrenze dei termini, privilegiando quelli più lunghi.
 */
export function splitHighlightedSnippet(
  snippet: string,
  terms: string[]
): HighlightedSnippetPart[] {
  if (!snippet) return []
  const normalizedTerms = [...new Set(
    terms.map(term => term.trim()).filter(term => term.length >= 2)
  )].sort((left, right) => right.length - left.length)
  if (normalizedTerms.length === 0) {
    return [{ text: snippet, highlighted: false }]
  }

  const matcher = new RegExp(
    `(${normalizedTerms.map(escapeRegExp).join('|')})`,
    'giu'
  )
  return snippet
    .split(matcher)
    .filter(Boolean)
    .map(part => ({
      text: part,
      highlighted: normalizedTerms.some(
        term => term.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0
      ),
    }))
}
