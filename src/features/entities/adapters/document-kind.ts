/**
 * Classifica i documenti per l’estrazione batch (pdf.js vs mammoth vs non supportato).
 */

import { isPdfDocument, isWordDocument } from '../../../components/viewers/common/utils/viewerUtils'

export type ExtractionDocumentKind = 'pdf' | 'word' | 'unsupported'

/**
 * Restituisce il kind usabile dagli adapter di estrazione.
 * Mammoth supporta solo .docx (OpenXML), non i .doc legacy.
 */
export function resolveExtractionDocumentKind(
  doc: { filename: string; mime?: string }
): ExtractionDocumentKind {
  if (isPdfDocument(doc)) return 'pdf'

  const filename = doc.filename.toLowerCase()
  const mime = (doc.mime || '').toLowerCase()
  const isDocx =
    filename.endsWith('.docx') ||
    mime.includes('wordprocessingml') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  if (isDocx) return 'word'

  if (isWordDocument(doc)) return 'unsupported'

  return 'unsupported'
}

/** Messaggio leggibile per documenti non ammessi dalla pipeline batch. */
export function unsupportedDocumentDetail(doc: { filename: string }): string {
  const kind = resolveExtractionDocumentKind(doc)
  if (kind !== 'unsupported') return ''
  if (doc.filename.toLowerCase().endsWith('.doc')) {
    return 'Formato .doc legacy non supportato (convertire in .docx)'
  }
  return `Formato non supportato per l'estrazione batch: ${doc.filename}`
}
