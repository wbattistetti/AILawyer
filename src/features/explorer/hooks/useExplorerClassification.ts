import { useCallback } from 'react'
import { FileEntry } from '../types'

/**
 * Hook per gestire la classificazione dei file nell'Explorer.
 * Centralizza la logica di aggiornamento classificazione e sincronizzazione con lo stato globale.
 */
export function useExplorerClassification(
  files: FileEntry[],
  updateFileClassification: (fileId: string, compartoKey: string, compartoNome: string) => void
) {
  const handleFileClassificationChange = useCallback((
    fileId: string,
    compartoKey: string,
    compartoNome: string
  ) => {
    // ✅ Aggiorna classificazione nello stato locale
    updateFileClassification(fileId, compartoKey, compartoNome)

    // ✅ Salva in memoria globale per mostrare nei cassetti
    const file = files.find(f => f.id === fileId)
    if (file) {
      const updateFn = (window as any).__updatePendingClassification
      if (updateFn && typeof updateFn === 'function') {
        if (compartoKey) {
          updateFn(file.path, { compartoKey, compartoNome })
        } else {
          updateFn(file.path, null) // Rimuovi classificazione
        }
      } else {
        console.warn('[EXPLORER][CLASSIFICATION] updatePendingClassification non disponibile')
      }
    }
  }, [files, updateFileClassification])

  return { handleFileClassificationChange }
}
