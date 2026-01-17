/**
 * ✅ Utility comuni per determinare il tipo di viewer da usare
 */

import { Documento } from '../../../../types'

/**
 * Determina se un documento è un file Word
 */
export function isWordDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  return (
    filename.endsWith('.docx') ||
    filename.endsWith('.doc') ||
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  )
}

/**
 * Determina se un documento è un PDF
 */
export function isPdfDocument(doc: Documento | { filename: string; mime?: string }): boolean {
  const filename = doc.filename.toLowerCase()
  const mime = doc.mime?.toLowerCase() || ''

  return (
    filename.endsWith('.pdf') ||
    mime === 'application/pdf'
  )
}
