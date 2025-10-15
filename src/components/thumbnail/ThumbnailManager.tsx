import React, { useEffect, useMemo } from 'react'
import { useMultipleThumbnails } from '../../hooks/useAutoThumbnail'
import { THUMBNAIL_CONFIG } from '../../lib/constants'

interface DocumentItem {
  id: string
  fileUrl: string
  title: string
  mimeType?: string
}

interface ThumbnailManagerProps {
  documents: DocumentItem[]
  children: (props: {
    getThumbnail: (id: string) => string | null
    isLoading: (id: string) => boolean
    getError: (id: string) => string | null
    clearAll: () => void
  }) => React.ReactNode
  enabled?: boolean
  options?: {
    width?: number
    height?: number
    quality?: number
    batchSize?: number
  }
}

/**
 * Componente per gestire automaticamente le miniature di una collezione di documenti
 * Utilizza la generazione in batch per ottimizzare le performance
 */
export function ThumbnailManager({ 
  documents, 
  children, 
  enabled = true,
  options = {}
}: ThumbnailManagerProps) {
  const {
    width = THUMBNAIL_CONFIG.DEFAULT_WIDTH,
    height = THUMBNAIL_CONFIG.DEFAULT_HEIGHT,
    quality = THUMBNAIL_CONFIG.DEFAULT_QUALITY,
    batchSize = THUMBNAIL_CONFIG.BATCH_SIZE
  } = options

  // Estrae solo gli URL dei documenti PDF
  const pdfUrls = useMemo(() => {
    return documents
      .filter(doc => doc.mimeType?.includes('pdf') || doc.fileUrl.toLowerCase().endsWith('.pdf'))
      .map(doc => doc.fileUrl)
  }, [documents])

  // Hook per gestire multiple miniature
  const {
    getThumbnail: getThumbnailByUrl,
    isLoading: isLoadingByUrl,
    getError: getErrorByUrl,
    clearAll
  } = useMultipleThumbnails(pdfUrls, {
    enabled,
    width,
    height,
    quality,
    batchSize
  })

  // Crea mappe per accesso rapido per ID documento
  const thumbnailMap = useMemo(() => {
    const map = new Map<string, string>()
    documents.forEach(doc => {
      if (doc.mimeType?.includes('pdf') || doc.fileUrl.toLowerCase().endsWith('.pdf')) {
        const thumbnail = getThumbnailByUrl(doc.fileUrl)
        if (thumbnail) {
          map.set(doc.id, thumbnail)
        }
      }
    })
    return map
  }, [documents, getThumbnailByUrl])

  const loadingMap = useMemo(() => {
    const map = new Map<string, boolean>()
    documents.forEach(doc => {
      if (doc.mimeType?.includes('pdf') || doc.fileUrl.toLowerCase().endsWith('.pdf')) {
        map.set(doc.id, isLoadingByUrl(doc.fileUrl))
      }
    })
    return map
  }, [documents, isLoadingByUrl])

  const errorMap = useMemo(() => {
    const map = new Map<string, string>()
    documents.forEach(doc => {
      if (doc.mimeType?.includes('pdf') || doc.fileUrl.toLowerCase().endsWith('.pdf')) {
        const error = getErrorByUrl(doc.fileUrl)
        if (error) {
          map.set(doc.id, error)
        }
      }
    })
    return map
  }, [documents, getErrorByUrl])

  // Funzioni helper per accesso per ID
  const getThumbnail = (id: string) => thumbnailMap.get(id) || null
  const isLoading = (id: string) => loadingMap.get(id) || false
  const getError = (id: string) => errorMap.get(id) || null

  return (
    <>
      {children({
        getThumbnail,
        isLoading,
        getError,
        clearAll
      })}
    </>
  )
}

/**
 * Hook semplificato per utilizzare ThumbnailManager
 */
export function useThumbnailManager(documents: DocumentItem[], options?: ThumbnailManagerProps['options']) {
  const [thumbnails, setThumbnails] = React.useState<Map<string, string>>(new Map())
  const [loadingStates, setLoadingStates] = React.useState<Map<string, boolean>>(new Map())
  const [errors, setErrors] = React.useState<Map<string, string>>(new Map())

  const getThumbnail = React.useCallback((id: string) => {
    return thumbnails.get(id) || null
  }, [thumbnails])

  const isLoading = React.useCallback((id: string) => {
    return loadingStates.get(id) || false
  }, [loadingStates])

  const getError = React.useCallback((id: string) => {
    return errors.get(id) || null
  }, [errors])

  const clearAll = React.useCallback(() => {
    setThumbnails(new Map())
    setLoadingStates(new Map())
    setErrors(new Map())
  }, [])

  return {
    getThumbnail,
    isLoading,
    getError,
    clearAll
  }
}
