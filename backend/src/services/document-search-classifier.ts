/**
 * Classifica i documenti della pratica per la ricerca globale.
 * Solo i PDF scansionati senza testo generano una diagnostica OCR.
 */

export type SearchDocumentRole = 'searchable' | 'ocr-required' | 'ignored'
export type SearchDocumentKind = 'pdf' | 'docx' | 'other'

export interface SearchDocumentMetadata {
  id: string
  filename: string
  mime: string
  hasNativeText: boolean
  ocrStatus: string
  ocrText: string | null
}

export interface ClassifiedSearchDocument {
  kind: SearchDocumentKind
  role: SearchDocumentRole
}

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Determina tipo e trattamento di un documento nella ricerca globale. */
export function classifyDocumentForSearch(
  document: SearchDocumentMetadata
): ClassifiedSearchDocument {
  if (!document?.id?.trim() || !document.filename?.trim()) {
    throw new Error('classifyDocumentForSearch: documento senza id o filename')
  }

  const filename = document.filename.trim().toLowerCase()
  const mime = document.mime.trim().toLowerCase()
  const isPdf = mime === PDF_MIME || filename.endsWith('.pdf')
  const isDocx = mime === DOCX_MIME || filename.endsWith('.docx')

  if (isDocx) return { kind: 'docx', role: 'searchable' }
  if (!isPdf) return { kind: 'other', role: 'ignored' }

  const hasOcrText = Boolean(document.ocrText?.trim())
  if (hasOcrText || document.hasNativeText) {
    return { kind: 'pdf', role: 'searchable' }
  }
  return { kind: 'pdf', role: 'ocr-required' }
}
