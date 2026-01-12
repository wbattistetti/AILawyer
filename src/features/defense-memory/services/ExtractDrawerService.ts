/**
 * Servizio per gestire gli estratti nel cassetto
 * Step 2: Logica di business separata
 */

import { ExtractData } from '../components/table-editor/types/blocks.types'
import { extractClipboardManager, ExtractClipboardData } from '@/utils/extractClipboard'

/**
 * Converte ExtractClipboardData in ExtractData
 */
export function convertClipboardToExtract(clipboardData: ExtractClipboardData): ExtractData {
  return {
    id: `extract_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    content: clipboardData.content,
    imageDataUrl: clipboardData.imageDataUrl,
    source: clipboardData.source,
    page: clipboardData.page,
    bbox: clipboardData.bbox,
    createdAt: new Date()
  }
}

/**
 * Aggiunge un estratto dalla clipboard al cassetto
 */
export function addExtractFromClipboard(
  extracts: ExtractData[],
  onAdd: (extract: ExtractData) => void
): boolean {
  const clipboardData = extractClipboardManager.paste()
  if (!clipboardData) {
    console.warn('[ExtractDrawerService] Nessun estratto nella clipboard')
    return false
  }

  const extract = convertClipboardToExtract(clipboardData)
  onAdd(extract)
  extractClipboardManager.clear()

  console.log('[ExtractDrawerService] Estratto aggiunto al cassetto:', extract.id)
  return true
}

/**
 * Riordina gli estratti nel cassetto
 */
export function reorderExtracts(
  extracts: ExtractData[],
  fromIndex: number,
  toIndex: number
): ExtractData[] {
  if (fromIndex === toIndex) return extracts

  const newExtracts = [...extracts]
  const [moved] = newExtracts.splice(fromIndex, 1)
  newExtracts.splice(toIndex, 0, moved)

  console.log('[ExtractDrawerService] Estratti riordinati:', { fromIndex, toIndex })
  return newExtracts
}
