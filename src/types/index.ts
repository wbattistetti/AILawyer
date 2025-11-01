export interface Pratica {
  id: string
  nome: string
  cliente: string
  foro: string
  controparte?: string
  pmGiudice?: string
  numeroRuolo?: string
  status: 'draft' | 'committed'
  createdAt: string
  memorieDifensive?: MemoriaDifensiva[]
}

export interface Comparto {
  id: string
  praticaId: string
  key: string
  nome: string
  ordine: number
}

export interface Documento {
  id: string
  praticaId: string
  compartoId: string
  filename: string
  mime: string
  size: number
  s3Key: string
  hash: string
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'low_confidence'
  ocrText?: string
  ocrLayout?: OcrLayoutPage[]
  ocrConfidence?: number
  ocrPdfKey?: string
  hasNativeText?: boolean
  classConfidence?: number
  classWhy?: string
  tags: string[]
  thumbnailDataUrl?: string // Base64 JPEG data URL per miniatura (caricato lazy)
  filePath?: string // Path originale del file locale (solo se disponibile, es. File System Access API)
  createdAt: string
}

export interface OcrLayoutPageWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrLayoutPage { page: number; width: number; height: number; words: OcrLayoutPageWord[] }

export interface Job {
  id: string
  type: 'OCR' | 'CLASSIFY'
  documentId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
  createdAt: string
  updatedAt: string
}

export interface UploadProgress {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
  compartoId?: string
  filenameBase?: string
  preview?: string
  s3Key?: string
  hasTempDoc?: boolean
}

// ===== NUOVI TIPI PER SISTEMA CLIENTI/ESTRATTI =====

export interface Cliente {
  id: string
  nome: string
  cognome: string
  codiceFiscale?: string
  dataNascita?: string
  indirizzo?: string
  metadati: ClienteMetadato[]
  createdAt: string
  updatedAt: string
}

export interface ClienteMetadato {
  type: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  label: string
  value: string
}

export interface TipoDinamico {
  id: string
  label: string
  type: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  obbligatorio: boolean
  validazione?: TipoDinamicoValidazione
  ordine: number
  createdAt: string
  updatedAt: string
}

export interface TipoDinamicoValidazione {
  pattern?: string
  min?: number
  max?: number
  required?: boolean
  message?: string
}

export interface Estratto {
  id: string
  praticaId: string
  sourceDoc: string
  page: number
  start: number
  end: number
  type: 'reato' | 'motivazione' | 'contromotivazione' | 'prova' | 'testimonianza' | 'altro'
  parentReatoId?: string
  parentMotivazioneId?: string
  title?: string
  content: string

  // Tracciabilità documento sorgente
  sourceDocId?: string
  sourceDocTitle?: string

  // Posizione nel documento (bbox)
  bbox?: {
    x: number
    y: number
    width: number
    height: number
  }

  // Data dell'estratto (per cronologia)
  extractDate: string

  // Note editabili dall'analista
  notesAnalyst?: string
  notesDescription?: string
  notesStrategy?: string
  notesDefense?: string

  // Metadati
  createdAt: string
  updatedAt: string
  analystId: string
}

export interface EstrattoWithRelations extends Estratto {
  pratica?: {
    id: string
    numeroRuolo: string
    foro: string
  }
  clienti?: Array<{
    id: string
    nome: string
    cognome: string
  }>
  parentReato?: Estratto
  parentMotivazione?: Estratto
  motivazioni?: Estratto[]
  contromotivazioni?: Estratto[]
}

export interface EstrattoHierarchy {
  reati: EstrattoWithRelations[]
  motivazioni: EstrattoWithRelations[]
  contromotivazioni: EstrattoWithRelations[]
}

// ===== TIPI PER FORM DINAMICI =====

export interface FormFieldConfig {
  label: string
  type: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  obbligatorio: boolean
  validazione?: TipoDinamicoValidazione
  ordine: number
}

export interface FormFieldValue {
  label: string
  value: string
}

// ===== TIPI PER MEMORIA DIFENSIVA =====

export interface MemoriaDifensiva {
  id: string
  title: string
  praticaId: string
  structure?: DefenseDocumentStructure
  createdAt: string
  updatedAt: string
}

export interface DefenseDocumentStructure {
  sections: DefenseDocumentSection[]
  metadata: {
    title: string
    clientName: string
    caseNumber: string
    createdAt: string
    analystName: string
  }
}

export interface DefenseDocumentSection {
  id: string
  type: 'reato' | 'motivazione' | 'contromotivazione' | 'prova' | 'testimonianza' | 'altro'
  title: string
  content: string
  extracts: EstrattoWithRelations[]
  subsections?: DefenseDocumentSection[]
  order: number
}