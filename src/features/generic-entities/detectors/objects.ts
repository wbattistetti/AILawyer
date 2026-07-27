/**
 * Detector minimale di oggetti materiali citati con eventuale marca.
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import { OBJECT_PATTERN } from '../patterns'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'

/**
 * Estrae oggetti tipizzati (arma, telefono, computer, …) quando il contesto è esplicito.
 */
export function detectObjects(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectObjects: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(OBJECT_PATTERN)) {
    if (match.index == null || !match.groups?.kind) continue
    const kind = match.groups.kind.toLowerCase().replace(/\s+/g, ' ')
    const brand = match.groups.brand?.trim()
    const label = brand ? `${kind} ${brand}` : kind
    const start = match.index
    const end = start + match[0].length
    const dedupe = `${start}:${label}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const properties: Record<string, string> = { objectKind: kind }
    if (brand) properties.brand = brand
    hits.push({
      localId: makeLocalHitId(docId, page, 'object', start, label),
      entityKey: makeEntityKey('object', kind, brand),
      kind: 'object',
      subtype: kind.split(' ')[0],
      label,
      properties,
      confidence: brand ? 0.7 : 0.6,
      snippet: makeSnippet(text, start, end - start),
      box: bboxForSubstring(tokens, start, end - start),
      propertyKeys: Object.keys(properties),
      start,
      end,
    })
  }

  return hits
}
