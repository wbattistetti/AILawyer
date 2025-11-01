import { useState, useEffect, useCallback } from 'react'
import { generatePdfThumbnail, type ThumbnailResult, type ThumbnailOptions } from '../lib/thumbnailGenerator'

export interface UseAutoThumbnailOptions extends ThumbnailOptions {
  enabled?: boolean
  fallbackToServer?: boolean
  retryOnError?: boolean
  maxRetries?: number
}

export interface UseAutoThumbnailReturn {
  thumbnail: string | null
  loading: boolean
  error: string | null
  generate: () => Promise<void>
  clear: () => void
}

/**
 * Hook per la generazione automatica di miniature PDF
 * @param fileUrl URL del file PDF
 * @param options Opzioni per la generazione
 * @returns Oggetto con stato e funzioni per gestire la miniatura
 */
export function useAutoThumbnail(
  fileUrl: string | null | undefined,
  options: UseAutoThumbnailOptions = {}
): UseAutoThumbnailReturn {
  const {
    enabled = true,
    fallbackToServer = true,
    retryOnError = true,
    maxRetries = 2,
    width = 200,
    height = 280,
    quality = 0.8,
    scale = 1.0
  } = options

  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [hasFailedPermanently, setHasFailedPermanently] = useState(false)

  const generate = useCallback(async () => {
    if (!fileUrl || !enabled || hasFailedPermanently) return

    // Se è un URL backend (non blob:), verifica se il file esiste prima di tentare
    if (fileUrl.startsWith('http://') && !fileUrl.startsWith('blob:')) {
      try {
        const response = await fetch(fileUrl, { method: 'HEAD' })
        if (!response.ok && response.status === 404) {
          // File non esiste fisicamente (modalità privacy) - ferma i retry
          setHasFailedPermanently(true)
          setError('File non disponibile sul server')
          setLoading(false)
          return
        }
      } catch (headError) {
        // Se HEAD fallisce, procedi comunque con il tentativo di generazione
      }
    }

    try {
      setLoading(true)
      setError(null)

      const result = await generatePdfThumbnail(fileUrl, {
        width,
        height,
        quality,
        scale
      })

      setThumbnail(result.dataUrl)
      setRetryCount(0) // Reset retry count on success
      setHasFailedPermanently(false) // Reset permanent failure on success

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto'
      setError(errorMessage)

      // Se l'errore indica che il file non esiste, ferma i retry
      if (errorMessage.includes('Missing PDF') || errorMessage.includes('404')) {
        setHasFailedPermanently(true)
        return
      }

      // Retry logic solo se non è un fallimento permanente
      if (retryOnError && retryCount < maxRetries && !hasFailedPermanently) {
        setRetryCount(prev => prev + 1)
        // Retry after a delay
        setTimeout(() => {
          generate()
        }, 1000 * (retryCount + 1)) // Exponential backoff
      } else {
        console.warn('Generazione miniatura fallita:', errorMessage)
        // Se fallbackToServer è true, potrebbe essere gestito dal componente padre
      }
    } finally {
      setLoading(false)
    }
  }, [fileUrl, enabled, width, height, quality, scale, retryOnError, maxRetries, retryCount, hasFailedPermanently])

  const clear = useCallback(() => {
    setThumbnail(null)
    setError(null)
    setRetryCount(0)
    setHasFailedPermanently(false)
  }, [])

  // Genera automaticamente quando cambia fileUrl (solo se non ha fallito permanentemente)
  useEffect(() => {
    if (fileUrl && enabled && !thumbnail && !loading && !hasFailedPermanently) {
      generate()
    }
  }, [fileUrl, enabled, thumbnail, loading, hasFailedPermanently, generate])

  // Pulisce quando cambia fileUrl
  useEffect(() => {
    if (fileUrl) {
      clear()
    }
  }, [fileUrl, clear])

  // Reset hasFailedPermanently quando cambia fileUrl
  useEffect(() => {
    setHasFailedPermanently(false)
  }, [fileUrl])

  return {
    thumbnail,
    loading,
    error,
    generate,
    clear
  }
}

/**
 * Hook per gestire multiple miniature (es. per una collezione di documenti)
 */
export function useMultipleThumbnails(
  fileUrls: (string | null | undefined)[],
  options: UseAutoThumbnailOptions = {}
) {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [loadingStates, setLoadingStates] = useState<Map<string, boolean>>(new Map())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  const generateForUrl = useCallback(async (url: string) => {
    if (!url) return

    setLoadingStates(prev => new Map(prev).set(url, true))
    setErrors(prev => new Map(prev).set(url, ''))

    try {
      const result = await generatePdfThumbnail(url, {
        width: options.width || 200,
        height: options.height || 280,
        quality: options.quality || 0.8,
        scale: options.scale || 1.0
      })

      setThumbnails(prev => new Map(prev).set(url, result.dataUrl))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
      setErrors(prev => new Map(prev).set(url, errorMessage))
    } finally {
      setLoadingStates(prev => new Map(prev).set(url, false))
    }
  }, [options])

  const generateAll = useCallback(async () => {
    const validUrls = fileUrls.filter((url): url is string => Boolean(url))

    // Genera in batch per evitare sovraccarico
    const batchSize = 3
    for (let i = 0; i < validUrls.length; i += batchSize) {
      const batch = validUrls.slice(i, i + batchSize)
      await Promise.all(batch.map(generateForUrl))
    }
  }, [fileUrls, generateForUrl])

  const clearAll = useCallback(() => {
    setThumbnails(new Map())
    setLoadingStates(new Map())
    setErrors(new Map())
  }, [])

  const getThumbnail = useCallback((url: string) => {
    return thumbnails.get(url) || null
  }, [thumbnails])

  const isLoading = useCallback((url: string) => {
    return loadingStates.get(url) || false
  }, [loadingStates])

  const getError = useCallback((url: string) => {
    return errors.get(url) || null
  }, [errors])

  // Genera automaticamente quando cambiano gli URL
  useEffect(() => {
    if (options.enabled !== false) {
      generateAll()
    }
  }, [fileUrls, options.enabled, generateAll])

  return {
    thumbnails,
    loadingStates,
    errors,
    generateAll,
    clearAll,
    getThumbnail,
    isLoading,
    getError
  }
}
