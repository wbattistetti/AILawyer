export interface Pratica {
  id: string
  nome: string
  cliente: string
  foro: string
  controparte?: string
  pmGiudice?: string
  numeroRuolo?: string
  createdAt: string
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
  classConfidence?: number
  classWhy?: string
  tags: string[]
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
}