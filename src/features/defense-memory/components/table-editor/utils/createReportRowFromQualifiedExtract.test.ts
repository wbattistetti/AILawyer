/**
 * Test per createReportRowFromQualifiedExtract.
 */

import { describe, it, expect } from 'vitest'
import { createReportRowFromQualifiedExtract } from './createReportRowFromQualifiedExtract'
import { ExtractData } from '../types/blocks.types'

function makeExtract(overrides: Partial<ExtractData> = {}): ExtractData {
  return {
    id: 'extract_1',
    content: 'Testo estratto',
    source: 'Arresto Di Nardo.pdf',
    page: 1,
    bbox: { x0Pct: 0.1, y0Pct: 0.2, x1Pct: 0.8, y1Pct: 0.4 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    title: 'Titolo estratto',
    ...overrides,
  }
}

describe('createReportRowFromQualifiedExtract', () => {
  it('builds a report row with cellType, description and extract block', () => {
    const extract = makeExtract()
    const row = createReportRowFromQualifiedExtract({
      extract,
      cellType: 'elementi-prova',
      description: 'Informativa di reato',
      contestationDate: '2024-05-10',
    })

    expect(row.cellType).toBe('elementi-prova')
    expect(row.description).toBe('Informativa di reato')
    expect(row.contestationDate).toBe('2024-05-10')
    expect(row.observations).toBe('')
    expect(row.blocks).toHaveLength(1)
    expect(row.blocks?.[0]).toMatchObject({
      type: 'extract',
      order: 0,
      title: 'Titolo estratto',
      extract: {
        id: 'extract_1',
        content: 'Testo estratto',
        source: 'Arresto Di Nardo.pdf',
        page: 1,
      },
    })
  })

  it('trims description and omits qualification fields from nested extract', () => {
    const extract = makeExtract({
      cellType: 'atto',
      rowDescription: 'should not stay on nested extract',
      contestationDate: '2020-01-01',
    })
    const row = createReportRowFromQualifiedExtract({
      extract,
      cellType: 'atto',
      description: '  Decreto  ',
    })

    expect(row.description).toBe('Decreto')
    const nested = row.blocks?.[0]
    expect(nested?.type).toBe('extract')
    if (nested?.type === 'extract') {
      expect(nested.extract.cellType).toBeUndefined()
      expect(nested.extract.rowDescription).toBeUndefined()
    }
  })

  it('fails early when cellType is missing', () => {
    expect(() =>
      createReportRowFromQualifiedExtract({
        extract: makeExtract(),
        cellType: undefined as unknown as never,
        description: 'x',
      })
    ).toThrow(/cellType is required/)
  })
})
