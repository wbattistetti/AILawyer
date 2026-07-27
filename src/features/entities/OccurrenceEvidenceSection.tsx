/**
 * Sezione espandibile delle fonti documentali associate a una persona.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileSearch } from 'lucide-react'
import type { OccurrenceRecord } from './entity-index'
import { OccurrenceEvidenceCard } from './OccurrenceEvidenceCard'

type OccurrenceEvidenceSectionProps = {
  occurrences: OccurrenceRecord[]
  onOpenOccurrence?: (occurrence: OccurrenceRecord) => void
  getPdfUrl?: (occurrence: OccurrenceRecord) => string | undefined
  isScanned?: (occurrence: OccurrenceRecord) => boolean
  highlightTerms?: string[]
}

const INITIAL_VISIBLE_COUNT = 5

/** Elenca i riscontri; aperta di default, chiudibile dall'utente. */
export function OccurrenceEvidenceSection({
  occurrences,
  onOpenOccurrence,
  getPdfUrl,
  isScanned,
  highlightTerms = [],
}: OccurrenceEvidenceSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const sorted = useMemo(
    () => [...occurrences].sort((left, right) =>
      left.docTitle.localeCompare(right.docTitle) || left.page - right.page
    ),
    [occurrences]
  )
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_VISIBLE_COUNT)

  return (
    <section className="mt-3 border-t border-neutral-200 pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-sm font-medium hover:bg-neutral-100"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-neutral-500" />
          : <ChevronRight className="h-4 w-4 text-neutral-500" />}
        <FileSearch className="h-4 w-4 text-blue-600" />
        <span>Fonti e riscontri</span>
        <span className="ml-auto text-xs font-normal text-neutral-500">{occurrences.length}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {visible.length === 0 && (
            <div className="rounded border border-dashed p-3 text-xs text-neutral-500">
              Nessun frammento documentale disponibile.
            </div>
          )}
          {visible.map(occurrence => (
            <OccurrenceEvidenceCard
              key={occurrence.id}
              docTitle={occurrence.docTitle}
              page={occurrence.page}
              snippet={occurrence.snippet}
              highlightTerms={highlightTerms}
              scanned={isScanned?.(occurrence) ?? false}
              pdfUrl={getPdfUrl?.(occurrence)}
              box={occurrence.box}
              onOpen={onOpenOccurrence ? () => onOpenOccurrence(occurrence) : undefined}
            />
          ))}
          {!showAll && sorted.length > INITIAL_VISIBLE_COUNT && (
            <button
              type="button"
              className="w-full rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs hover:bg-neutral-50"
              onClick={() => setShowAll(true)}
            >
              Mostra altri {sorted.length - INITIAL_VISIBLE_COUNT} riscontri
            </button>
          )}
        </div>
      )}
    </section>
  )
}
