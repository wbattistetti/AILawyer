/**
 * Test del calcolo progresso per le tab di estrazione.
 */

import { describe, expect, it } from 'vitest'
import { computeExtractionTabProgress } from './extract-progress'

describe('computeExtractionTabProgress', () => {
  it('usa le pagine quando disponibili', () => {
    const progress = computeExtractionTabProgress({
      docsDone: 1,
      docsTotal: 4,
      pagesDone: 5,
      pagesTotal: 20,
      currentTitle: 'verbale.pdf',
    })
    expect(progress.pct).toBe(25)
    expect(progress.label).toContain('pag. 5/20')
    expect(progress.label).toContain('verbale.pdf')
  })

  it('usa i documenti se le pagine non ci sono', () => {
    const progress = computeExtractionTabProgress({
      docsDone: 2,
      docsTotal: 5,
      phaseLabel: 'Entità',
    })
    expect(progress.pct).toBe(40)
    expect(progress.label).toBe('Entità doc. 2/5')
  })
})
