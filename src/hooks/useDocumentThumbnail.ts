import { useState, useEffect } from 'react'
import { api } from '../lib/api'

/**
 * Hook per caricare thumbnail dal database per un documento
 * Utile quando il documento viene ricaricato ma thumbnailDataUrl non è incluso nella query
 */
export function useDocumentThumbnail(docId: string | undefined, enabled: boolean = true) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ✅ Salta documenti temporanei - la loro thumbnail viene generata client-side
    if (!docId || !enabled || thumbnail || docId.startsWith('temp:')) return

    let cancelled = false
    setLoading(true)
    setError(null)

    api.getDocumentoThumbnail(docId)
      .then(result => {
        if (!cancelled && result.thumbnailDataUrl) {
          setThumbnail(result.thumbnailDataUrl)
        }
      })
      .catch(err => {
        if (!cancelled) {
          // 404 significa che la thumbnail non esiste nel DB - non è un errore critico
          const status = (err as any)?.status || (err as any)?.response?.status
          if (status !== 404) {
            setError(err instanceof Error ? err.message : 'Errore nel caricamento thumbnail')
            console.warn('[THUMBNAIL][ERROR]', { docId, error: err })
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [docId, enabled, thumbnail])

  return { thumbnail, loading, error }
}

