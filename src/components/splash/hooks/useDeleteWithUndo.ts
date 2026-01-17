import { useState, useCallback } from 'react'
import { Pratica } from '@/types'

interface UseDeleteWithUndoOptions {
  onConfirm: (id: string) => Promise<void>
}

export function useDeleteWithUndo({ onConfirm }: UseDeleteWithUndoOptions) {
  const [deletedPraticaId, setDeletedPraticaId] = useState<string | null>(null)
  const [deletedPratica, setDeletedPratica] = useState<Pratica | null>(null)

  // Start delete (mostra badge con Annulla/Conferma)
  const startDelete = useCallback((pratica: Pratica) => {
    setDeletedPraticaId(pratica.id)
    setDeletedPratica(pratica)
  }, [])

  // Cancel delete (annulla)
  const cancelDelete = useCallback(() => {
    setDeletedPraticaId(null)
    setDeletedPratica(null)
  }, [])

  // Confirm delete (conferma eliminazione)
  const confirmDelete = useCallback(async () => {
    if (!deletedPraticaId || !deletedPratica) return

    try {
      await onConfirm(deletedPraticaId)
      setDeletedPraticaId(null)
      setDeletedPratica(null)
    } catch (error) {
      console.error('Errore eliminazione pratica:', error)
      setDeletedPraticaId(null)
      setDeletedPratica(null)
    }
  }, [deletedPraticaId, deletedPratica, onConfirm])

  return {
    deletedPraticaId,
    deletedPratica,
    startDelete,
    cancelDelete,
    confirmDelete
  }
}
