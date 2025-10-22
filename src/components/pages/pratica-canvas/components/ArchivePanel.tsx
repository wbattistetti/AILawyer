import React from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, RefreshCw } from 'lucide-react'
import { ThumbCard } from '../../../viewers/ThumbCard'
import { api } from '../../../../lib/api'
import { ArchivePanelProps } from '../types'

export function ArchivePanel({
  praticaId,
  documenti,
  uploads,
  clientThumbByS3,
  showAnalysis,
  setShowAnalysis,
  selectedDocId,
  setSelectedDocId,
  archiveUploadingCount,
  setArchiveUploadingCount,
  ocrProgressByDoc,
  ocrEtaByDoc,
  ocrStatusByDoc,
  ocrCancellingByDoc,
  transcribedPctByDoc,
  ocrJobByDoc,
  setOcrProgressByDoc,
  setOcrEtaByDoc,
  setOcrStatusByDoc,
  setOcrCancellingByDoc,
  setTranscribedPctByDoc,
  setOcrJobByDoc,
  onFileDrop,
  onRemoveDocument,
  onOpenInTable,
  onOcr,
  onOcrCancel
}: ArchivePanelProps) {
  
  // Dropzone: applicata alla colonna sinistra
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => onFileDrop(files, { type: 'archive' }),
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
      className={`w-full h-full min-h-full flex flex-col border-2 border-dashed rounded-md transition ${
        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
      }`}
      style={{ padding: '12px' }}
      onClick={() => { if (documenti.length === 0) open() }}>
      <input {...getInputProps()} />

      {/* Toolbar Archivio */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-600">Archiv极</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded" onClick={(e)=>{ e.stopPropagation(); setShowAnalysis(!showAnalysis) }}>Analizza</button>
          <button className="px-2 py-1 border rounded" onClick={(e)=>{ e.stopPropagation(); open() }}>Carica…</button>
        </div>
      </div>

      {/* Upload spinner overlay */}
      {uploads.some(u => u.status === 'uploading' || u.status === 'processing' || (u.progress > 0 && u.progress < 100)) && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
          <RefreshCw className="w-7 h-7 animate-spin text-blue-700 mb-2" />极
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
        <div className="grid [grid-template-columns:repeat(auto-fill,极inmax(12rem,1fr))] gap-6 items-start overflow-auto flex-1 p-2">
        {documenti.map(doc => {
          const isPdf = doc.mime?.startsWith('application/pdf') || doc.filename.toLowerCase().endsWith('.pdf')
          const ver = (doc as any)?.updatedAt ? `?v=${encodeURIComponent((doc as any).updatedAt as any)}` : ''
          const serverThumb = isPdf && doc.hash ? `${api.getThumbUrl(doc.hash)}${ver}` : ''
          const clientThumb = clientThumbByS3[doc.s3Key]
          const thumb = clientThumb || serverThumb || ''
          return (
            <ThumbCard
              key={doc.id}
              title={doc.filename}
              imgSrc={thumb}
              selected={selectedDocId === doc.id}
              onSelect={() => setSelectedDocId(doc.id)}
              onPreview={() => { setSelectedDocId(doc.id); onOpenInTable(doc) }}
              onPreviewOcr={() => { if (doc.ocrPdfKey) window.open(api.getLocalFileUrl(doc.ocrPdfKey), '_blank') }}
              onTable={() => { setSelectedDocId(doc.id); onOpenInTable(doc) }}
              onRemove={() => onRemoveDocument(doc.id)}
              onOcr={() => onOcr(doc)}
              onOcrCancel={async () => {
                const d = documenti.find(x=>x.id===doc.id); if (!d) return
                const pct = Math.max(0, Math.min(100, Number(ocrProgressByDoc[d.id] ?? 0)))
                setTranscribedPctByDoc({ ...transcribedPctByDoc, [d.id]: pct })
                setOcrEtaByDoc({ ...ocrEtaByDoc, [d.id]: null })
                setOcrStatusByDoc({ ...ocrStatusByDoc, [d.id]: null })
                setOcrProgressByDoc({ ...ocrProgressByDoc, [d.id]: undefined })
                setOcrCancellingByDoc({ ...ocrCancellingByDoc, [d.id]: true })
                const jid = ocrJobByDoc[d.id]
                if (jid) { try { await api.cancelJob(jid) } catch {} }
              }}
              ocrProgressPct={ocrProgressByDoc[doc.id] ?? null}
              ocrEtaText={ocrEtaByDoc[doc.id] ?? null}
              ocrStatusText={ocrStatusByDoc[doc.id] ?? null}
              hasOcr={!!doc.ocrPdfKey}
              ocrCancelling={!!ocrCancellingByDoc[doc.id]}
              transcribedPct={typeof transcribedPctByDoc[doc.id] === 'number' ? transcribedPctByDoc[doc.id] : null}
            />
          )
        })}
        </div>
      )}

      {showAnalysis && (
        <div className="flex-1 overflow-hidden border rounded bg-white">
          {/* AnalysisPanel sarà implementato separatamente */}
          <div className="p-4 text-center text-muted-foreground">
            Analysis Panel (da implementare)
          </div>
        </div>
      )}
    </div>
  )
}
