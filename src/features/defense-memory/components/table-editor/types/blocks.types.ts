/**
 * Types per il sistema di blocchi riorganizzabili nelle card
 * Step 1: Struttura dati base
 */

import { CellType } from './table.types'

/**
 * Dati di un estratto copiato dal document viewer
 */
export interface ExtractData {
  id: string
  content: string                    // Testo estratto
  imageDataUrl?: string              // Immagine ritagliata (base64) se da PDF OCR
  source: string                     // Nome documento sorgente
  page: number                       // Pagina nel documento
  bbox: {                            // Posizione nel documento
    x0Pct: number
    y0Pct: number
    x1Pct: number
    y1Pct: number
  }
  createdAt: Date                    // Data/ora creazione
}

/**
 * Tipo di blocco nella card
 */
export type BlockType = 'extract' | 'observation'

/**
 * Blocco estratto (non editabile - snip del documento)
 */
export interface ExtractBlock {
  type: 'extract'
  id: string
  order: number                      // Ordine nella lista (per riorganizzazione)
  extract: ExtractData               // Dati dell'estratto
}

/**
 * Blocco osservazione (campo testo editabile)
 */
export interface ObservationBlock {
  type: 'observation'
  id: string
  order: number                      // Ordine nella lista
  title: string                      // Titolo editabile (es. "Osservazione", "Osservazione generale")
  content: string                    // Testo editabile
}

/**
 * Unione dei tipi di blocco
 */
export type Block = ExtractBlock | ObservationBlock

/**
 * Template di default per un tipo di card
 */
export interface CardTemplate {
  cellType: CellType
  defaultBlocks: BlockTemplate[]
}

/**
 * Template per un singolo blocco
 */
export interface BlockTemplate {
  type: BlockType
  title?: string                     // Per observation: titolo di default
  placeholder?: string                // Placeholder per textarea
}

/**
 * Props per ExtractDrawer (cassetto estratti)
 */
export interface ExtractDrawerProps {
  extracts: ExtractData[]
  onExtractAdd: (extract: ExtractData) => void
  onExtractRemove: (extractId: string) => void
  onExtractReorder?: (fromIndex: number, toIndex: number) => void
  className?: string
}

/**
 * Props per CardBody (corpo standard delle card)
 */
export interface CardBodyProps {
  blocks: Block[]
  onBlocksChange: (blocks: Block[]) => void
  onExtractDrop?: (extract: ExtractData, insertIndex?: number) => void
  readOnly?: boolean
  className?: string
}

/**
 * Props per ExtractBlock component
 */
export interface ExtractBlockProps {
  block: ExtractBlock
  onRemove?: () => void
  onDragStart?: (e: React.DragEvent) => void
  readOnly?: boolean
}

/**
 * Props per ObservationBlock component
 */
export interface ObservationBlockProps {
  block: ObservationBlock
  onUpdate: (block: ObservationBlock) => void
  onRemove?: () => void
  onDragStart?: (e: React.DragEvent) => void
  readOnly?: boolean
}
