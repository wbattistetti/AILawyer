/**
 * Test dei confini tra persone in testi legali/OCR.
 */

import { describe, expect, it } from 'vitest'
import {
  boundPersonContext,
  normalizePersonContextText,
} from './person-context-segmenter'

describe('person-context-segmenter', () => {
  it('si ferma prima del nominativo successivo senza richiedere punto e virgola', () => {
    const context = boundPersonContext(
      'a Roma il 10.01.1985 residente in Latina in via Verdi nr.10. ' +
      'Luca Bianchi nato a Milano il 11.02.1986 ivi res. in via Blu nr.2'
    )

    expect(context).toContain('via Verdi nr.10')
    expect(context).not.toContain('Luca Bianchi')
    expect(context).not.toContain('via Blu')
  })

  it('supporta cognomi composti e nomi in maiuscolo', () => {
    const context = boundPersonContext(
      'residente in via Uno nr.1, DI SANTO UGO EMILIO, nato a Napoli il 01.01.1980'
    )
    expect(context).toBe('residente in via Uno nr.1')
  })

  it('normalizza il marker OCR incollato natoa', () => {
    expect(normalizePersonContextText('Mario Rossi natoa Roma')).toBe(
      'Mario Rossi nato a Roma'
    )
  })
})

