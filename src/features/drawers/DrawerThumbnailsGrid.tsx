import React from 'react'
import { ThumbCard } from '../../components/viewers/ThumbCard'
import { useDocumentThumbnail } from '../../hooks/useDocumentThumbnail'

interface DrawerThumbnailsGridProps {
  documenti: any[]
  compartoId: string
  clientThumbByS3?: Record<string, string>
  ocrProgressByDoc?: Record<string, number>
  ocrEtaByDoc?: Record<string, string>
  ocrStatusByDoc?: Record<string, string>
  transcribedPctByDoc?: Record<string, number>
  ocrCancellingByDoc?: Record<string, boolean>
  onOpenDoc: (doc: any) => void
  onRemoveDoc?: (doc: any) => void
  onOcr?: (doc: any) => void
  onOcrCancel?: (doc: any) => void
}

// Wrapper per ThumbCard con lazy loading thumbnail
function ThumbCardWithLazyThumbnail({
  doc,
  clientThumbByS3,
  ocrProgressByDoc,
  ocrEtaByDoc,
  ocrStatusByDoc,
  transcribedPctByDoc,
  ocrCancellingByDoc,
  onOpenDoc,
  onRemoveDoc,
  onOcr,
  onOcrCancel
}: {
  doc: any
  clientThumbByS3?: Record<string, string>
  ocrProgressByDoc?: Record<string, number>
  ocrEtaByDoc?: Record<string, string>
  ocrStatusByDoc?: Record<string, string>
  transcribedPctByDoc?: Record<string, number>
  ocrCancellingByDoc?: Record<string, boolean>
  onOpenDoc: (doc: any) => void
  onRemoveDoc?: (doc: any) => void
  onOcr?: (doc: any) => void
  onOcrCancel?: (doc: any) => void
}) {
  const isPdf = doc.mime?.startsWith('application/pdf') || doc.filename.toLowerCase().endsWith('.pdf')
  const thumbnailFromDb = (doc as any).thumbnailDataUrl || undefined
  const clientThumb = clientThumbByS3?.[doc.s3Key] || ''
  const existingThumb = thumbnailFromDb || clientThumb

  // Lazy load thumbnail solo se non c'è già una thumbnail e il documento non è temporaneo/pending
  const isTempOrPending = doc.id.startsWith('temp:') || doc.id.startsWith('pending:')
  const shouldLoadLazy = !existingThumb && !isTempOrPending
  const { thumbnail: lazyThumbnail } = useDocumentThumbnail(shouldLoadLazy ? doc.id : undefined, true)

  const thumb = existingThumb || lazyThumbnail || ''
  const localUrl = (doc as any).localUrl
  const fileUrl = localUrl || (doc.s3Key ? `http://localhost:3001/api/files/${encodeURIComponent(doc.s3Key)}` : undefined)
  const shouldAutoGenerate = isPdf && !thumb && !!fileUrl

  return (
    <ThumbCard
      title={doc.filename}
      imgSrc={thumb}
      fileUrl={fileUrl}
      autoGenerateThumbnail={shouldAutoGenerate}
      isPdf={isPdf}
      hasOcr={doc.hasOcr}
      ocrProgressPct={ocrProgressByDoc?.[doc.id]}
      ocrEtaText={ocrEtaByDoc?.[doc.id]}
      ocrStatusText={ocrStatusByDoc?.[doc.id]}
      transcribedPct={transcribedPctByDoc?.[doc.id]}
      ocrCancelling={ocrCancellingByDoc?.[doc.id]}
      onPreview={() => onOpenDoc(doc)}
      onTable={() => onOpenDoc(doc)}
      onRemove={onRemoveDoc ? () => onRemoveDoc(doc) : undefined}
      onOcr={onOcr ? () => onOcr(doc) : undefined}
      onOcrCancel={onOcrCancel ? () => onOcrCancel(doc) : undefined}
    />
  )
}

export function DrawerThumbnailsGrid({
  documenti,
  compartoId,
  clientThumbByS3 = {},
  ocrProgressByDoc = {},
  ocrEtaByDoc = {},
  ocrStatusByDoc = {},
  transcribedPctByDoc = {},
  ocrCancellingByDoc = {},
  onOpenDoc,
  onRemoveDoc,
  onOcr,
  onOcrCancel
}: DrawerThumbnailsGridProps) {
  // ✅ DEBUG: Log per verificare se il componente viene renderizzato
  console.log('[DRAWER-THUMBNAILS-GRID][RENDER] Renderizzato:', {
    compartoId,
    documentiTotali: documenti.length,
    documentiSample: documenti.slice(0, 3).map(d => ({ id: d.id, filename: d.filename, compartoId: d.compartoId }))
  })

  // Filtra documenti per comparto
  const docs = documenti.filter(d => d.compartoId === compartoId)

  console.log('[DRAWER-THUMBNAILS-GRID][FILTER] Documenti filtrati:', {
    compartoId,
    docsCount: docs.length,
    docs: docs.map(d => ({ id: d.id, filename: d.filename }))
  })

  if (docs.length === 0) {
    console.log('[DRAWER-THUMBNAILS-GRID][EMPTY] Nessun documento trovato per comparto:', compartoId)
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        <p>Nessun documento in questo comparto</p>
      </div>
    )
  }

  console.log('[DRAWER-THUMBNAILS-GRID][RENDERING] Renderizzando grid con', docs.length, 'documenti')

  return (
    <div className="w-full h-full flex flex-col" style={{
      minHeight: '200px',
      outline: '2px solid magenta',
      outlineOffset: '-2px'
    }}>
      {/* Grid con scroll - struttura semplice e diretta */}
      <div className="flex-1 overflow-auto p-4" style={{
        minHeight: '200px',
        backgroundColor: '#fff',
        outline: '1px solid orange',
        outlineOffset: '-1px'
      }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-6" style={{
          outline: '1px solid lime',
          outlineOffset: '-1px'
        }}>
          {docs.map(doc => {
            // ✅ Key stabile per evitare re-mount quando l'ID cambia (tempIdImmediato → tempIdFinale → documento reale)
            // Priorità: s3Key > hash > filePath > id
            const stableKey = doc.s3Key || (doc as any).hash || (doc as any).filePath || doc.id

            return (
            <ThumbCardWithLazyThumbnail
              key={stableKey}
              doc={doc}
              clientThumbByS3={clientThumbByS3}
              ocrProgressByDoc={ocrProgressByDoc}
              ocrEtaByDoc={ocrEtaByDoc}
              ocrStatusByDoc={ocrStatusByDoc}
              transcribedPctByDoc={transcribedPctByDoc}
              ocrCancellingByDoc={ocrCancellingByDoc}
              onOpenDoc={onOpenDoc}
              onRemoveDoc={onRemoveDoc}
              onOcr={onOcr}
              onOcrCancel={onOcrCancel}
            />
            )
          })}
        </div>
      </div>
    </div>
  )
}

