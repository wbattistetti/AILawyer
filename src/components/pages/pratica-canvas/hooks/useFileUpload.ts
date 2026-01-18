/**
 * Hook per gestire l'upload di file nell'archivio.
 * Estratto da useArchive per modularità e ridurre la complessità.
 */

import { useCallback } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Documento, UploadProgress } from '../../../../types'
import { useDocumentStore } from '../../../../stores/documentStore'
import { ThumbnailGenerator } from '../../../../services/documents/ThumbnailGenerator'
import {
  findDocumentByCriteria,
  preserveThumbnail,
  validateFiles,
  calculateFileHash,
  isFileDuplicate
} from './useArchiveHelpers'
import { setFileReference } from '../../../../stores/documentStore/fileReferenceStore'

interface UseFileUploadProps {
  praticaId: string | undefined
  comparti: any[]
  documenti: Documento[]
  store: ReturnType<typeof useDocumentStore>
}

export function useFileUpload({ praticaId, comparti, documenti, store }: UseFileUploadProps) {
  const { toast } = useToast()

  const handleFileDrop = useCallback(async (
    files: File[],
    _compartoId?: string | null,
    target?: { type?: string; id?: string; title?: string; tags?: string[]; sourceFilePath?: string } | null
  ) => {
    // Modalità locale: non effettua upload/creazione su backend
    const localOnly = (((import.meta as any).env?.VITE_ARCHIVE_LOCAL_ONLY) ?? 'true') !== 'false'

    console.log('[HANDLE][FILEDROP][START]', {
      filesCount: files.length,
      _compartoId,
      target: target ? { type: target.type, id: target.id, title: target.title } : null,
      localOnly,
      praticaId,
      envValue: (import.meta as any).env?.VITE_ARCHIVE_LOCAL_ONLY
    })

    if (!praticaId) {
      console.warn('[HANDLE][FILEDROP] Nessuna praticaId, salto')
      return
    }

    // ✅ PASSO 0: Verifica PRIMA di tutto se il file è già associato a un cassetto (per filePath)
    // ✅ Questo evita di processare file già classificati
    if (target?.sourceFilePath && _compartoId) {
      // Cerca documento esistente per filePath (cerca sia in documenti reali che temporanei)
      const existingDoc = documenti.find(d => (d as any).filePath === target.sourceFilePath)

      if (existingDoc && existingDoc.compartoId) {
        // Il file è già associato a un cassetto
        const sourceComparto = comparti.find(c => c.id === existingDoc.compartoId)
        // ✅ Fallback: cerca anche in window.__archiveData.comparti
        let sourceCompartoNome = sourceComparto?.nome
        if (!sourceCompartoNome && existingDoc.compartoId) {
          try {
            const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; nome: string }> } | undefined
            if (archiveData?.comparti) {
              const found = archiveData.comparti.find(c => c.id === existingDoc.compartoId)
              sourceCompartoNome = found?.nome
            }
          } catch (error) {
            console.warn('⚠️ [ARCH][FILEDROP] Errore accesso archiveData:', error)
          }
        }
        // ✅ CRITICO: Se ancora non trovato, cerca anche usando il compartoId come chiave
        if (!sourceCompartoNome && existingDoc.compartoId) {
          try {
            const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
            if (archiveData?.comparti) {
              // Prova a cercare per ID
              const foundById = archiveData.comparti.find(c => c.id === existingDoc.compartoId)
              if (foundById) {
                sourceCompartoNome = foundById.nome
              } else {
                // Se non trovato per ID, potrebbe essere una chiave
                const foundByKey = archiveData.comparti.find(c => c.key === existingDoc.compartoId)
                if (foundByKey) {
                  sourceCompartoNome = foundByKey.nome
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ [ARCH][FILEDROP] Errore accesso archiveData (secondo tentativo):', error)
          }
        }
        sourceCompartoNome = sourceCompartoNome || (existingDoc.compartoId ? 'Cassetto sconosciuto' : 'Nessun cassetto')

        const targetComparto = comparti.find(c => c.id === _compartoId)

        if (targetComparto) {
          // ✅ Se è già nello stesso cassetto, non fare nulla (solo no-drop cursor, nessun dialog)
          if (existingDoc.compartoId === targetComparto.id) {
            console.log('🔄 [ARCH][FILEDROP] File già nel cassetto target, ignoro', {
              filePath: target.sourceFilePath,
              compartoId: targetComparto.id,
              filename: files[0]?.name
            })
            toast({
              title: 'Documento già presente',
              description: `Il documento è già in "${targetComparto.nome}"`
            })
            return // ✅ STOP, non processare
          }

          // ✅ CRITICO: Se è in un altro cassetto, crea miniatura ghost SENZA spostare il documento
          const preservedThumbnail = (existingDoc as any)?.thumbnailDataUrl
          store.addPendingMoveConfirmation({
            docId: existingDoc.id,
            filename: files[0]?.name || 'sconosciuto',
            sourceCompartoId: existingDoc.compartoId,
            sourceCompartoNome: sourceCompartoNome,
            targetCompartoId: targetComparto.id,
            targetCompartoNome: targetComparto.nome,
            preservedThumbnail
          })

          console.log('🔄 [ARCH][FILEDROP] Miniatura ghost creata (file già in altro cassetto) - DOCUMENTO NON SPOSTATO', {
            docId: existingDoc.id,
            sourceCompartoNome,
            targetCompartoNome: targetComparto.nome,
            filePath: target.sourceFilePath,
            existingCompartoId: existingDoc.compartoId
          })

          // ✅ STOP, non processare il file - il documento NON deve essere spostato finché non viene confermato
          return
        }
      }
    }

    // ✅ Validazione file (estratta in helper)
    const validationError = validateFiles(files)
    if (validationError) {
      try { console.warn('⚠️ [ARCH] validation failed', validationError) } catch { }
      toast({
        title: validationError.title,
        description: validationError.description,
        variant: 'destructive',
      })
      return
    }

    // Pre-dedupe
    const existingHashes = new Set((documenti.map(d => (d as any).hash).filter(Boolean) as string[]))
    const toProcess: File[] = []
    let skipped = 0

    // ✅ Deduplicazione (estratta in helper)
    for (const f of files) {
      // ✅ CRITICO: Controlla anche per sourceFilePath per evitare duplicati quando handleFileDrop viene chiamato due volte
      let dup = await isFileDuplicate(f, documenti, existingHashes)
      if (!dup && target?.sourceFilePath) {
        const existsByFilePath = documenti.some(d => (d as any).filePath === target.sourceFilePath)
        if (existsByFilePath) {
          console.log('🔄 [ARCH][DEDUPE][FILEPATH] File già presente per filePath:', target.sourceFilePath)
          dup = true
        }
      }

      if (dup) {
        skipped++
        // Se è un duplicato e sto droppando su un comparto specifico, verifica se spostare l'esistente
        if (_compartoId) {
          try {
            // ✅ Cerca il documento usando findDocumentByCriteria (helper centralizzato)
            const fileHash = await calculateFileHash(f)
            const foundResult = findDocumentByCriteria(documenti, {
              hash: fileHash || undefined,
              filePath: target?.sourceFilePath,
              filename: f.name
            })
            const found = foundResult?.doc

            const targetComparto = comparti.find(c => c.id === _compartoId)

            if (found && targetComparto) {
              // ✅ CRITICO: Se il documento è già nel target comparto, non fare nulla (evita duplicati)
              if (found.compartoId === targetComparto.id) {
                console.log('🔄 [ARCH][DEDUPE] Documento già presente nel comparto target, ignoro', {
                  docId: found.id,
                  compartoId: targetComparto.id,
                  filename: f.name
                })
                toast({
                  title: 'Documento già presente',
                  description: `Il documento "${f.name}" è già in "${targetComparto.nome}"`
                })
                continue // ✅ Esci subito, non aggiungere duplicati
              }

              // ✅ Se il documento è in un altro comparto, crea una miniatura ghost invece di chiedere conferma
              let sourceComparto = comparti.find(c => c.id === found.compartoId)
              // ✅ Fallback: cerca anche in window.__archiveData.comparti
              if (!sourceComparto && found.compartoId) {
                try {
                  const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
                  if (archiveData?.comparti) {
                    // Prova a cercare per ID
                    sourceComparto = archiveData.comparti.find(c => c.id === found.compartoId)
                    // Se non trovato per ID, potrebbe essere una chiave
                    if (!sourceComparto) {
                      sourceComparto = archiveData.comparti.find(c => c.key === found.compartoId)
                    }
                  }
                } catch (error) {
                  console.warn('⚠️ [ARCH][DEDUPE] Errore accesso archiveData:', error)
                }
              }
              if (!sourceComparto && found.compartoId) {
                console.warn('⚠️ [ARCH][DEDUPE] Comparto non trovato per documento', {
                  docId: found.id,
                  compartoId: found.compartoId,
                  compartiDisponibili: comparti.map(c => ({ id: c.id, nome: c.nome }))
                })
              }
              // ✅ CRITICO: Usa il nome del comparto se trovato, altrimenti fallback generico
              // ✅ Se ancora non trovato, cerca anche usando il compartoId come chiave
              let sourceCompartoNome = sourceComparto?.nome
              if (!sourceCompartoNome && found.compartoId) {
                // Ultimo tentativo: cerca in comparti usando compartoId come chiave
                const foundByKey = comparti.find(c => c.key === found.compartoId)
                if (foundByKey) {
                  sourceCompartoNome = foundByKey.nome
                }
              }
              sourceCompartoNome = sourceCompartoNome || (found.compartoId ? 'Cassetto sconosciuto' : 'Nessun cassetto')

              // ✅ Preserva thumbnailDataUrl
              const preservedThumbnail = (found as any).thumbnailDataUrl

              // ✅ CRITICO: Verifica che il documento sia ancora nel comparto sorgente
              // ✅ NON aggiornare il documento - deve rimanere nel cassetto sorgente finché non viene confermato
              const currentDoc = store.getDocument(found.id)
              if (currentDoc && currentDoc.compartoId !== found.compartoId) {
                console.warn('⚠️ [ARCH][DEDUPE] Documento già spostato, salto creazione ghost', {
                  docId: found.id,
                  expectedComparto: found.compartoId,
                  actualComparto: currentDoc.compartoId
                })
                continue
              }

              // ✅ Crea una miniatura ghost in attesa di conferma
              // ✅ CRITICO: Il documento NON viene aggiornato qui - rimane nel cassetto sorgente
              const confirmationKey = `${found.id}-${targetComparto.id}`
              store.addPendingMoveConfirmation({
                docId: found.id,
                filename: f.name,
                sourceCompartoId: found.compartoId,
                sourceCompartoNome: sourceCompartoNome,
                targetCompartoId: targetComparto.id,
                targetCompartoNome: targetComparto.nome,
                preservedThumbnail
              })

              console.log('🔄 [ARCH][DEDUPE] Miniatura ghost creata in attesa di conferma - DOCUMENTO NON SPOSTATO', {
                docId: found.id,
                confirmationKey,
                sourceCompartoId: found.compartoId,
                sourceCompartoNome,
                targetCompartoId: targetComparto.id,
                targetCompartoNome: targetComparto.nome,
                documentStillInSource: currentDoc?.compartoId === found.compartoId
              })
            }
          } catch (e) {
            console.warn('⚠️ [ARCH] move on duplicate failed (soft)', e)
          }
        }
        continue
      }
      toProcess.push(f)
    }

    if (skipped > 0) {
      try { console.info('ℹ️ [ARCH] duplicates skipped', { skipped, toProcess: toProcess.length }) } catch { }
      toast({ title: 'Duplicati ignorati', description: `${skipped} file già presenti non sono stati aggiunti.` })
    }

    // Scegli il comparto target coerente con createDocumento
    const resolveCompartoId = (_cid?: string | null) => {
      return (_cid && comparti.find(c => c.id === _cid)?.id)
        || comparti.find(c => c.key === 'da_classificare')?.id
        || (comparti[0]?.id ?? '')
    }
    const targetCompartoId = resolveCompartoId(_compartoId)

    // Initialize upload progress con metadati UI
    const uploads = Array.from(store.uploads.values())
    const newUploads: UploadProgress[] = toProcess.map(file => {
      const name = file.name || ''
      const filenameBase = name.replace(/\.[^.]+$/, '')
      return {
        file,
        progress: 0,
        status: 'pending',
        compartoId: targetCompartoId,
        filenameBase,
      }
    })

    // ✅ Traccia uploads anche in modalità locale per mostrare i placeholder
    for (const upload of newUploads) {
      store.addUpload(upload)
    }
    // ✅ Emetti evento ASYNC per evitare warning React
    queueMicrotask(() => {
      try {
        const allUploads = Array.from(store.uploads.values())
        window.dispatchEvent(new CustomEvent('app:uploading', {
          detail: {
            count: newUploads.length,
            target,
            uploads: allUploads,
            newUploads
          }
        }))
      } catch (e) {
        console.error('[UPLOAD][EVENT][ERROR]', e)
      }
    })

    const existingKeys = new Set(documenti.map(d => d.s3Key))

    // Process each file
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      const uploadIndex = uploads.length + i

      try {
        if (!localOnly) {
          // ✅ Trova l'upload per file e aggiornalo
          const allUploads = Array.from(store.uploads.values())
          if (uploadIndex < allUploads.length) {
            const uploadToUpdate = allUploads[uploadIndex]
            store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, { status: 'uploading', progress: 10 })
          }
          try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: Math.max(1, files.length - i), target } })) } catch { }
        }

        // ✅ PASSO 1: GENERA THUMBNAIL E CALCOLA HASH SUBITO - così l'ID è stabile fin dall'inizio
        // ✅ ECCEZIONE: Per i video, NON calcolare hash subito (lazy) e NON creare blob URL
        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')
        const isWord = file.type?.includes('wordprocessingml') ||
                       file.type?.includes('msword') ||
                       file.name.toLowerCase().endsWith('.docx') ||
                       file.name.toLowerCase().endsWith('.doc')
        const isImage = file.type?.startsWith('image/') ||
                        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)
        const isVideo = file.type?.startsWith('video/') ||
                        /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file.name)

        let thumbnailDataUrl: string | undefined = undefined
        let hasNativeTextValue: boolean | undefined = undefined
        let fileHash: string = ''
        let s3KeyLocal: string = ''
        let localUrlImmediato: string | undefined = undefined

        // ✅ PER VIDEO: ID temporaneo, NO hash, NO blob URL, solo miniatura
        if (isVideo) {
          // ✅ Genera ID temporaneo basato su metadati (NON hash)
          fileHash = '' // Hash vuoto - sarà calcolato lazy al salvataggio
          const tempId = `video:${file.name}:${file.size}:${Date.now()}`

          // ✅ Salva File reference nel fileReferenceStore (fuori dallo store Zustand)
          setFileReference(tempId, file)

          // ✅ Genera solo miniatura (usa metadati video, NON carica il file completo)
          try {
            console.log('🖼️ [THUMBNAIL][VIDEO][GENERATE][START]', {
              filename: file.name,
              size: file.size,
              type: file.type,
              tempId: tempId.substring(0, 30) + '...'
            })
            thumbnailDataUrl = await ThumbnailGenerator.generateVideoThumbnailOnly(file)
            hasNativeTextValue = false // Video non ha testo nativo

            console.log('🖼️ [THUMBNAIL][VIDEO][GENERATE][SUCCESS]', {
              filename: file.name,
              hasThumbnail: !!thumbnailDataUrl,
              thumbnailLength: thumbnailDataUrl?.length || 0
            })
          } catch (error) {
            console.error('❌ [THUMBNAIL][VIDEO][GENERATE][ERROR]', {
              name: file.name,
              error: error instanceof Error ? error.message : String(error)
            })
            // Continua comunque, senza thumbnail
          }

          // ✅ NO blob URL per video (evita caricamento in memoria)
          localUrlImmediato = undefined
          s3KeyLocal = '' // Sarà calcolato al salvataggio quando avremo l'hash
        } else {
          // ✅ PER ALTRI FILE: calcola hash subito (comportamento normale)
          console.log('🔍 [ARCH][HASH][CALC][START] Calcolo hash prima di creare documento', { filename: file.name, size: file.size })
          fileHash = await ThumbnailGenerator.calculateHash(file)
          console.log('✅ [ARCH][HASH][CALC][SUCCESS] Hash calcolato', { filename: file.name, hash: fileHash.substring(0, 16) + '...' })

          // ✅ Crea placeholder SUBITO per mostrare la miniatura immediatamente
          if (isPdf || isWord || isImage) {
            thumbnailDataUrl = ThumbnailGenerator.createPlaceholderThumbnail("Sto creando la miniatura...")
            console.log('🖼️ [THUMBNAIL][PLACEHOLDER][CREATED] Placeholder creata subito', {
              filename: file.name,
              hasPlaceholder: !!thumbnailDataUrl
            })
          }

          // ✅ PASSO 1.5: Calcola s3Key (local) e localUrl SUBITO - così sono disponibili quando creiamo il documento
          // ✅ In modalità local, s3Key può essere calcolato subito (hash + ext)
          // ✅ localUrl può essere creato subito (blob URL)
          const ext = file.name.substring(file.name.lastIndexOf('.')) || '.bin'
          s3KeyLocal = localOnly ? `${fileHash}${ext}` : '' // Se non-local, sarà popolato dopo getUploadUrl
          localUrlImmediato = URL.createObjectURL(file) // ✅ Crea blob URL SUBITO
        }

        // ✅ PASSO 2: Verifica se esiste già un documento temporaneo per questo filePath
        // ✅ CRITICO: Questo evita la creazione di duplicati quando handleFileDrop viene chiamato due volte
        const sourceFilePath = target?.sourceFilePath
        let tempDocImmediato: Documento | null = null
        let tempIdImmediato: string | null = null

        if (sourceFilePath) {
          // Cerca un documento temporaneo esistente con lo stesso filePath
          const existingTempDoc = documenti.find(d =>
            (d.id.startsWith('temp:') || d.id.startsWith('pending:')) &&
            (d as any).filePath === sourceFilePath
          )

          if (existingTempDoc) {
            console.log('🔄 [ARCH][TEMP-EXISTS] Documento temporaneo già esistente per filePath:', sourceFilePath, 'id:', existingTempDoc.id.substring(0, 30))

            // ✅ CRITICO: Se il documento è già nel target comparto, non fare nulla
            if (existingTempDoc.compartoId === targetCompartoId) {
              console.log('🔄 [ARCH][TEMP-EXISTS] Documento già nel comparto target, ignoro', {
                docId: existingTempDoc.id,
                compartoId: targetCompartoId,
                filename: file.name
              })
              continue // ✅ NON processare il file, è già nel posto giusto
            }

            // ✅ CRITICO: Se il documento è già in un altro comparto, crea miniatura ghost invece di spostarlo
            if (existingTempDoc.compartoId && existingTempDoc.compartoId !== targetCompartoId) {
              let sourceComparto = comparti.find(c => c.id === existingTempDoc.compartoId)
              // ✅ Fallback: cerca anche in window.__archiveData.comparti
              if (!sourceComparto && existingTempDoc.compartoId) {
                try {
                  const archiveData = (window as any).__archiveData as { comparti?: Array<{ id: string; key: string; nome: string }> } | undefined
                  if (archiveData?.comparti) {
                    // Prova a cercare per ID
                    sourceComparto = archiveData.comparti.find(c => c.id === existingTempDoc.compartoId) || undefined
                    // Se non trovato per ID, potrebbe essere una chiave
                    if (!sourceComparto) {
                      sourceComparto = archiveData.comparti.find(c => c.key === existingTempDoc.compartoId) || undefined
                    }
                  }
                } catch (error) {
                  console.warn('⚠️ [ARCH][TEMP-EXISTS] Errore accesso archiveData:', error)
                }
              }

              const targetComparto = comparti.find(c => c.id === targetCompartoId)
              if (targetComparto) {
                // ✅ CRITICO: Crea miniatura ghost invece di spostare - il documento NON deve essere spostato finché non viene confermato
                // ✅ Usa il nome del comparto se trovato, altrimenti fallback generico
                let sourceCompartoNome = sourceComparto?.nome
                if (!sourceCompartoNome && existingTempDoc.compartoId) {
                  // Ultimo tentativo: cerca in comparti usando compartoId come chiave
                  const foundByKey = comparti.find(c => c.key === existingTempDoc.compartoId)
                  if (foundByKey) {
                    sourceCompartoNome = foundByKey.nome
                  }
                }
                const sourceCompartoNomeFinal = sourceCompartoNome || (existingTempDoc.compartoId ? 'Cassetto sconosciuto' : 'Nessun cassetto')
                const preservedThumbnail = (existingTempDoc as any)?.thumbnailDataUrl

                // ✅ CRITICO: Verifica che il documento sia ancora nel comparto sorgente
                // ✅ NON aggiornare il documento - deve rimanere nel cassetto sorgente finché non viene confermato
                const currentTempDoc = store.getDocument(existingTempDoc.id)
                if (currentTempDoc && currentTempDoc.compartoId !== existingTempDoc.compartoId) {
                  console.warn('⚠️ [ARCH][TEMP-EXISTS] Documento temporaneo già spostato, salto creazione ghost', {
                    docId: existingTempDoc.id,
                    expectedComparto: existingTempDoc.compartoId,
                    actualComparto: currentTempDoc.compartoId
                  })
                  continue
                }

                // ✅ Crea una miniatura ghost in attesa di conferma
                // ✅ CRITICO: Il documento NON viene aggiornato qui - rimane nel cassetto sorgente
                store.addPendingMoveConfirmation({
                  docId: existingTempDoc.id,
                  filename: file.name,
                  sourceCompartoId: existingTempDoc.compartoId,
                  sourceCompartoNome: sourceCompartoNomeFinal,
                  targetCompartoId: targetComparto.id,
                  targetCompartoNome: targetComparto.nome,
                  preservedThumbnail
                })
                console.log('🔄 [ARCH][TEMP-EXISTS] Miniatura ghost creata (documento già in altro comparto) - DOCUMENTO NON SPOSTATO', {
                  docId: existingTempDoc.id,
                  sourceCompartoId: existingTempDoc.compartoId,
                  sourceCompartoNome: sourceCompartoNomeFinal,
                  targetCompartoId: targetComparto.id,
                  targetCompartoNome: targetComparto.nome,
                  documentStillInSource: currentTempDoc?.compartoId === existingTempDoc.compartoId
                })
                continue // ✅ NON processare il file, aspetta conferma - il documento NON deve essere spostato finché non viene confermato
              }
            }

            // ✅ Se non ha comparto, aggiorna normalmente (assegna il comparto)
            // ✅ MA SOLO se non è già stato trovato come duplicato sopra (nel controllo hash/filename)
            // ✅ Verifica se è già stato gestito come duplicato
            const alreadyHandledAsDuplicate = documenti.some(d => {
              if (d.id === existingTempDoc.id) return false // Non è un duplicato di se stesso
              // Verifica se esiste un documento con stesso hash o filePath che è già stato gestito
              if ((d as any).hash && (existingTempDoc as any).hash && (d as any).hash === (existingTempDoc as any).hash) {
                return d.compartoId && d.compartoId !== targetCompartoId // Se ha compartoId diverso, è stato gestito come duplicato
              }
              if ((d as any).filePath === sourceFilePath && d.compartoId && d.compartoId !== targetCompartoId) {
                return true // È stato gestito come duplicato
              }
              return false
            })

            if (alreadyHandledAsDuplicate) {
              console.log('🔄 [ARCH][TEMP-EXISTS] Documento già gestito come duplicato, ignoro', {
                docId: existingTempDoc.id,
                filename: file.name
              })
              continue // ✅ NON processare, è già stato gestito come duplicato
            }

            tempDocImmediato = existingTempDoc as Documento
            tempIdImmediato = existingTempDoc.id

            // ✅ Aggiorna compartoId solo se non ha comparto (non è già in un altro comparto - controllato sopra)
            if (targetCompartoId && !existingTempDoc.compartoId) {
              console.log('🔄 [ARCH][TEMP-UPDATE-COMPARTO] Assegno compartoId al documento temporaneo (non aveva comparto):', {
                docId: existingTempDoc.id,
                newCompartoId: targetCompartoId
              })
              // ✅ Aggiorna documento nello store
              store.updateDocument(existingTempDoc.id, { compartoId: targetCompartoId })
              // Aggiorna anche tempDocImmediato per riflettere il cambio
              tempDocImmediato = { ...tempDocImmediato, compartoId: targetCompartoId } as Documento
            }
          }
        }

        // ✅ PASSO 3: Se non esiste, crea nuovo documento temporaneo CON MINIATURA E HASH SUBITO
        // ✅ CRITICO: Usa hash COMPLETO come ID (non solo primi 16 caratteri) - ID costante per tutto il ciclo di vita
        // ✅ ECCEZIONE: Per i video, usa ID temporaneo (hash sarà calcolato lazy al salvataggio)
        if (!tempDocImmediato) {
          // ✅ PER VIDEO: usa ID temporaneo (hash sarà calcolato lazy)
          if (isVideo) {
            tempIdImmediato = `video:${file.name}:${file.size}:${Date.now()}`
          } else {
            tempIdImmediato = fileHash // ✅ ID = hash completo (64 caratteri) - SEMPRE COSTANTE
          }

          console.log('📄 [DOC-CREATE][BEFORE] Creando documento temporaneo', {
            filename: file.name,
            isVideo,
            hashPreview: fileHash ? fileHash.substring(0, 16) + '...' : 'NO-HASH',
            hashLength: fileHash.length,
            id: tempIdImmediato.substring(0, 30) + '...',
            idLength: tempIdImmediato.length,
            hasThumbnailBefore: !!thumbnailDataUrl,
            thumbnailLengthBefore: thumbnailDataUrl?.length || 0
          })

          tempDocImmediato = {
            id: tempIdImmediato,
            praticaId: praticaId!,
            compartoId: targetCompartoId,
            filename: file.name,
            mime: file.type,
            size: file.size,
            s3Key: s3KeyLocal, // ✅ Già calcolato (o vuoto se non-local/video, sarà popolato dopo)
            hash: fileHash || undefined, // ✅ Hash già calcolato nel PASSO 1 (o undefined per video)
            ocrStatus: 'pending',
            tags: [],
            createdAt: new Date().toISOString(),
            thumbnailDataUrl: thumbnailDataUrl, // ✅ INCLUDE MINIATURA SUBITO
            hasNativeText: hasNativeTextValue, // ✅ INCLUDE hasNativeText SUBITO
            localUrl: localUrlImmediato, // ✅ INCLUDE localUrl SUBITO (o undefined per video)
          } as any

          // ✅ Salva filePath se disponibile (per riferimento futuro)
          if (sourceFilePath) {
            ;(tempDocImmediato as any).filePath = sourceFilePath
          }

          console.log('📄 [DOC-CREATE][AFTER] Documento creato, prima di addDocument', {
            filename: file.name,
            id: tempDocImmediato.id.substring(0, 16) + '...',
            hasThumbnailInDoc: !!(tempDocImmediato as any).thumbnailDataUrl,
            thumbnailInDocLength: (tempDocImmediato as any).thumbnailDataUrl?.length || 0,
            thumbnailInDocType: typeof (tempDocImmediato as any).thumbnailDataUrl,
            thumbnailInDocPreview: (tempDocImmediato as any).thumbnailDataUrl?.substring(0, 50) || 'NULL',
            hashInDoc: !!(tempDocImmediato as any).hash,
            hashInDocLength: (tempDocImmediato as any).hash?.length || 0
          })

          // ✅ Aggiungi SUBITO con placeholder già inclusa
          const savedDocId = store.addDocument(tempDocImmediato!)

          console.log('💾 [STORE][ADD-DOCUMENT][CALLED] Documento aggiunto allo store', {
            filename: file.name,
            returnedDocId: savedDocId.substring(0, 16) + '...',
            returnedDocIdLength: savedDocId.length,
            expectedId: tempIdImmediato.substring(0, 16) + '...',
            idsMatch: savedDocId === tempIdImmediato
          })

          // ✅ Genera miniatura reale in background (NON bloccare l'UI)
          // ✅ CRITICO: Salva le variabili nella closure per evitare problemi di scope
          if (isPdf || isWord || isImage) {
            const fileForThumbnail = file // ✅ Copia locale per la closure
            const docIdForThumbnail = tempIdImmediato // ✅ Copia locale per la closure
            const fileHashForThumbnail = fileHash // ✅ Copia locale per la closure
            const fileTypeForThumbnail = isPdf ? 'PDF' : isWord ? 'Word' : 'Image'

            // ✅ Log immediato per verificare che la funzione asincrona venga creata
            console.log('🚀 [THUMBNAIL][BACKGROUND][INIT] Funzione asincrona creata, verrà eseguita in background', {
              filename: fileForThumbnail.name,
              docId: docIdForThumbnail?.substring(0, 16) + '...',
              fileType: fileTypeForThumbnail
            })

            // ✅ Esegui immediatamente (non aspettare)
            ;(async () => {
              console.log('▶️ [THUMBNAIL][BACKGROUND][EXEC] Funzione asincrona eseguita', {
                filename: fileForThumbnail.name,
                docId: docIdForThumbnail?.substring(0, 16) + '...'
              })

              try {
                console.log('🖼️ [THUMBNAIL][GENERATE][START][BACKGROUND]', {
                  filename: fileForThumbnail.name,
                  size: fileForThumbnail.size,
                  type: fileForThumbnail.type,
                  hashPreview: fileHashForThumbnail.substring(0, 16) + '...',
                  fileType: fileTypeForThumbnail,
                  docId: docIdForThumbnail?.substring(0, 16) + '...'
                })

                // ✅ Aggiungi timeout per evitare che la generazione blocchi indefinitamente
                const generatePromise = ThumbnailGenerator.generate(fileForThumbnail)
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout generazione miniatura (30s)')), 30000)
                )

                const result = await Promise.race([generatePromise, timeoutPromise]) as Awaited<ReturnType<typeof ThumbnailGenerator.generate>>
                const realThumbnail = result.thumbnail
                const realHasNativeText = result.hasNativeText

                console.log('🖼️ [THUMBNAIL][GENERATE][SUCCESS][BACKGROUND]', {
                  filename: fileForThumbnail.name,
                  hashPreview: fileHashForThumbnail.substring(0, 16) + '...',
                  hasThumbnail: !!realThumbnail,
                  thumbnailLength: realThumbnail?.length || 0,
                  thumbnailPreview: realThumbnail?.substring(0, 50) || 'NULL',
                  hasNativeText: realHasNativeText,
                  fileType: fileTypeForThumbnail,
                  docId: docIdForThumbnail?.substring(0, 16) + '...'
                })

                // ✅ Aggiorna il documento nello store con la miniatura reale
                if (realThumbnail && realThumbnail.length > 0 && docIdForThumbnail) {
                  // ✅ Verifica che il documento esista ancora nello store
                  const currentDocs = store.getAllDocuments()
                  const docExists = currentDocs.some(d => d.id === docIdForThumbnail)

                  console.log('🔍 [THUMBNAIL][UPDATE][CHECK] Verifica documento nello store', {
                    filename: fileForThumbnail.name,
                    docId: docIdForThumbnail.substring(0, 16) + '...',
                    docExists,
                    totalDocs: currentDocs.length
                  })

                  if (docExists) {
                    store.updateDocument(docIdForThumbnail, {
                      thumbnailDataUrl: realThumbnail,
                      hasNativeText: realHasNativeText
                    } as any)

                    console.log('✅ [THUMBNAIL][UPDATE] Miniatura reale aggiornata nello store', {
                      filename: fileForThumbnail.name,
                      docId: docIdForThumbnail.substring(0, 16) + '...',
                      thumbnailLength: realThumbnail.length
                    })
                  } else {
                    console.warn('⚠️ [THUMBNAIL][UPDATE][SKIP] Documento non trovato nello store', {
                      filename: fileForThumbnail.name,
                      docId: docIdForThumbnail.substring(0, 16) + '...',
                      allDocIds: currentDocs.map(d => d.id.substring(0, 16) + '...')
                    })
                  }
                } else {
                  console.warn('⚠️ [THUMBNAIL][UPDATE][SKIP] Miniatura o docId mancanti', {
                    filename: fileForThumbnail.name,
                    hasThumbnail: !!realThumbnail,
                    thumbnailLength: realThumbnail?.length || 0,
                    hasDocId: !!docIdForThumbnail
                  })
                }
              } catch (error) {
                console.error('❌ [THUMBNAIL][GENERATE][ERROR][BACKGROUND]', {
                  name: fileForThumbnail.name,
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  fileType: fileTypeForThumbnail,
                  docId: docIdForThumbnail?.substring(0, 16) + '...'
                })
                // Non bloccare, la placeholder rimane
              }
            })()
          }

          // ✅ SEMPLIFICATO: Non serve più rimuovere documenti pending: perché non li creiamo più
          // ✅ Il documento viene creato SUBITO nello store con hash, quindi non c'è bisogno di cleanup
        }

        if (!tempIdImmediato || !tempDocImmediato) {
          console.error('❌ [ARCH][TEMP-IMMEDIATO] Errore: tempIdImmediato o tempDocImmediato è null')
          continue
        }

        console.log('✅ [ARCH][TEMP-IMMEDIATO] Documento temporaneo creato/riutilizzato con miniatura e hash:', {
          tempId: tempIdImmediato.substring(0, 30),
          filename: file.name,
          compartoId: targetCompartoId,
          hasThumbnail: !!thumbnailDataUrl,
          hasHash: !!fileHash,
          hashPreview: fileHash.substring(0, 16) + '...',
          isReused: documenti.some(d => d.id === tempIdImmediato)
        })

        // ✅ PASSO 5: CERCA SE DOCUMENTO ESISTE GIÀ NELLO STORE (in memoria) - NON nel DB
        // ✅ Strategia "in-memory first": cerchiamo solo nello store, non nel database
        // ✅ Usa sourceFilePath già dichiarato nel PASSO 2
        const currentDocs = store.getAllDocuments()
        const existingInStore = currentDocs.find(d => {
          // Cerca per hash (più affidabile) - solo se hash disponibile
          if (fileHash && (d as any).hash === fileHash) return true
          // Cerca per filePath (per documenti dall'Explorer)
          if (sourceFilePath && (d as any).filePath === sourceFilePath) return true
          // ✅ PER VIDEO: cerca per filename + size (senza hash)
          if (isVideo && d.filename === file.name && d.size === file.size) return true
          // Cerca per filename + size (fallback per altri file)
          if (!isVideo && d.filename === file.name && d.size === file.size) return true
          return false
        })

        if (existingInStore) {
          console.log('🔄 [ARCH][DUPLICATE][IN-STORE] Documento già presente nello store (in memoria)', {
            filename: file.name,
            existingId: existingInStore.id.substring(0, 30),
            existingHash: (existingInStore as any).hash?.substring(0, 16),
            hasThumbnail: !!(existingInStore as any)?.thumbnailDataUrl
          })

          // ✅ Se il documento esistente ha un ID diverso dall'hash completo, unifichiamo all'hash completo
          // ✅ Questo risolve il problema dei documenti vecchi creati prima della correzione
          if (existingInStore.id !== fileHash && (existingInStore.id.startsWith('temp:') || existingInStore.id.startsWith('pending:'))) {
            // Il documento esistente ha un ID vecchio (temp:hash16), unifichiamo all'hash completo
            console.log('🔄 [ARCH][DUPLICATE][UNIFY-ID] Unifico ID documento esistente all\'hash completo', {
              oldId: existingInStore.id.substring(0, 30),
              newId: fileHash.substring(0, 30) + '...',
              filename: file.name
            })
            // Rimuovi il vecchio e aggiungi con nuovo ID (hash completo)
            store.removeDocument(existingInStore.id)
            store.addDocument({
              ...existingInStore,
              id: fileHash, // ✅ Usa hash completo come ID
              hash: fileHash // ✅ Assicura che hash sia presente
            })
            // Aggiorna existingInStore per usare il nuovo ID
            existingInStore.id = fileHash
          }

          // ✅ Se il documento è già nel comparto target, ignora
          if (existingInStore.compartoId === targetCompartoId) {
            console.log('🔄 [ARCH][DUPLICATE][SAME-COMPARTO] Documento già nel comparto target, ignoro', {
              docId: existingInStore.id,
              compartoId: targetCompartoId,
              filename: file.name
            })
            // Completa upload e rimuovi dopo delay
            const allUploads = Array.from(store.uploads.values())
            if (uploadIndex < allUploads.length) {
              const uploadToUpdate = allUploads[uploadIndex]
              store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, { progress: 100, status: 'completed' })
            }
            setTimeout(() => {
              const allUploadsAfter = Array.from(store.uploads.values())
              if (uploadIndex < allUploadsAfter.length) {
                const uploadToRemove = allUploadsAfter[uploadIndex]
                store.removeUploadsBy(u => u.file === uploadToRemove.file && u.status === 'completed')
              }
            }, 1500)
            continue // ✅ PASSA AL PROSSIMO FILE
          }

          // ✅ Se il documento è in un altro comparto, crea miniatura ghost (già gestito sopra nel PASSO 2)
          // ✅ Questo caso è già gestito nel controllo existingTempDoc sopra, quindi qui possiamo continuare
          continue
        }

        let uploadUrl: string
        let s3Key: string
        if (!localOnly) {
          try {
            const res = await api.getUploadUrl(file.name, file.type)
            uploadUrl = res.uploadUrl
            s3Key = res.s3Key // ✅ In modalità non-local, s3Key viene da getUploadUrl
            // collega il placeholder a questo s3Key
            const allUploadsForS3Key = Array.from(store.uploads.values())
            if (uploadIndex < allUploadsForS3Key.length) {
              const uploadToUpdate = allUploadsForS3Key[uploadIndex]
              store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, { s3Key })
            }
          } catch (e) {
            console.error('❌ [ARCH] getUploadUrl failed', { name: file.name, type: file.type, error: (e as any)?.message || e })
            throw e
          }
        } else {
          // ✅ In modalità locale, usa s3KeyLocal già calcolato
          s3Key = s3KeyLocal
        }

        // ✅ PASSO 4: Se non-local, aggiorna SOLO s3Key dopo getUploadUrl (non toccare thumbnailDataUrl!)
        // ✅ In modalità local, s3Key è già stato calcolato e incluso nel documento
        if (!localOnly) {
          // ✅ Salva thumbnail in clientThumbByS3 se disponibile
          if (thumbnailDataUrl && s3Key) {
            store.setClientThumb(s3Key, thumbnailDataUrl)
          }

          // ✅ Aggiorna SOLO s3Key (non toccare thumbnailDataUrl che è già presente)
          const currentDocsUpdated = store.getAllDocuments()
          const tempDoc = currentDocsUpdated.find(d => d.id === tempIdImmediato)

          if (tempDoc) {
            // ✅ Aggiorna SOLO s3Key, NON toccare thumbnailDataUrl
            store.updateDocument(tempIdImmediato, {
              s3Key: s3Key, // ✅ Solo s3Key, thumbnailDataUrl è già presente
              ...(sourceFilePath ? { filePath: sourceFilePath } : {})
            } as any)

            console.log('✅ [ARCH][TEMP-UPDATED] Documento aggiornato con s3Key (thumbnailDataUrl preservata)', {
              id: tempIdImmediato.substring(0, 30),
              filename: file.name,
              s3Key: s3Key.substring(0, 30),
              hasThumbnail: !!(tempDoc as any).thumbnailDataUrl
            })
          }
        } else {
          // ✅ In modalità local, salva thumbnail in clientThumbByS3 se disponibile
          if (thumbnailDataUrl && s3KeyLocal) {
            store.setClientThumb(s3KeyLocal, thumbnailDataUrl)
          }
        }
        // ✅ IMPORTANTE: marca hasTempDoc anche in modalità locale per nascondere il placeholder quando appare il documento temporaneo
        const allUploadsForTemp = Array.from(store.uploads.values())
        if (uploadIndex < allUploadsForTemp.length) {
          const uploadToUpdate = allUploadsForTemp[uploadIndex]
          store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, { hasTempDoc: true })
        }

        if (existingKeys.has(s3Key)) {
          const uploadToComplete = uploads[uploadIndex]
          const fileToRemove = uploadToComplete?.file
          const compartoIdToRemove = uploadToComplete?.compartoId

          const allUploadsForComplete = Array.from(store.uploads.values())
          if (uploadIndex < allUploadsForComplete.length) {
            const uploadToUpdate = allUploadsForComplete[uploadIndex]
            store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, { progress: 100, status: 'completed' })
          }

          // ✅ Rimuovi solo questo upload completato dopo un breve delay
          if (fileToRemove && compartoIdToRemove) {
            setTimeout(() => {
              store.removeUploadsBy(u =>
                u.file === fileToRemove &&
                u.compartoId === compartoIdToRemove &&
                u.status === 'completed'
              )
            }, 1500)
          }
          continue
        }

        // ✅ STRATEGIA "IN-MEMORY FIRST": In modalità locale, il file viene mantenuto SOLO in memoria
        // ✅ NON viene salvato nel database finché l'utente non salva esplicitamente la pratica
        // ✅ Il documento temporaneo viene aggiornato con hash, s3Key, ecc. ma rimane in memoria
        if (localOnly) {
          console.log('[HANDLE][FILEDROP][LOCAL-ONLY][IN-MEMORY]', {
            filename: file.name,
            compartoId: _compartoId,
            tempId: tempIdImmediato,
            s3Key,
            praticaId,
            nota: 'Documento mantenuto SOLO in memoria - NON salvato nel DB fino a salvataggio esplicito'
          })

          // ✅ Determina tags (per uso futuro quando verrà salvato)
          const tags: string[] = [...(target?.tags || [])]
          if (target?.type === 'drawer') {
            const key = (target.title || '').toLowerCase()
            if (tags.length === 0) {
              if (key.includes('sequestro')) tags.push('verbale_sequestro', 'verbale')
              else if (key.includes('arresto')) tags.push('verbale_arresto', 'verbale')
              else if (key.includes('verbali') || key.includes('verbale')) tags.push('verbale')
              else if (key.includes('intercett')) tags.push('intercettazioni')
              else if (key.includes('reati')) tags.push('reati')
            }
          }

          // ✅ Aggiorna il documento temporaneo nello store con tags (s3Key e localUrl sono già presenti)
          // ✅ Il documento rimane come temp: fino al salvataggio esplicito
          // ✅ L'ID è già corretto (basato su hash) quindi NON cambia
          // ✅ NON toccare thumbnailDataUrl - è già presente nel documento!
          const currentDocsForUpdate = store.getAllDocuments()
          const tempDocToUpdate = currentDocsForUpdate.find(d =>
            d.id === tempIdImmediato ||
            (fileHash && (d as any).hash === fileHash) ||
            (sourceFilePath && (d as any).filePath === sourceFilePath)
          )

          if (tempDocToUpdate) {
            // ✅ Aggiorna SOLO tags, NON toccare thumbnailDataUrl che è già presente
            store.updateDocument(tempDocToUpdate.id, {
              tags: tags,
              ...(sourceFilePath ? { filePath: sourceFilePath } : {})
              // ❌ NON includere thumbnailDataUrl, s3Key, localUrl - sono già presenti!
            } as any)

            console.log('✅ [HANDLE][FILEDROP][LOCAL-ONLY][UPDATED] Documento aggiornato con tags (thumbnailDataUrl preservata)', {
              tempId: tempIdImmediato,
              filename: file.name,
              hasThumbnail: !!(tempDocToUpdate as any).thumbnailDataUrl
            })
          } else {
            console.warn('⚠️ [HANDLE][FILEDROP][LOCAL-ONLY] Documento temporaneo non trovato per aggiornamento', {
              tempId: tempIdImmediato,
              filename: file.name,
              hash: fileHash.substring(0, 16) + '...'
            })
          }

          // ✅ Completa upload
          const allUploadsForComplete = Array.from(store.uploads.values())
          const uploadToComplete = allUploadsForComplete.find(u =>
            u.s3Key === s3KeyLocal ||
            (u.file === file) ||
            (u.compartoId === targetCompartoId && u.file?.name === file.name)
          )
          if (uploadToComplete) {
            store.findAndUpdateUpload(u =>
              (u.s3Key === s3KeyLocal && uploadToComplete.s3Key === s3KeyLocal) ||
              (u.file === file && uploadToComplete.file === file) ||
              (u.compartoId === targetCompartoId && u.file?.name === file.name && uploadToComplete.compartoId === targetCompartoId && uploadToComplete.file?.name === file.name)
            , { progress: 100, status: 'completed' })
          }

          continue // ✅ Salta la parte di upload S3 (non necessario in modalità locale)
        }

        // ✅ CODICE NON LOCALE: mantieni logica esistente per upload S3
        if (!localOnly) {
          const allUploads30 = Array.from(store.uploads.values())
          if (uploadIndex < allUploads30.length) {
            const uploadToUpdate30 = allUploads30[uploadIndex]
            store.findAndUpdateUpload(u => u.file === uploadToUpdate30.file, { progress: 30 })
          }
        }

        try {
          await api.uploadFile(uploadUrl, file)
        } catch (e) {
          console.error('❌ [ARCH] upload failed', { name: file.name, s3Key, error: (e as any)?.message || e })
          throw e
        }
        // File caricato

        if (!localOnly) {
          const allUploads60 = Array.from(store.uploads.values())
          if (uploadIndex < allUploads60.length) {
            const uploadToUpdate60 = allUploads60[uploadIndex]
            store.findAndUpdateUpload(u => u.file === uploadToUpdate60.file, { progress: 60 })
          }
        }

        // ✅ STRATEGIA "IN-MEMORY FIRST": Anche dopo upload S3, il documento rimane temporaneo nello store
        // ✅ NON viene salvato nel database finché l'utente non salva esplicitamente la pratica
        const tags: string[] = [...(target?.tags || [])]
        if (target?.type === 'drawer') {
          const key = (target.title || '').toLowerCase()
          if (tags.length === 0) {
            if (key.includes('sequestro')) tags.push('verbale_sequestro', 'verbale')
            else if (key.includes('arresto')) tags.push('verbale_arresto', 'verbale')
            else if (key.includes('verbali') || key.includes('verbale')) tags.push('verbale')
            else if (key.includes('intercett')) tags.push('intercettazioni')
            else if (key.includes('reati')) tags.push('reati')
          }
        }

        const compartoIdFinale = (_compartoId && comparti.find(c => c.id === _compartoId)?.id)
          || comparti.find(c => c.key === 'da_classificare')?.id
          || (comparti[0]?.id ?? '')

        console.log('[HANDLE][FILEDROP][NON-LOCAL][IN-MEMORY]', {
          filename: file.name,
          compartoId: compartoIdFinale,
          s3Key,
          nota: 'File caricato su S3, ma documento rimane temporaneo nello store fino a salvataggio esplicito'
        })

        existingKeys.add(s3Key)

        // ✅ Aggiorna il documento temporaneo nello store con s3Key, hash, ecc.
        // ✅ Il documento rimane come temp: fino al salvataggio esplicito
        // ✅ L'ID è già corretto (basato su hash) quindi NON cambia
        const currentDocsForFinal = store.getAllDocuments()
        const tempDocToUpdateFinal = currentDocsForFinal.find(d =>
          d.id === tempIdImmediato ||
          (fileHash && (d as any).hash === fileHash) ||
          d.s3Key === s3Key ||
          (sourceFilePath && (d as any).filePath === sourceFilePath)
        )

        if (tempDocToUpdateFinal) {
          const fileUrl = `http://localhost:3001/api/files/${encodeURIComponent(s3Key)}`

          // ✅ Aggiorna SOLO localUrl e tags, NON toccare thumbnailDataUrl che è già presente
          store.updateDocument(tempDocToUpdateFinal.id, {
            localUrl: fileUrl, // ✅ URL S3 per il file caricato
            tags: tags,
            ...(sourceFilePath ? { filePath: sourceFilePath } : {})
            // ❌ NON includere thumbnailDataUrl, s3Key, hash - sono già presenti!
          } as any)

          console.log('✅ [HANDLE][FILEDROP][NON-LOCAL][UPDATED] Documento aggiornato con localUrl (thumbnailDataUrl preservata)', {
            tempId: tempIdImmediato,
            filename: file.name,
            s3Key,
            hasThumbnail: !!(tempDocToUpdateFinal as any).thumbnailDataUrl
          })
        } else {
          console.warn('⚠️ [HANDLE][FILEDROP][NON-LOCAL] Documento temporaneo non trovato per aggiornamento', {
            tempId: tempIdImmediato,
            s3Key,
            filename: file.name,
            hash: fileHash.substring(0, 16) + '...'
          })
        }

        // ✅ Completa upload
        const allUploads80 = Array.from(store.uploads.values())
        if (uploadIndex < allUploads80.length) {
          const uploadToUpdate80 = allUploads80[uploadIndex]
          store.findAndUpdateUpload(u => u.file === uploadToUpdate80.file, { progress: 100, status: 'completed' })
        }

        const uploadToComplete = allUploads80[uploadIndex]
        const fileToRemove = uploadToComplete?.file
        const compartoIdToRemove = uploadToComplete?.compartoId

        // ✅ Rimuovi solo questo upload completato dopo un breve delay
        if (fileToRemove && compartoIdToRemove) {
          setTimeout(() => {
            store.removeUploadsBy(u =>
              u.file === fileToRemove &&
              u.compartoId === compartoIdToRemove &&
              u.status === 'completed'
            )
          }, 1500)
        }

      } catch (error) {
        console.error('Errore nell\'upload:', error)
        if (!localOnly) {
          try {
            // ✅ Rimuovi documento con s3Key corrispondente
            const allDocs = store.getAllDocuments()
            const docsToKeep = allDocs.filter(d => d.s3Key !== (s3Key as any))
            store.setDocuments(docsToKeep)
          } catch { }
          // ✅ Aggiorna upload con errore
          const allUploads = Array.from(store.uploads.values())
          if (uploadIndex < allUploads.length) {
            const uploadToUpdate = allUploads[uploadIndex]
            store.findAndUpdateUpload(u => u.file === uploadToUpdate.file, {
              status: 'error',
              error: 'Errore durante il caricamento'
            })
          }
        }
      }
    }

    if (!localOnly) {
      toast({ title: 'Upload completato', description: `${files.length} file caricati con successo.` })
      try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: 0, target } })) } catch { }
    }
    // ✅ Rimosso toast "Aggiunti in locale" - non necessario, la miniatura appare già subito

  }, [praticaId, comparti, toast, store, documenti])

  return { handleFileDrop }
}
