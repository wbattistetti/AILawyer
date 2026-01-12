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
    // ✅ Salta documenti temporanei/pending - la loro thumbnail viene generata client-side
    // ✅ CRITICO: Se l'ID è solo un hash (64 caratteri hex), è probabilmente un documento temporaneo
    // ✅ Non cercare di caricare thumbnail dal DB per documenti temporanei
    const isTempOrPending = docId?.startsWith('temp:') || docId?.startsWith('pending:')
    const isHashOnly = docId && /^[0-9a-f]{64}$/i.test(docId) // Hash SHA-256 completo (64 caratteri hex)
    if (!docId || !enabled || thumbnail || isTempOrPending || isHashOnly) return

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

