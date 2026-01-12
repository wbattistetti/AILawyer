import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Documento, UploadProgress, PendingMoveConfirmation } from '../../../../types'
import { useDocumentStore } from '../../../../stores/documentStore/store'
import { useFileUpload } from './useFileUpload'
import { mergeDocumentsWithTemp } from './useArchiveHelpers'

/**
 * Hook principale per gestire l'archivio documenti
 * Integra useFileUpload per la logica di upload
 */
export function useArchive(
  praticaId: string | undefined,
  comparti: any[]
) {
  const { toast } = useToast()
  const store = useDocumentStore()

  // ✅ Usa useFileUpload per gestire l'upload dei file
  const { handleFileDrop } = useFileUpload({
    praticaId,
    comparti,
    documenti: store.getAllDocuments(),
    store
  })

  // State from store
  const documenti = store.getAllDocuments()
  const uploads = Array.from(store.uploads.values())
  const clientThumbByS3 = store.clientThumbByS3
  const pendingMoveConfirmations = store.pendingMoveConfirmations // ✅ Mantieni come Map per DocumentCollection

  // ✅ LOG DETTAGLIATO: Documenti recuperati dallo store
  useEffect(() => {
    const hashIdDocs = documenti.filter(d => /^[0-9a-f]{64}$/i.test(d.id))
    if (hashIdDocs.length > 0) {
      console.log('📚 [USE-ARCHIVE][GET-ALL-DOCUMENTS] Documenti recuperati dallo store', {
        totalDocs: documenti.length,
        hashIdDocs: hashIdDocs.length,
        hashIdDocsDetails: hashIdDocs.map(d => ({
          id: d.id.substring(0, 16) + '...',
          filename: d.filename,
          hasThumbnail: !!(d as any).thumbnailDataUrl,
          thumbnailLength: (d as any).thumbnailDataUrl?.length || 0,
          thumbnailPreview: (d as any).thumbnailDataUrl?.substring(0, 50) || 'NULL',
          hasHash: !!(d as any).hash,
          hashLength: (d as any).hash?.length || 0,
          hashPreview: (d as any).hash?.substring(0, 16) + '...' || 'NULL',
          hasS3Key: !!d.s3Key,
          s3Key: d.s3Key || 'NULL'
        }))
      })
    }
  }, [documenti])

  const [openDocumentIds, setOpenDocumentIds] = useState<Set<string>>(new Set())

  // ✅ Load documenti on mount
  useEffect(() => {
    if (!praticaId) return

    const loadDocumenti = async () => {
      try {
        console.log('[ARCH][LOAD] Caricamento documenti per praticaId:', praticaId)
        const backendDocs = await api.getDocumentiByPratica(praticaId)
        console.log('[ARCH][LOAD] Backend docs ricevuti:', backendDocs.length)

        // ✅ Merge backend docs con documenti temporanei già presenti nello store
        const currentDocs = store.getAllDocuments()
        const tempDocs = currentDocs.filter(d => d.id.startsWith('temp:') || d.id.startsWith('pending:'))
        const mergedDocs = mergeDocumentsWithTemp(backendDocs, tempDocs)

        console.log('[ARCH][LOAD] Documenti dopo merge:', {
          backend: backendDocs.length,
          temp: tempDocs.length,
          merged: mergedDocs.length
        })

        store.setDocuments(mergedDocs)
      } catch (error) {
        console.error('[ARCH][LOAD] Errore caricamento documenti:', error)
        toast({
          title: 'Errore',
          description: 'Impossibile caricare i documenti',
          variant: 'destructive'
        })
      }
    }

    loadDocumenti()
  }, [praticaId]) // ✅ Rimosso store dalla dependency array per evitare loop infiniti

  // ✅ handleFileDrop è ora gestito da useFileUpload hook (estratta per modularità)

  const handleRemoveThumb = useCallback(async (documentId: string) => {
    if (!documentId) {
      console.error('❌ [ARCH][REMOVE] documentId non fornito')
      return
    }

    const docToRemove = documenti.find(d => d.id === documentId)
    store.removeDocument(documentId)

    // Se è un documento temporaneo (locale), non chiamare l'API
    if (documentId.startsWith('temp:') || documentId.startsWith('pending:')) {
      toast({
        title: 'Documento eliminato',
        description: docToRemove?.filename || 'Documento rimosso con successo'
      })
      return
    }

    // Se è un documento reale, elimina anche dal backend
    try {
      await api.deleteDocumento(documentId)
      toast({
        title: 'Documento eliminato',
        description: docToRemove?.filename || 'Documento rimosso con successo'
      })
    } catch (error) {
      console.error('Errore eliminazione documento:', error)
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare il documento',
        variant: 'destructive'
      })
    }
  }, [documenti, store, toast])

  const handleConfirmMove = useCallback(async (confirmation: PendingMoveConfirmation) => {
    try {
      console.info('↪️ [ARCH] Conferma spostamento documento', {
        docId: confirmation.docId,
        from: confirmation.sourceCompartoId,
        to: confirmation.targetCompartoId
      })

      // ✅ Verifica se il documento è temporaneo (non ancora nel database)
      const isPendingOrTemp = confirmation.docId.startsWith('pending:') || confirmation.docId.startsWith('temp:')

      // ✅ Verifica che il documento esista nello store
      const docToUpdate = store.getDocument(confirmation.docId)
      if (!docToUpdate) {
        console.error('❌ [ARCH][CONFIRM-MOVE] Documento non trovato nello store', { docId: confirmation.docId })
        toast({
          title: 'Errore',
          description: 'Documento non trovato',
          variant: 'destructive'
        })
        // ✅ Rimuovi comunque la miniatura ghost
        const confirmationKey = `${confirmation.docId}-${confirmation.targetCompartoId}`
        store.removePendingMoveConfirmation(confirmationKey)
        return
      }

      // ✅ Aggiorna lo stato preservando la miniatura
      store.updateDocument(confirmation.docId, {
        compartoId: confirmation.targetCompartoId,
        thumbnailDataUrl: confirmation.preservedThumbnail
      } as any)

      // ✅ Se non è un documento temporaneo, chiama l'API
      if (!isPendingOrTemp) {
        await api.updateDocumento(confirmation.docId, { compartoId: confirmation.targetCompartoId })
        console.log('✅ [ARCH][CONFIRM-MOVE] API updateDocumento chiamato', { docId: confirmation.docId })
      } else {
        console.log('✅ [ARCH][CONFIRM-MOVE] Documento temporaneo, aggiornato solo in memoria', { docId: confirmation.docId })
      }

      // ✅ Rimuovi la miniatura ghost
      const confirmationKey = `${confirmation.docId}-${confirmation.targetCompartoId}`
      store.removePendingMoveConfirmation(confirmationKey)

      // ✅ Aggiorna la classificazione nell'Explorer se il documento ha un filePath
      if (docToUpdate && (docToUpdate as any).filePath) {
        try {
          const event = new CustomEvent('app:file-classification-changed', {
            detail: {
              filePath: (docToUpdate as any).filePath,
              compartoId: confirmation.targetCompartoId,
              compartoNome: confirmation.targetCompartoNome
            }
          })
          window.dispatchEvent(event)
          console.log('✅ [ARCH][CONFIRM-MOVE] Evento app:file-classification-changed emesso', { filePath: (docToUpdate as any).filePath })
        } catch (e) {
          console.error('⚠️ [ARCH][CONFIRM-MOVE] Errore emissione evento classificazione:', e)
        }
      }

      toast({
        title: 'Documento spostato',
        description: `Documento spostato da "${confirmation.sourceCompartoNome}" a "${confirmation.targetCompartoNome}"`
      })
    } catch (error) {
      console.error('❌ [ARCH][CONFIRM-MOVE] Errore:', error)
      toast({
        title: 'Errore',
        description: 'Impossibile spostare il documento',
        variant: 'destructive'
      })
    }
  }, [store, toast, praticaId])

  const handleCancelMove = useCallback((confirmation: PendingMoveConfirmation) => {
    const confirmationKey = `${confirmation.docId}-${confirmation.targetCompartoId}`
    store.removePendingMoveConfirmation(confirmationKey)
      toast({
      title: 'Spostamento annullato',
      description: 'Il documento non è stato spostato'
    })
  }, [store, toast])

  return {
    documenti,
    uploads,
    clientThumbByS3,
    pendingMoveConfirmations,
    openDocumentIds,
    setOpenDocumentIds,
    handleFileDrop,
    handleRemoveThumb,
    handleConfirmMove,
    handleCancelMove
  }
}
