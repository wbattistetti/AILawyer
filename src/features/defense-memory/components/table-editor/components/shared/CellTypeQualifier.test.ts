/**
 * Test per canAddQualifiedExtractToReport.
 */

import { describe, it, expect } from 'vitest'
import { canAddQualifiedExtractToReport } from './CellTypeQualifier'

describe('canAddQualifiedExtractToReport', () => {
  it('returns false without cellType', () => {
    expect(
      canAddQualifiedExtractToReport({ description: 'solo testo' })
    ).toBe(false)
  })

  it('returns true when cellType is set (description optional)', () => {
    expect(
      canAddQualifiedExtractToReport({
        cellType: 'nota-libera',
        description: '',
      })
    ).toBe(true)
  })
})
