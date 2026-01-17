/**
 * ✅ Interfacce comuni per tutti i viewer (PDF, Word, etc.)
 */

export interface ViewerHandle {
  zoomTo: (scale: number) => void
  jumpToPage: (page: number) => void
  getCurrentPage: () => number
  getTotalPages: () => number
  getCurrentScale: () => number
}

export interface ViewportBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PdfBbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ViewerSelection {
  pageNumber: number
  viewportBox: ViewportBox
  text?: string
  bboxPdf?: PdfBbox
}

export interface ViewerExtract {
  pageNumber: number
  text: string
  imageDataUrl?: string  // Screenshot per Word o documenti OCR
  viewportBox: ViewportBox
  bboxPdf?: PdfBbox
  source?: string
}

export type ViewerType = 'pdf' | 'word'

export interface ViewerShellProps {
  fileUrl: string
  page?: number
  onPageChange?: (page: number) => void
  hideToolbar?: boolean
  docId?: string
  praticaId?: string
  docName?: string
  hasNativeText?: boolean
  /**
   * ✅ Se il viewer è attualmente attivo (visibile/focus)
   * Deve essere passato dal componente padre (es. da DockWorkspace)
   */
  isActive?: boolean
}

export interface ViewerCoreProps {
  fileUrl: string
  page?: number
  onPageChange?: (page: number) => void
  docId?: string
  hostRef: React.RefObject<HTMLDivElement>
  onDocumentLoad?: (totalPages: number) => void
  onZoom?: (scale: number) => void
}
