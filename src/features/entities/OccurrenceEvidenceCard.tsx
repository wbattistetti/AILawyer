/**
 * Card unica di una fonte documentale: header azioni + frammento contestuale.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { BoxPct } from './entity-index'
import { OccurrenceEvidenceBody } from './OccurrenceEvidenceBody'
import {
  SNIPPET_LINES,
  windowSnippetLines,
} from './snippet-line-context'

export type OccurrenceEvidenceCardProps = {
  docTitle: string
  page: number
  snippet: string
  highlightTerms: string[]
  scanned: boolean
  pdfUrl?: string
  box: BoxPct
  onOpen?: () => void
}

/** Una fonte con toggle frammento (2+2 / 5+5) e Apri documento dopo il nome. */
export function OccurrenceEvidenceCard({
  docTitle,
  page,
  snippet,
  highlightTerms,
  scanned,
  pdfUrl,
  box,
  onOpen,
}: OccurrenceEvidenceCardProps) {
  const [fragmentExpanded, setFragmentExpanded] = useState(false)

  const windowed = useMemo(
    () => windowSnippetLines(snippet, {
      linesBefore: fragmentExpanded
        ? SNIPPET_LINES.expandedBefore
        : SNIPPET_LINES.collapsedBefore,
      linesAfter: fragmentExpanded
        ? SNIPPET_LINES.expandedAfter
        : SNIPPET_LINES.collapsedAfter,
      highlightTerms,
    }),
    [fragmentExpanded, highlightTerms, snippet]
  )

  const linesBefore = fragmentExpanded
    ? SNIPPET_LINES.expandedBefore
    : SNIPPET_LINES.collapsedBefore
  const linesAfter = fragmentExpanded
    ? SNIPPET_LINES.expandedAfter
    : SNIPPET_LINES.collapsedAfter

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="max-w-[14rem] truncate text-xs font-medium" title={docTitle}>
            {docTitle}
          </span>
          {windowed.canExpand && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
              onClick={() => setFragmentExpanded(value => !value)}
              aria-expanded={fragmentExpanded}
            >
              {fragmentExpanded
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
              {fragmentExpanded ? 'Riduci frammento' : 'Espandi frammento'}
            </button>
          )}
          {onOpen && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-50"
              onClick={onOpen}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Apri documento
            </button>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-500">Pagina {page}</div>
      </div>

      <OccurrenceEvidenceBody
        snippet={windowed.text || snippet}
        highlightTerms={highlightTerms}
        scanned={scanned}
        pdfUrl={pdfUrl}
        page={page}
        box={box}
        linesBefore={linesBefore}
        linesAfter={linesAfter}
      />
    </article>
  )
}
