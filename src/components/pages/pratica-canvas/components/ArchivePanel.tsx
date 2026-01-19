import { useDropzone } from 'react-dropzone'
import { Upload, RefreshCw } from 'lucide-react'
import { ThumbCard } from '../../../viewers/ThumbCard'
import { api } from '../../../../lib/api'
import { useArchive } from '../hooks/useArchive'
import { useOcr } from '../hooks/useOcr'
import { ArchivePanelProps } from '../types'
import { ArchiveRenderer } from './ArchiveRenderer'

export function ArchivePanel({
  praticaId,
  comparti,
  showAnalysis,
  setShowAnalysis,
  selectedDocId,
  setSelectedDocId,
  onOcr,
  onOcrCancel
}: ArchivePanelProps) {

  // Usa l'hook useArchive per la gestione documenti
  const {
    documenti,
    uploads,
    clientThumbByS3,
    handleFileDrop,
    handleRemoveThumb,
    pendingMoveConfirmations,
    handleConfirmMove,
    handleCancelMove
  } = useArchive(praticaId, comparti)

  // Usa l'hook useOcr per la gestione OCR
  const {
    ocrProgressByDoc,
    ocrEtaByDoc,
    ocrStatusByDoc,
    ocrCancellingByDoc,
    transcribedPctByDoc,
    ocrJobByDoc,
    handleOcr,
    handleOcrCancel
  } = useOcr(praticaId)

  // Dropzone: applicata alla colonna sinistra
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => handleFileDrop(files, null, { type: 'archive' }),
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  return (
    <div
      {...getRootProps()}
      className={`w-full h-full min-h-full flex flex-col border-2 border-dashed rounded-md transition ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
        }`}
      style={{ padding: '12px' }}
      onClick={() => { if (documenti.length === 0) open() }}>
      <input {...getInputProps()} />

      {/* Toolbar Archivio */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-600">Archivio</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded" onClick={(e) => { e.stopPropagation(); setShowAnalysis(!showAnalysis) }}>Analizza</button>
          <button className="px-2 py-1 border rounded" onClick={(e) => { e.stopPropagation(); open() }}>Carica…</button>
        </div>
      </div>

      {/* Upload spinner overlay */}
      {uploads.some(u => u.status === 'uploading' || u.status === 'processing' || (u.progress > 0 && u.progress < 100)) && (
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
          <RefreshCw className="w-7 h-7 animate-spin text-blue-700 mb-2" />
          <div className="text-sm text-neutral-800">
            {(uploads.filter(u => u.status === 'uploading' || u.status === 'processing' || (u.progress > 0 && u.progress < 100)).length > 1)
              ? 'Sto caricando i documenti…'
              : 'Sto caricando il documento…'}
          </div>
        </div>
      )}

      {!showAnalysis && documenti.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm">Trascina qui i file della pratica oppure clicca per selezionarli</p>
          </div>
        </div>
      )}

      {!showAnalysis && (
        <div className="flex-1 min-h-0">
          <ArchiveRenderer
            clientThumbByS3={clientThumbByS3}
            // dockV2Ref non è disponibile qui; il renderer gestirà l'apertura con evento globale o API locale
            dockV2Ref={{ current: null }} as any
            handleFileDrop={handleFileDrop as any}
            handleRemoveThumb={handleRemoveThumb}
            handleOcr={(doc) => handleOcr(doc)}
            handleOcrCancel={(doc) => handleOcrCancel(doc)}
            ocrProgressByDoc={ocrProgressByDoc}
            ocrEtaByDoc={ocrEtaByDoc as any}
            ocrStatusByDoc={ocrStatusByDoc}
            ocrCancellingByDoc={ocrCancellingByDoc}
            transcribedPctByDoc={transcribedPctByDoc as any}
            comparti={comparti}
            toast={() => { }}
            pendingMoveConfirmations={pendingMoveConfirmations}
            onConfirmMove={handleConfirmMove}
            onCancelMove={handleCancelMove}
          />
        </div>
      )}

      {showAnalysis && (
        <div className="flex-1 overflow-hidden border rounded bg-background">
          {/* AnalysisPanel sarà implementato separatamente */}
          <div className="p-4 text-center text-muted-foreground">
            Analysis Panel (da implementare)
          </div>
        </div>
      )}
    </div>
  )
}
