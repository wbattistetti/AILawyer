import { useEffect, useRef } from 'react'
import { FileEntry } from '../types'
import { CompartiService } from '../services/CompartiService'

/**
 * Hook per gestire il drag-and-drop di file dall'Explorer ai cassetti.
 * Gestisce l'evento explorer:file-drop-to-drawer e aggiorna la classificazione.
 */
export function useExplorerDragDrop(
  files: FileEntry[],
  praticaId: string | undefined,
  handleFileClassificationChange: (fileId: string, compartoKey: string, compartoNome: string) => void
) {
  // ✅ Set per tracciare file già in elaborazione (evita duplicati)
  const processingFilesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const handleExplorerFileDrop = (event: CustomEvent) => {
      console.log('[EXPLORER][DROP] Evento ricevuto:', event.detail)
      const { fileData, drawerId } = event.detail

      if (!fileData || !drawerId) {
        console.error('[EXPLORER][DROP] Dati mancanti:', { fileData, drawerId })
        return
      }

      // ✅ CRITICO: Verifica se questo file è già in elaborazione
      const fileKey = fileData.filePath || fileData.fileId
      if (processingFilesRef.current.has(fileKey)) {
        console.log('🔄 [EXPLORER][DROP] File già in elaborazione, ignoro:', fileKey)
        return
      }

      // Trova il file nello stato
      const file = files.find(f => f.id === fileData.fileId || f.path === fileData.filePath)
      if (!file) {
        console.warn('[EXPLORER][DROP] File non trovato:', fileData, 'File disponibili:', files.map(f => ({ id: f.id, path: f.path })))
        return
      }

      console.log('[EXPLORER][DROP] File trovato:', file.name, 'drawerId:', drawerId)

      // Trova il comparto corrispondente al drawerId
      // drawerId può essere:
      // - una chiave (es. 'parti_anagrafiche') in DockWorkspaceV2
      // - un ID del database in DockWorkspaceV3
      let comparto = CompartiService.getByKey(drawerId)
      console.log('[EXPLORER][DROP] Comparto cercato per chiave:', drawerId, 'trovato:', !!comparto)

      // Se non trovato per chiave, potrebbe essere un ID - prova a cercare nei comparti globali
      if (!comparto) {
        const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
        const globalComparti = archiveData?.comparti
        console.log('[EXPLORER][DROP] Comparti globali disponibili:', globalComparti?.length || 0)
        if (globalComparti) {
          const compartoById = globalComparti.find(c => c.id === drawerId)
          console.log('[EXPLORER][DROP] Comparto cercato per ID:', drawerId, 'trovato:', !!compartoById, compartoById)
          if (compartoById) {
            // Usa la chiave del comparto trovato per ottenere i dati completi
            comparto = CompartiService.getByKey(compartoById.key)
            console.log('[EXPLORER][DROP] Comparto trovato per chiave dopo ricerca per ID:', compartoById.key, 'trovato:', !!comparto)
          }
        }
      }

      if (!comparto) {
        console.error('[EXPLORER][DROP] Comparto non trovato per drawerId:', drawerId, 'Comparti disponibili:', (window as any).__archiveData?.comparti)
        return
      }

      console.log('[EXPLORER][DROP] Comparto trovato:', comparto.nome, 'chiave:', comparto.key, 'Aggiorno classificazione file:', file.name)

      // ✅ Marca come in elaborazione
      processingFilesRef.current.add(fileKey)

      // ✅ Aggiorna la classificazione del file
      handleFileClassificationChange(file.id, comparto.key, comparto.nome)

      // ✅ NON creare documento temporaneo qui - useArchive lo creerà quando inizia l'upload
      // ✅ Il conteggio si aggiornerà quando useArchive crea il documento temporaneo (con miniatura)

      // ✅ Carica il file nel cassetto leggendolo dal filesystem (continua in background)
      const loadAndUploadFile = async () => {
        try {
          console.log('[EXPLORER][DROP] Caricamento file dal filesystem:', file.path)

          // Leggi il file dal filesystem usando l'endpoint backend
          const response = await fetch('http://localhost:3001/api/filesystem/read-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: file.path }),
          })

          if (!response.ok) {
            console.error('[EXPLORER][DROP] Impossibile leggere il file:', file.path, response.status)
            return
          }

          // Converti il blob in un File object
          const fileBlob = await response.blob()
          const mimeType = file.kind === 'pdf' ? 'application/pdf' :
                          file.kind === 'image' ? 'image/png' :
                          'application/octet-stream'
          // ✅ file.name ora contiene sempre il nome completo con estensione
          const fileObj = new File([fileBlob], file.name, {
            type: mimeType,
            lastModified: file.mtime || Date.now()
          })

          console.log('[EXPLORER][DROP] File convertito, emetto app:upload-files', {
            fileName: fileObj.name,
            fileSize: fileObj.size,
            compartoKey: comparto.key,
            compartoNome: comparto.nome
          })

          // Trova l'ID del comparto dal database
          const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
          const globalComparti = archiveData?.comparti
          const compartoId = globalComparti?.find(c => c.key === comparto.key)?.id

          if (!compartoId) {
            console.error('[EXPLORER][DROP] Comparto ID non trovato per chiave:', comparto.key, 'Comparti disponibili:', globalComparti)
            return
          }

          // Emetti l'evento per caricare il file nel cassetto
          // ✅ Passa anche il filePath originale per permettere a useArchive di trovare e aggiornare il documento temporaneo esistente
          const ev = new CustomEvent('app:upload-files', {
            detail: {
              files: [fileObj],
              target: {
                type: 'drawer',
                id: compartoId,
                title: comparto.nome
              },
              sourceFilePath: file.path // ✅ Nuovo campo: filePath originale per unificare documenti temporanei
            }
          })
          window.dispatchEvent(ev)
          console.log('[EXPLORER][DROP] Evento app:upload-files emesso con compartoId:', compartoId, 'sourceFilePath:', file.path)

          // ✅ Rimuovi dal set quando completato
          processingFilesRef.current.delete(fileKey)
        } catch (error) {
          console.error('[EXPLORER][DROP] Errore nel caricamento file:', error)
          // ✅ Rimuovi dal set anche in caso di errore
          processingFilesRef.current.delete(fileKey)
        }
      }

      // ✅ Carica il file in background
      loadAndUploadFile()
    }

    window.addEventListener('explorer:file-drop-to-drawer', handleExplorerFileDrop as EventListener)

    return () => {
      window.removeEventListener('explorer:file-drop-to-drawer', handleExplorerFileDrop as EventListener)
    }
  }, [files, praticaId, handleFileClassificationChange])
}
