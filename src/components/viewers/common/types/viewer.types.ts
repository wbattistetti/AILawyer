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
  type?: 'rectangle' | 'text' // ✅ Tipo di selezione
  pageNumber: number
  viewportBox: ViewportBox
  text?: string
  bboxPdf?: PdfBbox
  /**
   * ✅ Coordinate percentuali rispetto alla pagina (x0Pct, y0Pct, x1Pct, y1Pct)
   * Calcolate automaticamente da useRectSelection
   */
  bbox?: {
    x0Pct: number
    y0Pct: number
    x1Pct: number
    y1Pct: number
  }
}

export interface ViewerExtract {
  pageNumber: number
  text: string
  imageDataUrl?: string  // Screenshot per Word o documenti OCR
  viewportBox: ViewportBox
  bboxPdf?: PdfBbox
  source?: string
}

export type ViewerType = 'pdf' | 'word' | 'image'

/**
 * ✅ Selezione rettangolo standardizzata (identica per tutti i viewer)
 * Emessa da useRectSelection - formato unificato
 */
export interface RectSelection {
  /**
   * Rettangolo in pixel CSS relativi alla pagina del documento
   * (stesso spazio di bbox percentuali e del crop canvas).
   */
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  /**
   * ✅ Indice pagina (0-based)
   */
  pageIndex: number
  /**
   * ✅ ID univoco del viewer (es. docId)
   */
  viewerId: string
  /**
   * ✅ Coordinate percentuali (opzionale, per retrocompatibilità)
   */
  bbox?: {
    x0Pct: number
    y0Pct: number
    x1Pct: number
    y1Pct: number
  }
}

/**
 * ✅ Contenuto estratto da un rettangolo
 * Restituito da extractContentFromRect() - specifico del viewer
 */
export interface ExtractedContent {
  /**
   * ✅ Testo nativo (se disponibile)
   */
  text?: string
  /**
   * ✅ Testo OCR (se disponibile)
   */
  ocrText?: string
  /**
   * ✅ Immagine ritagliata (opzionale)
   */
  imageSnippet?: Blob
  /**
   * ✅ Metadati aggiuntivi (viewer-specific)
   */
  metadata?: Record<string, any>
}

/**
 * ✅ Card di estratto viewer-agnostica
 * Formato universale per tutti i viewer
 *
 * La card contiene SOLO il rettangolo selezionato.
 * Il contenuto estratto è opzionale e viene caricato on-demand quando necessario.
 */
export interface ExtractCard {
  id: string
  /**
   * ✅ Rettangolo selezionato (pixel)
   */
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  /**
   * ✅ Indice pagina (0-based)
   */
  pageIndex: number
  /**
   * ✅ ID univoco del viewer
   */
  viewerId: string
  /**
   * ✅ Tipo di viewer
   */
  viewerType: ViewerType
  /**
   * ✅ Contenuto estratto (opzionale - lazy loading)
   * Viene estratto solo quando necessario (es. per overlay, export, etc.)
   */
  content?: ExtractedContent
  /**
   * ✅ Data creazione
   */
  createdAt: Date
}

export interface ViewerPanelDisposable {
  dispose: () => void
}

/**
 * Minimal panel contract required by document viewers.
 * It keeps viewer code independent from Dockview's complete API surface.
 */
export interface ViewerPanelApi {
  readonly isActive: boolean
  readonly width: number
  readonly height: number
  onDidActiveChange: (
    listener: (event: { isActive: boolean }) => void
  ) => ViewerPanelDisposable
  onDidDimensionsChange: (
    listener: (event: { width: number; height: number }) => void
  ) => ViewerPanelDisposable
}

export interface ViewerShellProps {
  fileUrl: string
  page?: number
  onPageChange?: (page: number) => void
  hideToolbar?: boolean
  docId?: string
  praticaId?: string
  docName?: string
  hasNativeText?: boolean
  /** Panel lifecycle API used to synchronize activation and dimensions. */
  panelApi?: ViewerPanelApi
  /**
   * @deprecated Usa panelApi invece. Mantenuto per retrocompatibilità.
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
