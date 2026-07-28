/**
 * Costruisce una riga del Riporto generale a partire da un estratto qualificato.
 */

import { CellType, TableRow } from '../types/table.types'
import { ExtractBlock, ExtractData } from '../types/blocks.types'

export interface QualifiedExtractInput {
  extract: ExtractData
  cellType: CellType
  description: string
  contestationDate?: string
  eventDate?: string
}

/**
 * Converte un estratto tipizzato in payload per addRow (senza id/order).
 * L'estratto diventa il primo blocco della nuova riga.
 */
export function createReportRowFromQualifiedExtract(
  input: QualifiedExtractInput
): Omit<TableRow, 'id' | 'order'> {
  const { extract, cellType, description, contestationDate, eventDate } = input

  if (!cellType) {
    throw new Error(
      'createReportRowFromQualifiedExtract: cellType is required to add an extract to the Riporto'
    )
  }

  const extractBlock: ExtractBlock = {
    type: 'extract',
    id: `extract_block_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    order: 0,
    extract: {
      id: extract.id,
      content: extract.content,
      imageDataUrl: extract.imageDataUrl,
      source: extract.source,
      page: extract.page,
      bbox: extract.bbox,
      createdAt: extract.createdAt,
    },
    title: extract.title,
    observation: extract.observation,
    hasObservation: extract.hasObservation,
    collapsed: extract.collapsed,
  }

  return {
    cellType,
    description: description.trim(),
    contestationDate,
    eventDate,
    observations: '',
    blocks: [extractBlock],
  }
}
