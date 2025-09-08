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