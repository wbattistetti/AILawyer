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
   * Helper per trovare il nome del comparto sorgente cercando in tutti i posti possibili
   * Priorità: options.comparti per ID > window.__archiveData.comparti per ID > window.__archiveData.comparti per key > options.comparti per key
   */
  private static findCompartoNome(
    compartoId: string,
    options: { comparti: Array<{ id: string; key: string; nome: string }> }
  ): string | null {
    if (!compartoId || compartoId.trim() === '') {
      return null
    }

    // Priorità 1: Cerca in options.comparti per ID
    let sourceComparto = options.comparti.find(c => c.id === compartoId)
    if (sourceComparto) {
      return sourceComparto.nome
    }

    // Priorità 2: Cerca in window.__archiveData.comparti per ID
    try {
      const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
      if (archiveData?.comparti) {
        sourceComparto = archiveData.comparti.find(c => c.id === compartoId)
        if (sourceComparto) {
          return sourceComparto.nome
        }
      }
    } catch (error) {
      console.warn('⚠️ [DRAG-DROP-SERVICE] Errore accesso archiveData:', error)
    }

    // Priorità 3: Cerca in window.__archiveData.comparti per key
    try {
      const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
      if (archiveData?.comparti) {
        sourceComparto = archiveData.comparti.find(c => c.key === compartoId)
        if (sourceComparto) {
          return sourceComparto.nome
        }
      }
    } catch (error) {
      console.warn('⚠️ [DRAG-DROP-SERVICE] Errore accesso archiveData per key:', error)
    }

    // Priorità 4: Cerca in options.comparti per key
    sourceComparto = options.comparti.find(c => c.key === compartoId)
    if (sourceComparto) {
      return sourceComparto.nome
    }

    return null
  }

  // ✅ Cache globale per i dati di drag (necessario perché durante drop, dataTransfer può essere vuoto)
  // Usa window per essere accessibile da qualsiasi evento
  private static getDragDataCache(): Map<number, { type: string; data: string; timestamp: number }> {
    if (!(window as any).__dragDataCache) {
      (window as any).__dragDataCache = new Map()
    }
    return (window as any).__dragDataCache
  }

  private static dragIdCounter = 0

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
    const dragData = this.createExplorerFileDragData(file)
    e.dataTransfer.setData(this.EXPLORER_FILE_TYPE, dragData)
    e.dataTransfer.effectAllowed = 'copy'

    // ✅ Salva i dati in cache globale (necessario perché durante drop, dataTransfer può essere vuoto)
    const dragId = this.dragIdCounter++
    const cache = this.getDragDataCache()
    cache.set(dragId, { type: this.EXPLORER_FILE_TYPE, data: dragData, timestamp: Date.now() })

    // ✅ Salva dragId anche in dataTransfer come fallback (alcuni browser lo mantengono)
    try {
      e.dataTransfer.setData('text/plain', `__dragId:${dragId}`)
    } catch {}

    // ✅ Cleanup cache dopo 10 secondi (in caso il drop non avvenga)
    setTimeout(() => {
      cache.delete(dragId)
    }, 10000)

    console.log('[DRAG-SERVICE][DRAG-START] Explorer file salvato in cache:', { dragId, fileName: file.name })

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
   * @param e Evento di drag
   * @param docId ID del documento
   * @param dragElement Elemento DOM da clonare come drag image (opzionale)
   */
  static setupDocIdDragStart(e: React.DragEvent, docId: string, dragElement?: HTMLElement) {
    e.dataTransfer.setData(this.DOC_ID_TYPE, docId)
    e.dataTransfer.effectAllowed = 'move'

    // ✅ Salva i dati in cache globale (necessario perché durante drop, dataTransfer può essere vuoto)
    const dragId = this.dragIdCounter++
    const cache = this.getDragDataCache()
    cache.set(dragId, { type: this.DOC_ID_TYPE, data: docId, timestamp: Date.now() })

    // ✅ Salva dragId anche in dataTransfer come fallback (alcuni browser lo mantengono)
    try {
      e.dataTransfer.setData('text/plain', `__dragId:${dragId}`)
    } catch {}

    // ✅ Cleanup cache dopo 10 secondi (in caso il drop non avvenga)
    setTimeout(() => {
      cache.delete(dragId)
    }, 10000)

    console.log('[DRAG-SERVICE][DRAG-START] Doc ID salvato in cache:', { dragId, docId: docId.substring(0, 20) })

    // ✅ Crea drag image clonando l'intero elemento ThumbCard
    if (dragElement) {
      try {
        // Clona l'intero elemento con tutti gli stili
        const clone = dragElement.cloneNode(true) as HTMLElement
        clone.style.position = 'absolute'
        clone.style.top = '-1000px'
        clone.style.left = '-1000px'
        clone.style.opacity = '0.8'
        clone.style.pointerEvents = 'none'
        clone.style.zIndex = '10000'
        // Mantieni le dimensioni originali
        const rect = dragElement.getBoundingClientRect()
        clone.style.width = `${rect.width}px`
        clone.style.height = `${rect.height}px`

        document.body.appendChild(clone)

        // Usa il centro dell'elemento come offset per il drag image
        const offsetX = rect.width / 2
        const offsetY = rect.height / 2
        e.dataTransfer.setDragImage(clone, offsetX, offsetY)

        // Rimuovi il clone dopo un breve delay
        setTimeout(() => {
          if (document.body.contains(clone)) {
            document.body.removeChild(clone)
          }
        }, 0)
      } catch (error) {
        console.warn('[DRAG-SERVICE][DRAG-START] Errore creazione drag image:', error)
      }
    }
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
    console.log('[DRAG-SERVICE][DROP][START] handleDrop chiamato', {
      targetCompartoId,
      types: Array.from(e.dataTransfer?.types || [])
    })

    // ✅ CRITICO: Se è un drag Dockview, NON gestire - lascia che Dockview gestisca
    const { isDockviewDrag } = await import('../utils/dragEventUtils')
    const isDockview = isDockviewDrag(e)
    console.log('[DRAG-SERVICE][DROP] isDockviewDrag result:', isDockview)

    if (isDockview) {
      console.log('[DRAG-SERVICE][DROP] ❌ Ignorato - è drag Dockview')
      return false // Lascia che Dockview gestisca
    }

    console.log('[DRAG-SERVICE][DROP] ✅ Procedo con gestione drop')
    e.preventDefault()
    e.stopPropagation()

    // ✅ PROBLEMA: Durante drop, dataTransfer.types può essere vuoto per sicurezza del browser
    // ✅ SOLUZIONE: Prova PRIMA a leggere direttamente i dati con getData(), POI usa la cache

    // ✅ PRIORITÀ 1: Prova a leggere direttamente da dataTransfer (più affidabile)
    try {
      const explorerData = e.dataTransfer.getData(this.EXPLORER_FILE_TYPE)
      if (explorerData) {
        const fileData = this.parseExplorerFileData(explorerData)
        if (fileData && options.onExplorerFile) {
          console.log('[DRAG-SERVICE][DROP] ✅ File Explorer rilevato da getData:', fileData.fileName)
          await options.onExplorerFile(fileData, targetCompartoId)
          return true
        }
      }
    } catch (err) {
      console.log('[DRAG-SERVICE][DROP] Errore lettura Explorer file data:', err)
    }

    // ✅ PRIORITÀ 2: Controlla documento esistente (spostamento tra cassetti)
    try {
      const docId = e.dataTransfer.getData(this.DOC_ID_TYPE)
      if (docId && options.onDocId) {
        console.log('[DRAG-SERVICE][DROP] ✅ Doc ID rilevato da getData:', docId)
        await options.onDocId(docId, targetCompartoId)
        return true
      }
    } catch (err) {
      console.log('[DRAG-SERVICE][DROP] Errore lettura Doc ID data:', err)
    }

    // ✅ PRIORITÀ 3: Se getData() non ha funzionato, usa la cache globale
    let dragId: number | undefined = undefined
    try {
      const textData = e.dataTransfer.getData('text/plain')
      if (textData && textData.startsWith('__dragId:')) {
        dragId = parseInt(textData.replace('__dragId:', ''), 10)
        console.log('[DRAG-SERVICE][DROP] DragId recuperato da text/plain:', dragId)
      }
    } catch {}

    // ✅ Se non trovato, cerca l'ultimo drag attivo nella cache (più recente)
    const cache = this.getDragDataCache()
    if (dragId === undefined && cache.size > 0) {
      // Trova l'entry più recente (ultimo drag avviato)
      let mostRecent: { id: number; data: { type: string; data: string; timestamp: number } } | null = null
      cache.forEach((value, id) => {
        if (!mostRecent || value.timestamp > mostRecent.data.timestamp) {
          mostRecent = { id, data: value }
        }
      })
      if (mostRecent && Date.now() - mostRecent.data.timestamp < 5000) { // Max 5 secondi fa
        dragId = mostRecent.id
        console.log('[DRAG-SERVICE][DROP] DragId recuperato dalla cache (più recente):', dragId)
      }
    }

    // ✅ Se abbiamo un dragId, recupera i dati dalla cache
    if (dragId !== undefined && cache.has(dragId)) {
      const cached = cache.get(dragId)!
      console.log('[DRAG-SERVICE][DROP] ✅ Dati recuperati dalla cache:', { dragId, type: cached.type })

      if (cached.type === this.EXPLORER_FILE_TYPE && options.onExplorerFile) {
        const fileData = this.parseExplorerFileData(cached.data)
        if (fileData) {
          console.log('[DRAG-SERVICE][DROP] ✅ File Explorer rilevato dalla cache:', fileData.fileName)
          cache.delete(dragId) // Cleanup
          await options.onExplorerFile(fileData, targetCompartoId)
          return true
        }
      }

      if (cached.type === this.DOC_ID_TYPE && options.onDocId) {
        console.log('[DRAG-SERVICE][DROP] ✅ Doc ID rilevato dalla cache:', cached.data)
        cache.delete(dragId) // Cleanup
        await options.onDocId(cached.data, targetCompartoId)
        return true
      }
    }

    // ✅ PRIORITÀ 4: Controlla file OS nativi
    if (e.dataTransfer.types.includes('Files')) {
      const files = Array.from(e.dataTransfer.files)
      if (files.length && options.onFiles) {
        console.log('[DRAG-SERVICE][DROP] ✅ File OS rilevati:', files.length)
        await options.onFiles(files, targetCompartoId)
        return true
      }
    }

    console.log('[DRAG-SERVICE][DROP] ❌ Nessun tipo di drop riconosciuto')
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

      // ✅ CRITICO: Se il documento è già nel target comparto, mostra feedback e non fare nulla (evita duplicati)
      // ✅ NON creare miniatura ghost, solo mostrare no-drop durante dragOver
      if (doc?.compartoId === targetCompartoId) {
        console.log('[DRAG-DROP-SERVICE][MOVE-DOC] ✅ Documento già nel comparto target, ignoro (no ghost, solo no-drop)', {
          docId,
          compartoId: targetCompartoId,
          compartoNome: targetComparto.nome,
          filename: doc.filename
        })
        // ✅ Emetti evento per mostrare toast (gestito da useArchive)
        window.dispatchEvent(new CustomEvent('app:duplicate-in-same-comparto', {
          detail: {
            docId,
            filename: doc.filename,
            compartoNome: targetComparto.nome
          }
        }))
        return // ✅ Esci senza creare miniatura ghost
      }

      // ✅ CRITICO: Se il documento ha un compartoId (anche se vuoto), verifica se è già classificato
      // ✅ Se il documento ha filePath, potrebbe essere già classificato tramite Explorer
      // ✅ In questo caso, NON aggiornare immediatamente, ma richiedi conferma
      const hasCompartoId = doc?.compartoId && doc.compartoId.trim() !== ''
      const hasFilePath = !!(doc as any)?.filePath

      // ✅ Se il documento è associato a un altro comparto, emetti evento per creare miniatura ghost
      if (hasCompartoId && doc.compartoId !== targetCompartoId) {
        // ✅ Usa la funzione helper per trovare il nome del comparto sorgente
        const sourceCompartoNome = this.findCompartoNome(doc.compartoId, options) || (doc.compartoId ? 'Cassetto sconosciuto' : 'Nessun cassetto')

        if (!this.findCompartoNome(doc.compartoId, options)) {
          console.warn('⚠️ [DRAG-DROP-SERVICE][MOVE-DOC] Comparto sorgente non trovato', {
            docId,
            compartoId: doc.compartoId,
            compartiDisponibili: options.comparti.map(c => ({ id: c.id, nome: c.nome }))
          })
        }

        // ✅ Emetti evento per creare miniatura ghost (gestito da useArchive)
        window.dispatchEvent(new CustomEvent('app:request-move-confirmation', {
          detail: {
            docId,
            doc,
            sourceCompartoId: doc.compartoId,
            sourceCompartoNome,
            targetCompartoId,
            targetCompartoNome: targetComparto.nome
          }
        }))

        console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Richiesta conferma spostamento (miniatura ghost)', {
          docId,
          sourceCompartoNome,
          targetCompartoNome: targetComparto.nome
        })

        return // ✅ Esci senza spostare, aspetta conferma
      }

      // ✅ CRITICO: Se il documento ha filePath ma non ha compartoId, potrebbe essere già classificato
      // ✅ Verifica se esiste un documento con lo stesso filePath che ha già un compartoId
      if (hasFilePath && !hasCompartoId) {
        try {
          const archiveData = (window as any).__archiveData as { documenti?: Array<any> } | undefined
          if (archiveData?.documenti) {
            const existingDocWithFilePath = archiveData.documenti.find((d: any) =>
              (d as any).filePath === (doc as any).filePath &&
              d.compartoId &&
              d.compartoId.trim() !== '' &&
              d.compartoId !== targetCompartoId
            )

            if (existingDocWithFilePath) {
              // ✅ Trovato documento esistente con stesso filePath e compartoId diverso
              // ✅ Richiedi conferma invece di aggiornare immediatamente
              // ✅ Usa la funzione helper per trovare il nome del comparto sorgente
              const sourceCompartoNome = this.findCompartoNome(existingDocWithFilePath.compartoId, options) || (existingDocWithFilePath.compartoId ? 'Cassetto sconosciuto' : 'Nessun cassetto')

              // ✅ Usa l'ID del documento esistente per la conferma
              const docIdToUse = existingDocWithFilePath.id

              window.dispatchEvent(new CustomEvent('app:request-move-confirmation', {
                detail: {
                  docId: docIdToUse,
                  doc: existingDocWithFilePath,
                  sourceCompartoId: existingDocWithFilePath.compartoId,
                  sourceCompartoNome,
                  targetCompartoId,
                  targetCompartoNome: targetComparto.nome
                }
              }))

              console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Richiesta conferma spostamento (documento con filePath già classificato)', {
                docId: docIdToUse,
                sourceCompartoNome,
                targetCompartoNome: targetComparto.nome,
                filePath: (doc as any).filePath
              })

              return // ✅ Esci senza spostare, aspetta conferma
            }
          }
        } catch (error) {
          console.warn('⚠️ [DRAG-DROP-SERVICE][MOVE-DOC] Errore verifica documento esistente per filePath:', error)
        }
      }

      // ✅ Preserva thumbnailDataUrl durante lo spostamento
      const preservedThumbnail = (doc as any)?.thumbnailDataUrl

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

      // ✅ Trova il comparto di origine (se esiste) per loggare il cambio
      const sourceCompartoId = doc?.compartoId

      // Aggiorna immediatamente window.__archiveData.documenti per aggiornare il conteggio
      try {
        const archiveData = (window as any).__archiveData as { documenti?: Array<any> } | undefined
        if (archiveData?.documenti) {
          // ✅ Per documenti pending, estrai filePath dall'ID se necessario
          const filePathFromId = isPendingOrTemp ? docId.replace(/^(pending|temp):/, '') : null
          const filePathToMatch = doc?.filePath || filePathFromId

          // ✅ Trova TUTTI i documenti che corrispondono (per ID o filePath per pending)
          let updatedDocumenti = archiveData.documenti.map((d: any) => {
            // ✅ Aggiorna per ID esatto, preservando thumbnailDataUrl
            if (d.id === docId) {
              return {
                ...d,
                compartoId: targetCompartoId,
                thumbnailDataUrl: preservedThumbnail || d.thumbnailDataUrl
              }
            }
            // ✅ Per documenti pending, aggiorna anche per filePath se l'ID non corrisponde
            if (isPendingOrTemp && filePathToMatch && (d as any).filePath === filePathToMatch) {
              return {
                ...d,
                compartoId: targetCompartoId,
                thumbnailDataUrl: preservedThumbnail || d.thumbnailDataUrl
              }
            }
            return d
          })

          // ✅ Se il documento non è stato trovato nell'array, aggiungilo (per documenti pending)
          if (isPendingOrTemp && !updatedDocumenti.some((d: any) => d.id === docId || (filePathToMatch && (d as any).filePath === filePathToMatch))) {
            updatedDocumenti.push({
              id: docId,
              filePath: filePathToMatch,
              filename: doc?.filename || filePathToMatch?.split(/[/\\]/).pop() || 'Unknown',
              compartoId: targetCompartoId,
              praticaId: doc?.praticaId || '',
              mime: doc?.mime || 'application/octet-stream',
              size: doc?.size || 0,
              s3Key: doc?.s3Key || '',
              hash: doc?.hash || '',
              ocrStatus: 'pending',
              tags: [],
              createdAt: doc?.createdAt || new Date().toISOString(),
              thumbnailDataUrl: preservedThumbnail
            })
          }

          archiveData.documenti = updatedDocumenti

          // ✅ Emetti app:documents-updated per aggiornare immediatamente il conteggio
          window.dispatchEvent(new CustomEvent('app:documents-updated', {
            detail: { documenti: updatedDocumenti }
          }))

          console.log('[DRAG-DROP-SERVICE][MOVE-DOC] Conteggio aggiornato immediatamente', {
            docId,
            isPendingOrTemp,
            sourceCompartoId,
            targetCompartoId,
            documentiAggiornati: updatedDocumenti.filter((d: any) => d.compartoId === targetCompartoId).length,
            documentiInSource: sourceCompartoId ? updatedDocumenti.filter((d: any) => d.compartoId === sourceCompartoId).length : 0,
            totalDocumenti: updatedDocumenti.length
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
