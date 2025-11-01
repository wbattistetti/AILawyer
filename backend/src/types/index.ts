export interface PraticaCreateInput {
  nome: string
  cliente: string
  foro: string
  controparte?: string
  pmGiudice?: string
  numeroRuolo?: string
}

export interface DocumentoCreateInput {
  praticaId: string
  compartoId: string
  filename: string
  mime: string
  size: number
  s3Key: string
  hash: string
  ocrStatus?: string
  tags?: string[]
  thumbnailDataUrl?: string // Base64 JPEG data URL per miniatura
  filePath?: string // Path originale del file locale (solo se disponibile, es. File System Access API)
}

export interface ClassificationResult {
  compartoKey: string
  tags: string[]
  confidence: number
  why: string
}

export interface OcrResult {
  pages: Array<{
    text: string
    confidence: number
  }>
  avgConfidence: number
}

export interface JobResult {
  success: boolean
  data?: any
  error?: string
}

// ===== NUOVI TIPI PER SISTEMA CLIENTI/ESTRATTI =====

export interface ClienteCreateInput {
  nome: string
  cognome: string
  codiceFiscale?: string
  dataNascita?: Date
  indirizzo?: string
  metadati?: ClienteMetadato[]
}

export interface ClienteUpdateInput {
  nome?: string
  cognome?: string
  codiceFiscale?: string
  dataNascita?: Date
  indirizzo?: string
  metadati?: ClienteMetadato[]
}

export interface ClienteMetadato {
  type: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  label: string
  value: string
}

export interface TipoDinamicoCreateInput {
  label: string
  type: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  obbligatorio?: boolean
  validazione?: TipoDinamicoValidazione
  ordine?: number
}

export interface TipoDinamicoUpdateInput {
  label?: string
  type?: 'testo' | 'numero' | 'data' | 'valuta' | 'booleano'
  obbligatorio?: boolean
  validazione?: TipoDinamicoValidazione
  ordine?: number
}

export interface TipoDinamicoValidazione {
  pattern?: string
  min?: number
  max?: number
  required?: boolean
  message?: string
}

export interface EstrattoCreateInput {
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
  extractDate?: Date

  // Note editabili dall'analista
  notesAnalyst?: string
  notesDescription?: string
  notesStrategy?: string
  notesDefense?: string

  // Metadati
  analystId: string
  clientiIds?: string[] // Array di ID clienti
}

export interface EstrattoUpdateInput {
  sourceDoc?: string
  page?: number
  start?: number
  end?: number
  type?: 'reato' | 'motivazione' | 'contromotivazione' | 'prova' | 'testimonianza' | 'altro'
  parentReatoId?: string
  parentMotivazioneId?: string
  title?: string
  content?: string

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
  extractDate?: Date

  // Note editabili dall'analista
  notesAnalyst?: string
  notesDescription?: string
  notesStrategy?: string
  notesDefense?: string

  clientiIds?: string[]
}

export interface EstrattoHierarchy {
  reati: EstrattoWithRelations[]
  motivazioni: EstrattoWithRelations[]
  contromotivazioni: EstrattoWithRelations[]
}

export interface EstrattoWithRelations {
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
  extractDate: Date

  // Note editabili dall'analista
  notesAnalyst?: string
  notesDescription?: string
  notesStrategy?: string
  notesDefense?: string

  // Metadati
  createdAt: Date
  updatedAt: Date
  analystId: string

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
  parentReato?: EstrattoWithRelations
  parentMotivazione?: EstrattoWithRelations
  motivazioni?: EstrattoWithRelations[]
  contromotivazioni?: EstrattoWithRelations[]
}

// ===== TIPI PER MEMORIA DIFENSIVA =====

export interface MemoriaDifensivaCreateInput {
  title: string
  praticaId: string
  structure?: DefenseDocumentStructure
}

export interface MemoriaDifensivaUpdateInput {
  title?: string
  structure?: DefenseDocumentStructure
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