/**
 * Template di default per ogni tipo di card
 * Step 7: Layout guidato per l'utente
 */

import { CardTemplate, BlockTemplate } from '../components/table-editor/types/blocks.types'
import { CellType } from '../components/table-editor/types/table.types'

/**
 * Template predefiniti per ogni tipo di card
 */
export const DEFAULT_TEMPLATES: Record<CellType, CardTemplate> = {
  'reato-contestato': {
    cellType: 'reato-contestato',
    defaultBlocks: [
      { type: 'extract' },                                    // Slot per estratto
      { type: 'observation', title: 'Osservazione' },         // Osservazione
      { type: 'extract' },                                    // Altro estratto
      { type: 'observation', title: 'Osservazione finale' }  // Osservazione finale
    ]
  },
  'verbale-arresto': {
    cellType: 'verbale-arresto',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione generale' }
    ]
  },
  'verbale-sequestro': {
    cellType: 'verbale-sequestro',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione generale' }
    ]
  },
  'verbale-perquisizione': {
    cellType: 'verbale-perquisizione',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione generale' }
    ]
  },
  'fatto': {
    cellType: 'fatto',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  },
  'atto': {
    cellType: 'atto',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  },
  'elementi-prova': {
    cellType: 'elementi-prova',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  },
  'interrogatorio': {
    cellType: 'interrogatorio',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  },
  'dichiarazioni-testi': {
    cellType: 'dichiarazioni-testi',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  },
  'intercettazioni': {
    cellType: 'intercettazioni',
    defaultBlocks: [
      { type: 'extract' },
      { type: 'observation', title: 'Osservazione' }
    ]
  }
}

/**
 * Crea blocchi iniziali da un template
 */
export function createBlocksFromTemplate(
  template: CardTemplate,
  startOrder: number = 0
): Array<{ type: 'extract' | 'observation'; id: string; order: number; title?: string; content?: string }> {
  return template.defaultBlocks.map((blockTemplate, index) => {
    const baseBlock = {
      id: `${blockTemplate.type}_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`,
      order: startOrder + index
    }

    if (blockTemplate.type === 'observation') {
      return {
        type: 'observation' as const,
        ...baseBlock,
        title: blockTemplate.title || 'Osservazione',
        content: ''
      }
    } else {
      // Per extract, creiamo solo lo slot (l'estratto verrà aggiunto dopo)
      return {
        type: 'extract' as const,
        ...baseBlock
      } as any // ExtractBlock richiede extract, ma per ora è solo uno slot
    }
  })
}

/**
 * Ottieni template per un tipo di card
 */
export function getTemplateForCellType(cellType: CellType): CardTemplate {
  return DEFAULT_TEMPLATES[cellType] || DEFAULT_TEMPLATES['fatto']
}
