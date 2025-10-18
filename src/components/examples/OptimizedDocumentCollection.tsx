import React from 'react'
import { ThumbCard } from '../viewers/ThumbCard'
import { ThumbnailManager } from '../thumbnail/ThumbnailManager'
import { THUMBNAIL_CONFIG } from '../../lib/constants'

interface Document {
  id: string
  title: string
  fileUrl: string
  mimeType: string
  hasOcr?: boolean
  ocrProgressPct?: number | null
  ocrEtaText?: string | null
  ocrStatusText?: string | null
}

interface OptimizedDocumentCollectionProps {
  documents: Document[]
  onDocumentSelect?: (doc: Document) => void
  onDocumentPreview?: (doc: Document) => void
  onDocumentOcr?: (doc: Document) => void
  selectedDocumentId?: string
  autoGenerateThumbnails?: boolean
}

/**
 * Componente ottimizzato per la visualizzazione di una collezione di documenti
 * con generazione automatica delle miniature e concorrenza massima
 */
export function OptimizedDocumentCollection({
  documents,
  onDocumentSelect,
  onDocumentPreview,
  onDocumentOcr,
  selectedDocumentId,
  autoGenerateThumbnails = true
}: OptimizedDocumentCollectionProps) {
  
  return (
    <ThumbnailManager
      documents={documents}
      enabled={autoGenerateThumbnails}
      options={{
        width: THUMBNAIL_CONFIG.DEFAULT_WIDTH,
        height: THUMBNAIL_CONFIG.DEFAULT_HEIGHT,
        quality: THUMBNAIL_CONFIG.DEFAULT_QUALITY,
        batchSize: THUMBNAIL_CONFIG.BATCH_SIZE
      }}
    >
      {({ getThumbnail, isLoading, getError }) => (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
          {documents.map((doc) => {
            const thumbnail = getThumbnail(doc.id)
            const loading = isLoading(doc.id)
            const error = getError(doc.id)
            
            return (
              <ThumbCard
                key={doc.id}
                title={doc.title}
                imgSrc={thumbnail || ''} // Usa la miniatura generata automaticamente
                fileUrl={doc.fileUrl}
                autoGenerateThumbnail={!thumbnail && autoGenerateThumbnails} // Genera solo se non c'è già
                thumbnailOptions={{
                  width: THUMBNAIL_CONFIG.DEFAULT_WIDTH,
                  height: THUMBNAIL_CONFIG.DEFAULT_HEIGHT,
                  quality: THUMBNAIL_CONFIG.DEFAULT_QUALITY
                }}
                selected={selectedDocumentId === doc.id}
                hasOcr={doc.hasOcr}
                ocrProgressPct={doc.ocrProgressPct}
                ocrEtaText={doc.ocrEtaText}
                ocrStatusText={doc.ocrStatusText}
                onSelect={() => onDocumentSelect?.(doc)}
                onPreview={() => onDocumentPreview?.(doc)}
                onOcr={() => onDocumentOcr?.(doc)}
                excerpt={error ? `Errore: ${error}` : loading ? 'Generazione miniatura...' : undefined}
              />
            )
          })}
        </div>
      )}
    </ThumbnailManager>
  )
}

/**
 * Hook per utilizzare le ottimizzazioni in componenti personalizzati
 */
export function useOptimizedDocuments(documents: Document[]) {
  const [selectedId, setSelectedId] = React.useState<string | undefined>()
  
  const handleSelect = React.useCallback((doc: Document) => {
    setSelectedId(doc.id)
  }, [])
  
  const handlePreview = React.useCallback((doc: Document) => {
    // Logica per anteprima documento
    console.log('Preview document:', doc.title)
  }, [])
  
  const handleOcr = React.useCallback((doc: Document) => {
    // Logica per OCR documento
    console.log('OCR document:', doc.title)
  }, [])
  
  return {
    selectedDocumentId: selectedId,
    onDocumentSelect: handleSelect,
    onDocumentPreview: handlePreview,
    onDocumentOcr: handleOcr
  }
}
