/**
 * Servizio centralizzato per gestire il drag-and-drop nell'applicazione.
 * Elimina duplicazioni e fornisce un'interfaccia unificata per tutti i tipi di drag-and-drop.
 */

export type ExplorerFileData = {
  fileId: string
  filePath: string
  fileName: string
}

export class DragAndDropService {
  // ✅ Costanti per i tipi di dati drag-and-drop
  static readonly EXPLORER_FILE_TYPE = 'application/x-explorer-file'
  static readonly DOC_ID_TYPE = 'application/x-doc-id'

  /**
   * Crea i dati per il drag di un file dall'Explorer
   */
  static createExplorerFileDragData(file: { id: string; path: string; name: string }): string {
    return JSON.stringify({
      fileId: file.id,
      filePath: file.path,
      fileName: file.name
    })
  }

  /**
   * Parsa i dati di drag di un file Explorer
   */
  static parseExplorerFileData(data: string): ExplorerFileData | null {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Setup drag start per file Explorer
   */
  static setupExplorerFileDragStart(e: React.DragEvent, file: { id: string; path: string; name: string }) {
    e.dataTransfer.setData(this.EXPLORER_FILE_TYPE, this.createExplorerFileDragData(file))
    e.dataTransfer.effectAllowed = 'copy'

    // Crea un'immagine di drag personalizzata
    const dragImage = document.createElement('div')
    dragImage.textContent = file.name
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  /**
   * Setup drag start per documento esistente (spostamento tra cassetti)
   */
  static setupDocIdDragStart(e: React.DragEvent, docId: string) {
    e.dataTransfer.setData(this.DOC_ID_TYPE, docId)
    e.dataTransfer.effectAllowed = 'move'
  }

  /**
   * Handler unificato per drop che gestisce tutti i tipi di drag-and-drop
   * @param e Evento di drop
   * @param targetCompartoId ID del comparto di destinazione
   * @param options Callback per gestire i diversi tipi di drop
   * @returns true se il drop è stato gestito, false altrimenti
   */
  static async handleDrop(
    e: React.DragEvent,
    targetCompartoId: string,
    options: {
      onExplorerFile?: (fileData: ExplorerFileData, compartoId: string) => Promise<void> | void
      onDocId?: (docId: string, compartoId: string) => Promise<void> | void
      onFiles?: (files: File[], compartoId: string) => Promise<void> | void
    }
  ): Promise<boolean> {
    e.preventDefault()
    e.stopPropagation()

    // 1. Controlla file Explorer
    if (e.dataTransfer.types.includes(this.EXPLORER_FILE_TYPE)) {
      const data = e.dataTransfer.getData(this.EXPLORER_FILE_TYPE)
      const fileData = this.parseExplorerFileData(data)
      if (fileData && options.onExplorerFile) {
        await options.onExplorerFile(fileData, targetCompartoId)
        return true
      }
    }

    // 2. Controlla documento esistente (spostamento tra cassetti)
    if (e.dataTransfer.types.includes(this.DOC_ID_TYPE)) {
      const docId = e.dataTransfer.getData(this.DOC_ID_TYPE)
      if (docId && options.onDocId) {
        await options.onDocId(docId, targetCompartoId)
        return true
      }
    }

    // 3. Controlla file OS nativi
    if (e.dataTransfer.types.includes('Files')) {
      const files = Array.from(e.dataTransfer.files)
      if (files.length && options.onFiles) {
        await options.onFiles(files, targetCompartoId)
        return true
      }
    }

    return false
  }

  /**
   * Helper per gestire dragOver - imposta dropEffect appropriato
   */
  static handleDragOver(e: React.DragEvent, allowedTypes?: string[]): boolean {
    const types = Array.from(e.dataTransfer.types)

    // Se sono specificati tipi consentiti, verifica che siano presenti
    if (allowedTypes && !allowedTypes.some(type => types.includes(type))) {
      return false
    }

    // Se è un file Explorer o un documento, permetti il drop
    if (types.includes(this.EXPLORER_FILE_TYPE) || types.includes(this.DOC_ID_TYPE) || types.includes('Files')) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = types.includes(this.DOC_ID_TYPE) ? 'move' : 'copy'
      return true
    }

    return false
  }

  /**
   * Helper per verificare se un evento di drag è di un tipo specifico
   */
  static isExplorerFile(e: React.DragEvent | DragEvent): boolean {
    return e.dataTransfer?.types.includes(this.EXPLORER_FILE_TYPE) ?? false
  }

  static isDocId(e: React.DragEvent | DragEvent): boolean {
    return e.dataTransfer?.types.includes(this.DOC_ID_TYPE) ?? false
  }

  static isFiles(e: React.DragEvent | DragEvent): boolean {
    return e.dataTransfer?.types.includes('Files') ?? false
  }

  /**
   * Gestisce lo spostamento standard di un documento tra cassetti.
   * Include:
   * - Chiamata API per aggiornare compartoId (solo se documento esiste nel DB)
   * - Aggiornamento immediato di window.__archiveData.documenti
   * - Emissione eventi per aggiornare conteggi
   * - Aggiornamento classificazione Explorer se filePath presente
   *
   * @param docId ID del documento da spostare
   * @param targetCompartoId ID del comparto di destinazione
   * @param options Opzioni con documenti, comparti e API
   */
  static async moveDocumentToComparto(
    docId: string,
    targetCompartoId: string,
    options: {
      documenti: Array<{ id: string; filePath?: string; [key: string]: any }>
      comparti: Array<{ id: string; key: string; nome: string }>
      api: { updateDocumento: (id: string, data: Partial<any>) => Promise<any> }
    }
  ): Promise<void> {
    try {
      console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Start', { docId, targetCompartoId })

      // ✅ Verifica se il documento è temporaneo/pending (non ancora nel database)
      const isPendingOrTemp = docId.startsWith('pending:') || docId.startsWith('temp:')

      // Trova documento: prima cerca nell'array passato, poi in window.__archiveData.documenti
      let doc = options.documenti.find(d => d.id === docId)

      // ✅ Se non trovato, cerca anche in window.__archiveData.documenti (per documenti pending creati dinamicamente)
      if (!doc) {
        try {
          const archiveData = (window as any).__archiveData as { documenti?: Array<any> } | undefined
          if (archiveData?.documenti) {
            doc = archiveData.documenti.find((d: any) => d.id === docId)
          }
        } catch (error) {
          console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore accesso archiveData:', error)
        }
      }

      // ✅ Se ancora non trovato e è un documento pending, prova a cercare per filePath
      if (!doc && isPendingOrTemp) {
        // Per ID tipo "pending:C:\path\to\file.pdf", estrai il filePath
        const filePathFromId = docId.replace(/^(pending|temp):/, '')

        // Cerca nell'array passato
        doc = options.documenti.find(d => (d as any).filePath === filePathFromId)

        // Se non trovato, cerca anche in window.__archiveData.documenti
        if (!doc) {
          try {
            const archiveData = (window as any).__archiveData as { documenti?: Array<any> } | undefined
            if (archiveData?.documenti) {
              doc = archiveData.documenti.find((d: any) => (d as any).filePath === filePathFromId)
            }
          } catch (error) {
            console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore accesso archiveData per filePath:', error)
          }
        }

        // Se ancora non trovato, crea un documento virtuale basato sul filePath
        if (!doc) {
          const fileName = filePathFromId.split(/[/\\]/).pop() || 'Unknown'
          doc = {
            id: docId,
            filePath: filePathFromId,
            filename: fileName,
            compartoId: '', // Sarà aggiornato
            praticaId: '',
            mime: 'application/octet-stream',
            size: 0,
            s3Key: '',
            hash: '',
            ocrStatus: 'pending' as const,
            tags: [],
            createdAt: new Date().toISOString()
          } as any
          console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Documento virtuale creato da filePath', { docId, filePathFromId })
        }

        console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Documento cercato per filePath', {
          docId,
          filePathFromId,
          trovato: !!doc
        })
      }

      const targetComparto = options.comparti.find(c => c.id === targetCompartoId)

      if (!targetComparto) {
        console.error('[DRAG-DROP-SERVICE][MOVE-DOC] Comparto non trovato', { targetCompartoId, compartiDisponibili: options.comparti.map(c => ({ id: c.id, key: c.key })) })
        return
      }

      if (isPendingOrTemp) {
        // ✅ Documento temporaneo: aggiorna solo in memoria, non chiamare API
        console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Documento temporaneo/pending, aggiorno solo in memoria', { docId, targetCompartoId, docTrovato: !!doc })
      } else {
        // ✅ Documento esistente nel DB: aggiorna tramite API
        try {
          await options.api.updateDocumento(docId, { compartoId: targetCompartoId })
          console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Documento aggiornato nel DB', { docId, targetCompartoId })
        } catch (error) {
          // Se l'API fallisce, continua comunque con l'aggiornamento in memoria
          console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore aggiornamento DB, continuo con aggiornamento in memoria', { docId, error })
        }
      }

      // Aggiorna immediatamente window.__archiveData.documenti per aggiornare il conteggio
      try {
        const archiveData = (window as any).__archiveData as { documenti?: Array<any> } | undefined
        if (archiveData?.documenti) {
          // ✅ Per documenti pending, cerca anche per filePath se l'ID non corrisponde
          let updatedDocumenti = archiveData.documenti.map((d: any) => {
            if (d.id === docId) {
              return { ...d, compartoId: targetCompartoId }
            }
            // ✅ Se è un documento pending e non trovato per ID, prova a cercare per filePath
            if (isPendingOrTemp && doc?.filePath && (d as any).filePath === doc.filePath) {
              return { ...d, compartoId: targetCompartoId }
            }
            return d
          })

          archiveData.documenti = updatedDocumenti

          // Emetti app:documents-updated per aggiornare immediatamente il conteggio
          window.dispatchEvent(new CustomEvent('app:documents-updated', {
            detail: { documenti: updatedDocumenti }
          }))
          console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Conteggio aggiornato immediatamente', {
            docId,
            isPendingOrTemp,
            documentiAggiornati: updatedDocumenti.filter((d: any) => d.compartoId === targetCompartoId).length
          })
        }
      } catch (error) {
        console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore aggiornamento conteggio immediato:', error)
      }

      // Aggiorna la classificazione nell'Explorer se il documento ha un filePath
      // ✅ Per documenti pending, aggiorna anche pendingFileClassifications
      if (doc?.filePath && targetComparto) {
        try {
          // ✅ Aggiorna classificazione Explorer
          const updateFn = (window as any).__updatePendingClassification
          if (updateFn && typeof updateFn === 'function') {
            updateFn(doc.filePath, {
              compartoKey: targetComparto.key,
              compartoNome: targetComparto.nome
            })
            console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Classificazione Explorer aggiornata', {
              filePath: doc.filePath,
              compartoKey: targetComparto.key
            })
          }

          // ✅ Per documenti pending, aggiorna anche pendingFileClassifications in window.__archiveData
          if (isPendingOrTemp) {
            try {
              const archiveData = (window as any).__archiveData as {
                pendingFileClassifications?: Map<string, { compartoKey: string; compartoNome: string }>
              } | undefined

              if (archiveData?.pendingFileClassifications) {
                archiveData.pendingFileClassifications.set(doc.filePath, {
                  compartoKey: targetComparto.key,
                  compartoNome: targetComparto.nome
                })
                console.log('[DRAG-DROP-SERVICE][MOVE-DOC] pendingFileClassifications aggiornato', {
                  filePath: doc.filePath,
                  compartoKey: targetComparto.key
                })
              }
            } catch (error) {
              console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore aggiornamento pendingFileClassifications:', error)
            }
          }
        } catch (error) {
          console.warn('[DRAG-DROP-SERVICE][MOVE-DOC] Errore aggiornamento classificazione Explorer:', error)
        }
      }

      // Emetti app:request-documents per ricaricare (opzionale, per sincronizzazione completa)
      try {
        window.dispatchEvent(new CustomEvent('app:request-documents'))
      } catch { }

      console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Success', { docId, targetCompartoId })
    } catch (error) {
      console.error('[DRAG-DROP-SERVICE][MOVE-DOC] Error', { docId, targetCompartoId, error })
      throw error
    }
  }
}
