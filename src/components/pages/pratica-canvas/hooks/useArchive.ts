import { useCallback, useEffect, useState, useRef } from 'react'
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

  // ✅ CRITICO: Usa selettori reattivi Zustand per aggiornamenti automatici
  const documenti = useDocumentStore(state => {
    const docs = Array.from(state.documents.values())
    // ✅ LOG rimosso: troppo verboso, eseguito ad ogni render
    return docs
  })
  const uploads = useDocumentStore(state => Array.from(state.uploads.values()))
  const clientThumbByS3 = useDocumentStore(state => state.clientThumbByS3)
  const pendingMoveConfirmations = useDocumentStore(state => state.pendingMoveConfirmations)

  // ✅ Usa useFileUpload per gestire l'upload dei file
  const { handleFileDrop } = useFileUpload({
    praticaId,
    comparti,
    documenti,
    store
  })

  // ✅ LOG DETTAGLIATO: Documenti recuperati dallo store (solo una volta, non in loop)
  const documentiRef = useRef(documenti)
  const lastLogRef = useRef<string>('')

  useEffect(() => {
    // ✅ Evita log ripetuti: confronta solo se documenti sono realmente cambiati
    const currentHash = documenti.map(d => d.id).join(',')
    if (currentHash === lastLogRef.current) return

    lastLogRef.current = currentHash
    documentiRef.current = documenti

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
        // ✅ Log rimosso per ridurre spam console
        const backendDocs = await api.getDocumentiByPratica(praticaId)

        // ✅ Merge backend docs con documenti temporanei già presenti nello store
        const currentDocs = store.getAllDocuments()
        const tempDocs = currentDocs.filter(d => d.id.startsWith('temp:') || d.id.startsWith('pending:'))
        const mergedDocs = mergeDocumentsWithTemp(backendDocs, tempDocs)

        // ✅ Log rimosso per ridurre spam console

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
    const confirmationKey = `${confirmation.docId}-${confirmation.targetCompartoId}`

    try {
      console.info('↪️ [ARCH][CONFIRM-MOVE][START] Conferma spostamento documento', {
        docId: confirmation.docId,
        from: confirmation.sourceCompartoId,
        to: confirmation.targetCompartoId,
        confirmationKey
      })

      // ✅ Verifica se il documento è temporaneo (non ancora nel database)
      // ✅ CRITICO: Un ID che è un hash completo (64 caratteri hex) indica un documento temporaneo
      // ✅ che non è ancora nel database, quindi non deve chiamare l'API
      const isHashOnly = /^[0-9a-f]{64}$/i.test(confirmation.docId) // Hash SHA-256 completo
      const isPendingOrTemp = confirmation.docId.startsWith('pending:') ||
                              confirmation.docId.startsWith('temp:') ||
                              isHashOnly

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
        store.removePendingMoveConfirmation(confirmationKey)
        console.log('✅ [ARCH][CONFIRM-MOVE] Miniatura ghost rimossa (documento non trovato)', { confirmationKey })
        return
      }

      // ✅ CRITICO: Verifica che il documento sia ancora nel comparto sorgente
      // ✅ Se non è nel comparto sorgente, potrebbe essere già stato spostato o rimosso
      if (docToUpdate.compartoId !== confirmation.sourceCompartoId) {
        console.warn('⚠️ [ARCH][CONFIRM-MOVE] Documento non è più nel comparto sorgente', {
          docId: confirmation.docId,
          expectedSource: confirmation.sourceCompartoId,
          actualComparto: docToUpdate.compartoId,
          filename: docToUpdate.filename
        })
        // ✅ Rimuovi comunque la miniatura ghost
        store.removePendingMoveConfirmation(confirmationKey)
        console.log('✅ [ARCH][CONFIRM-MOVE] Miniatura ghost rimossa (documento già spostato)', { confirmationKey })
        toast({
          title: 'Attenzione',
          description: 'Il documento è già stato spostato',
          variant: 'default'
        })
        return
      }

      console.log('✅ [ARCH][CONFIRM-MOVE] Documento trovato e nel comparto sorgente corretto', {
        docId: confirmation.docId,
        currentComparto: docToUpdate.compartoId,
        targetComparto: confirmation.targetCompartoId
      })

      // ✅ CRITICO: Aggiorna SOLO in memoria - NESSUNA chiamata API
      // ✅ Lo spostamento verrà salvato nel database solo quando si salva esplicitamente la pratica
      store.updateDocument(confirmation.docId, {
        compartoId: confirmation.targetCompartoId,
        thumbnailDataUrl: confirmation.preservedThumbnail
      } as any)
      console.log('✅ [ARCH][CONFIRM-MOVE] Documento aggiornato in memoria (salvataggio DB al salvataggio pratica)', {
        docId: confirmation.docId,
        newCompartoId: confirmation.targetCompartoId,
        hasThumbnail: !!confirmation.preservedThumbnail,
        isHashOnly,
        isTempPrefix: confirmation.docId.startsWith('temp:') || confirmation.docId.startsWith('pending:')
      })

      // ✅ Rimuovi la miniatura ghost DOPO l'aggiornamento riuscito
      store.removePendingMoveConfirmation(confirmationKey)
      console.log('✅ [ARCH][CONFIRM-MOVE] Miniatura ghost rimossa con successo', { confirmationKey })

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

      console.log('✅ [ARCH][CONFIRM-MOVE][SUCCESS] Spostamento completato con successo', {
        docId: confirmation.docId,
        from: confirmation.sourceCompartoNome,
        to: confirmation.targetCompartoNome
      })
    } catch (error) {
      console.error('❌ [ARCH][CONFIRM-MOVE][ERROR] Errore durante spostamento:', error)
      // ✅ Assicurati che la miniatura ghost venga rimossa anche in caso di errore
      store.removePendingMoveConfirmation(confirmationKey)
      console.log('✅ [ARCH][CONFIRM-MOVE] Miniatura ghost rimossa (errore)', { confirmationKey })
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

  // ✅ Listener per conferme dalla TAB (DrawerTabStrip)
  useEffect(() => {
    const handleConfirmFromTab = (e: CustomEvent) => {
      const confirmation = e.detail
      if (confirmation) {
        handleConfirmMove(confirmation)
        // Emetti evento per rimuovere ghost dalla TAB
        window.dispatchEvent(new CustomEvent('app:move-confirmed', {
          detail: { targetCompartoId: confirmation.targetCompartoId }
        }))
      }
    }

    const handleCancelFromTab = (e: CustomEvent) => {
      const confirmation = e.detail
      if (confirmation) {
        handleCancelMove(confirmation)
        // Emetti evento per rimuovere ghost dalla TAB
        window.dispatchEvent(new CustomEvent('app:move-cancelled', {
          detail: { targetCompartoId: confirmation.targetCompartoId }
        }))
      }
    }

    window.addEventListener('app:confirm-move-from-tab', handleConfirmFromTab as EventListener)
    window.addEventListener('app:cancel-move-from-tab', handleCancelFromTab as EventListener)

    return () => {
      window.removeEventListener('app:confirm-move-from-tab', handleConfirmFromTab as EventListener)
      window.removeEventListener('app:cancel-move-from-tab', handleCancelFromTab as EventListener)
    }
  }, [handleConfirmMove, handleCancelMove])

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
