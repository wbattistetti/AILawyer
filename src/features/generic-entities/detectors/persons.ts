/**
 * Detector di menzioni persona incomplete, tipizzate per ambito legale/giudiziario.
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'
import {
  formatPersonLabel,
  parsePersonMentions,
} from './person-mention-parser'

/**
 * Estrae schede persona con titolo nel label e ruolo/sede come proprietà.
 */
export function detectPersonMentions(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectPersonMentions: invalid input')
  }
  const { text, tokens, docId, page } = input
  const hits: PageEntityHit[] = []

  for (const mention of parsePersonMentions(text)) {
    const label = formatPersonLabel(mention.title, mention.fullName)
    const properties: Record<string, string> = {
      fullName: mention.fullName,
    }
    if (mention.title) properties.title = mention.title
    if (mention.role) properties.role = mention.role
    if (mention.office) properties.office = mention.office
    if (mention.eventDate) properties.eventDate = mention.eventDate

    hits.push({
      localId: makeLocalHitId(docId, page, 'person', mention.start, label),
      entityKey: makeEntityKey('person', mention.fullName),
      kind: 'person',
      subtype: mention.role ? 'legal-role' : 'mention',
      label,
      properties,
      confidence: mention.confidence,
      snippet: makeSnippet(text, mention.start, mention.end - mention.start),
      box: bboxForSubstring(tokens, mention.start, Math.max(1, mention.end - mention.start)),
      propertyKeys: Object.keys(properties),
      start: mention.start,
      end: mention.end,
    })
  }

  return hits
}
