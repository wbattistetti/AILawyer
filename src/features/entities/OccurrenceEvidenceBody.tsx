/**
 * Rappresentazione unica di una fonte: testo nativo evidenziato oppure scansione.
 */

import type { BoxPct } from './entity-index'
import { splitHighlightedSnippet } from './highlight-snippet'
import { isUsableOccurrenceBox } from './occurrence-box'
import { PdfOccurrenceCrop } from './PdfOccurrenceCrop'
import { SNIPPET_LINES } from './snippet-line-context'

type OccurrenceEvidenceBodyProps = {
  snippet: string
  highlightTerms: string[]
  scanned: boolean
  pdfUrl?: string
  page: number
  box: BoxPct
  /** Righe di contesto sopra il match per il ritaglio scansione. */
  linesBefore?: number
  /** Righe di contesto sotto il match per il ritaglio scansione. */
  linesAfter?: number
}

/** Mostra una sola fonte coerente con la natura del documento. */
export function OccurrenceEvidenceBody({
  snippet,
  highlightTerms,
  scanned,
  pdfUrl,
  page,
  box,
  linesBefore = SNIPPET_LINES.collapsedBefore,
  linesAfter = SNIPPET_LINES.collapsedAfter,
}: OccurrenceEvidenceBodyProps) {
  if (scanned && pdfUrl && isUsableOccurrenceBox(box)) {
    return (
      <PdfOccurrenceCrop
        url={pdfUrl}
        page={page}
        box={box}
        linesBefore={linesBefore}
        linesAfter={linesAfter}
      />
    )
  }

  const parts = splitHighlightedSnippet(
    snippet?.trim() || 'Frammento testuale non disponibile.',
    highlightTerms
  )
  return (
    <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-blue-200 pl-2 text-xs leading-relaxed text-neutral-700">
      {parts.map((part, index) =>
        part.highlighted ? (
          <mark
            key={`${index}:${part.text}`}
            className="rounded bg-yellow-200 px-0.5 text-inherit"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${index}:${part.text}`}>{part.text}</span>
        )
      )}
    </blockquote>
  )
}
