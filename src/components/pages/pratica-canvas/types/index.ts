import { Pratica, Comparto, Documento, UploadProgress } from '../../../types'
import { OcrState } from '../../../../utils/ocrState'

export interface ArchivePanelProps {
  praticaId: string | undefined
  comparti: any[]
  showAnalysis: boolean
  setShowAnalysis: (show: boolean) => void
  selectedDocId: string | null
  setSelectedDocId: (id: string | null) => void
  ocrProgressByDoc: Record<string, number>
  ocrEtaByDoc: Record<string, string | null>
  ocrStatusByDoc: Record<string, string | null>
  ocrCancellingByDoc: Record<string, boolean>
  transcribedPctByDoc: Record<string, number>
  ocrJobByDoc: Record<string, string>
  setOcrProgressByDoc: (progress: Record<string, number>) => void
  setOcrEtaByDoc: (eta: Record<string, string | null>) => void
  setOcrStatusByDoc: (status: Record<string, string | null>) => void
  setOcrCancellingByDoc: (cancelling: Record<string, boolean>) => void
  setTranscribedPctByDoc: (pct: Record<string, number>) => void
  onOcr: (documento: Documento, mode?: 'quick' | 'full', limitPages?: number) => void
  onOcrCancel: (documento: Documento) => void
}

export interface PraticaHeaderProps {
  pratica: Pratica | null
  onRefresh: () => void
  onUpload: () => void
  onNavigateHome: () => void
}

export interface PdfViewerWrapperProps {
  doc: Documento
  syncPage: number | null
  setSyncPage: (page: number) => void
  verifyEnabled: boolean
  setVerifyEnabled: (enabled: boolean) => void
  verifyLinesByPage: Record<number, any[]>
  testNewViewer: boolean
  setTestNewViewer: (test: boolean) => void
}

export interface AnalysisPanelProps {
  documenti: Documento[]
  onStartAnalysis: (doc: Documento) => void
  onStopAnalysis: (docId: string, task?: string) => void
}

export interface UseArchiveReturn {
  documenti: Documento[]
  uploads: UploadProgress[]
  clientThumbByS3: Record<string, string>
  showAnalysis: boolean
  selectedDocId: string | null
  archiveUploadingCount: number
  ocrProgressByDoc: Record<string, number>
  ocrEtaByDoc: Record<string, string>
  ocrStatusByDoc: Record<string, string>
  ocrCancellingByDoc: Record<string, boolean>
  transcribedPctByDoc: Record<string, number>
  ocrJobByDoc: Record<string, string>
  setShowAnalysis: (show: boolean) => void
  setSelectedDocId: (id: string | null) => void
  setArchiveUploadingCount: (count: number) => void
  setOcrProgressByDoc: (progress: Record<string, number>) => void
  setOcrEtaByDoc: (eta: Record<string, string>) => void
  setOcrStatusByDoc: (status: Record<string, string>) => void
  setOcrCancellingByDoc: (cancelling: Record<string, boolean>) => void
  setTranscribedPctByDoc: (pct: Record<string, number>) => void
  setOcrJobByDoc: (jobs: Record<string, string>) => void
  handleFileDrop: (files: File[], target?: { type?: string; id?: string; title?: string; tags?: string[] } | null) => void
  handleRemoveThumb: (documentId: string) => void
  openInTable: (documento: Documento) => void
  handleOcr: (documento: Documento, mode?: 'quick' | 'full', limitPages?: number) => void
  handleOcrCancel: (documento: Documento) => void
}

export interface UsePraticaDataReturn {
  pratica: Pratica | null
  comparti: Comparto[]
  isLoading: boolean
  loadPraticaData: (praticaId: string) => void
}

export interface UseOcrReturn {
  ocrProgressByDoc: Record<string, number>
  ocrEtaByDoc: Record<string, string>
  ocrStatusByDoc: Record<string, string>
  ocrCancellingByDoc: Record<string, boolean>
  transcribedPctByDoc: Record<string, number>
  ocrJobByDoc: Record<string, string>
  persistOcrState: () => void
  handleOcr: (documento: Documento, mode?: 'quick' | 'full', limitPages?: number) => void
  handleOcrCancel: (documento: Documento) => void
}
