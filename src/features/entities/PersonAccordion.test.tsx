/**
 * Verifica l'apertura indipendente delle schede e dei relativi riscontri.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OccurrenceEvidenceSection } from './OccurrenceEvidenceSection'
import { togglePersonExpansion } from './PersonAccordion'
import type { OccurrenceRecord } from './entity-index'

const occurrence = (id: string, personKey: string, snippet: string): OccurrenceRecord => ({
  id,
  personKey,
  docId: 'doc-1',
  docTitle: 'Atto.pdf',
  page: 1,
  snippet,
  box: { x0Pct: 0.1, x1Pct: 0.2, y0Pct: 0.3, y1Pct: 0.4 },
  createdAt: 1,
})

describe('PersonAccordion', () => {
  it('mantiene aperti più identificativi in modo indipendente', () => {
    let open = togglePersonExpansion(new Set(), 'p1')
    open = togglePersonExpansion(open, 'p2')
    expect(Array.from(open)).toEqual(['p1', 'p2'])

    open = togglePersonExpansion(open, 'p1')
    expect(Array.from(open)).toEqual(['p2'])
  })

  it('renderizza Fonti e riscontri aperta per impostazione predefinita', () => {
    const html = renderToStaticMarkup(
      <OccurrenceEvidenceSection
        occurrences={[occurrence('o1', 'p1', 'Mario Rossi nato a Roma')]}
        onOpenOccurrence={() => undefined}
      />
    )
    expect(html).toContain('Fonti e riscontri')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Mario Rossi nato a Roma')
    expect(html).toContain('Apri documento')
  })

  it('mostra Espandi frammento solo se il contesto supera 2+2', () => {
    const rich = Array.from({ length: 9 }, (_, index) => `riga ${index}`).join('\n')
      .replace('riga 4', 'riga 4 Mario Rossi')
    const html = renderToStaticMarkup(
      <OccurrenceEvidenceSection
        occurrences={[occurrence('o1', 'p1', rich)]}
        highlightTerms={['Mario Rossi']}
      />
    )
    expect(html).toContain('Espandi frammento')
    expect(html).toContain('riga 2')
    expect(html).toContain('riga 6')
    expect(html).not.toContain('riga 0')
  })
})
