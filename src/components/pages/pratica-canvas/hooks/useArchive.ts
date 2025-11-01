import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Documento, UploadProgress } from '../../../../types'
import { MAX_UPLOAD_SIZE, MAX_FILES_PER_BATCH } from '../../../../lib/constants'
import * as pdfjsLib from 'pdfjs-dist'

export function useArchive(praticaId: string | undefined, comparti: any[]) {
  const { toast } = useToast()

  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [clientThumbByS3, setClientThumbByS3] = useState<Record<string, string>>({})
  const [openDocumentIds, setOpenDocumentIds] = useState<Set<string>>(new Set())

  // Carica documenti quando cambia praticaId
  useEffect(() => {
    if (!praticaId) {
      console.log('[LOAD][DOCUMENTI][ARCHIVE] Nessuna praticaId, reset documenti')
      setDocumenti([])
      return
    }

    console.log('[LOAD][DOCUMENTI][ARCHIVE][START]', { praticaId })

    const loadDocumenti = async () => {
      try {
        const documentiData = await api.getDocumentiByPratica(praticaId)
        console.log('[LOAD][DOCUMENTI][ARCHIVE][SUCCESS]', {
          praticaId,
          count: documentiData.length,
          documentiByComparto: documentiData.reduce((acc: any, d: Documento) => {
            const compartoId = d.compartoId || 'unknown'
            if (!acc[compartoId]) acc[compartoId] = []
            acc[compartoId].push({ id: d.id, filename: d.filename })
            return acc
          }, {})
        })
        setDocumenti(documentiData)
      } catch (error) {
        console.error('[LOAD][DOCUMENTI][ARCHIVE][ERROR]', {
          praticaId,
          error
        })
      }
    }

    loadDocumenti()
  }, [praticaId])

  const handleFileDrop = useCallback(async (
    files: File[],
    _compartoId?: string | null,
    target?: { type?: string; id?: string; title?: string; tags?: string[] } | null
  ) => {
    // Modalità locale: non effettua upload/creazione su backend
    const localOnly = (((import.meta as any).env?.VITE_ARCHIVE_LOCAL_ONLY) ?? 'true') !== 'false'

    console.log('[HANDLE][FILEDROP][START]', {
      filesCount: files.length,
      praticaId,
      localOnly,
      compartoId: _compartoId,
      target
    })

    if (!praticaId) {
      console.warn('[HANDLE][FILEDROP] Nessuna praticaId, salto')
      return
    }

    // Validazione
    if (files.length > MAX_FILES_PER_BATCH) {
      try { console.warn('⚠️ [ARCH] batch too large', { count: files.length, max: MAX_FILES_PER_BATCH }) } catch { }
      toast({
        title: 'Troppi file',
        description: `Puoi caricare massimo ${MAX_FILES_PER_BATCH} file alla volta.`,
        variant: 'destructive',
      })
      return
    }

    const oversizedFiles = files.filter(file => file.size > MAX_UPLOAD_SIZE)
    if (oversizedFiles.length > 0) {
      try { console.warn('⚠️ [ARCH] oversized files', { count: oversizedFiles.length, max: MAX_UPLOAD_SIZE, names: oversizedFiles.map(f => f.name) }) } catch { }
      toast({
        title: 'File troppo grandi',
        description: `Alcuni file superano il limite di ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`,
        variant: 'destructive',
      })
      return
    }

    // Log rimosso per ridurre rumore

    // Pre-dedupe
    const existingHashes = new Set((documenti.map(d => (d as any).hash).filter(Boolean) as string[]))
    const toProcess: File[] = []
    let skipped = 0

    const digestHex = async (file: File) => {
      try {
        const buf = await file.arrayBuffer()
        const hash = await crypto.subtle.digest('SHA-256', buf)
        const b = new Uint8Array(hash)
        return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
      } catch {
        return ''
      }
    }

    for (const f of files) {
      let dup = false
      const h = await digestHex(f)
      if (h && existingHashes.has(h)) dup = true
      if (!dup && (!h || h.length === 0)) {
        const existsByNameSize = documenti.some(d => d.filename === f.name && (d as any).size === f.size)
        if (existsByNameSize) dup = true
      }
      if (dup) {
        skipped++
        // Se è un duplicato e sto droppando su un comparto specifico, prova a spostare l'esistente lì
        if (_compartoId) {
          try {
            const found = (h
              ? documenti.find(d => (d as any).hash === h)
              : documenti.find(d => d.filename === f.name && (d as any).size === f.size))
            const targetComparto = comparti.find(c => c.id === _compartoId)
            if (found && targetComparto && found.compartoId !== targetComparto.id) {
              console.info('↪️ [ARCH] duplicate found, moving existing document to target comparto', { docId: found.id, from: found.compartoId, to: targetComparto.id })
              await api.updateDocumento(found.id, { compartoId: targetComparto.id })
              setDocumenti(prev => prev.map(d => d.id === found.id ? { ...d, compartoId: targetComparto.id } as any : d))
              try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }
              toast({ title: 'Documento già presente', description: `Spostato in "${targetComparto.nome}"` })
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
    // Log rimosso per ridurre rumore

    // Scegli il comparto target coerente con createDocumento
    const resolveCompartoId = (_cid?: string | null) => {
      return (_cid && comparti.find(c => c.id === _cid)?.id)
        || comparti.find(c => c.key === 'da_classificare')?.id
        || (comparti[0]?.id ?? '')
    }
    const targetCompartoId = resolveCompartoId(_compartoId)

    // Initialize upload progress con metadati UI
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

    console.log('📤 [UPLOAD][CREATE] Creando nuovi uploads', {
      filesCount: newUploads.length,
      newUploads: newUploads.map(u => ({
        filename: u.file?.name || u.filenameBase,
        compartoId: u.compartoId,
        status: u.status,
        hasTempDoc: u.hasTempDoc
      })),
      targetCompartoId,
      localOnly
    })

    // ✅ Traccia uploads anche in modalità locale per mostrare i placeholder
    setUploads(prev => {
      const updated = [...prev, ...newUploads]
      console.log('📤 [UPLOAD][SET-UPLOADS] Aggiornando uploads array', {
        prevCount: prev.length,
        newCount: updated.length,
        allUploads: updated.map((u, idx) => ({
          idx,
          filename: u.file?.name || u.filenameBase,
          compartoId: u.compartoId,
          status: u.status,
          progress: u.progress,
          hasTempDoc: u.hasTempDoc,
          s3Key: u.s3Key
        }))
      })
      // ✅ Emetti evento ASYNC per evitare warning React
      queueMicrotask(() => {
        try {
          console.log('📤 [UPLOAD][EVENT] Emettendo app:uploading', {
            count: newUploads.length,
            target,
            uploadsCount: updated.length,
            uploadsSummary: updated.map(u => ({
              filename: u.file?.name || u.filenameBase,
              compartoId: u.compartoId,
              status: u.status,
              progress: u.progress
            }))
          })
          window.dispatchEvent(new CustomEvent('app:uploading', {
            detail: {
              count: newUploads.length,
              target,
              uploads: updated, // ✅ Passa gli uploads aggiornati (prev + nuovi)
              newUploads // ✅ Passa anche i nuovi uploads
            }
          }))
        } catch (e) {
          console.error('📤 [UPLOAD][EVENT][ERROR] Errore emettendo evento', e)
        }
      })
      return updated
    })

    // Helper: generate client-side PDF first-page thumb
    const generateClientPdfThumb = async (file: File, targetW = 300): Promise<string> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const task = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await task.promise
        const page = await pdf.getPage(1)
        const vp1 = page.getViewport({ scale: 1 })
        const scale = targetW / vp1.width
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx as any, viewport }).promise
        return canvas.toDataURL('image/png')
      } catch {
        return ''
      }
    }

    // Helper: detect native text in PDF (same logic as backend)
    const detectNativeTextClient = async (file: File): Promise<boolean> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const task = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await task.promise
        const page = await pdf.getPage(1)
        const textContent = await page.getTextContent()
        const textItemCount = textContent.items.length

        // Same heuristic as backend: > 10 text items = native text
        const hasNativeText = textItemCount > 10

        return hasNativeText
      } catch (error) {
        console.warn('[DETECT][client][native-text][ERROR]', { filename: file.name, error })
        return false // Safe default
      }
    }

    const existingKeys = new Set(documenti.map(d => d.s3Key))

    // Process each file
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      const uploadIndex = uploads.length + i

      try {
        if (!localOnly) {
          setUploads(prev => prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, status: 'uploading', progress: 10 } : upload
          ))
          try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: Math.max(1, files.length - i), target } })) } catch { }
        }

        let uploadUrl: string
        let s3Key: string
        if (!localOnly) {
          try {
            const res = await api.getUploadUrl(file.name, file.type)
            uploadUrl = res.uploadUrl
            s3Key = res.s3Key
            // collega il placeholder a questo s3Key
            setUploads(prev => prev.map((u, idx) => idx === uploadIndex ? { ...u, s3Key } : u))
          } catch (e) {
            console.error('❌ [ARCH] getUploadUrl failed', { name: file.name, type: file.type, error: (e as any)?.message || e })
            throw e
          }
        } else {
          s3Key = `local:${Date.now()}:${Math.random().toString(36).slice(2)}`
        }

        // Inserimento ottimistico immediato: documento temporaneo visibile da subito
        const tempId = `temp:${s3Key}`
        const blobUrl = URL.createObjectURL(file)
        const tempDoc: Documento = {
          id: tempId,
          praticaId: praticaId!,
          compartoId: targetCompartoId,
          filename: file.name,
          mime: file.type,
          size: file.size,
          s3Key,
          hash: '',
          ocrStatus: 'pending',
          tags: [],
          createdAt: new Date().toISOString(),
          hasNativeText: undefined, // Non ancora determinato - aspetta la lettura della prima pagina
        } as any
          // In modalità locale, usa il blob URL temporaneamente, poi sarà sostituito con l'URL fisico
          ; (tempDoc as any).localUrl = blobUrl

        setDocumenti(prev => {
          const updated = [...prev, tempDoc] // ✅ Inserisce alla fine per mantenere ordine cronologico
          console.log('📄 [DOCUMENT][CREATE-TEMP] Creato documento temporaneo', {
            tempId,
            s3Key,
            filename: tempDoc.filename,
            compartoId: tempDoc.compartoId,
            prevCount: prev.length,
            updatedCount: updated.length,
            hasLocalUrl: !!(tempDoc as any).localUrl
          })
          // ✅ Emetti evento ASYNC per evitare warning React "Cannot update a component while rendering a different component"
          queueMicrotask(() => {
            try {
              console.log('📄 [DOCUMENT][EVENT] Emettendo app:documents-updated', {
                documentiCount: updated.length,
                lastDoc: {
                  id: tempDoc.id,
                  filename: tempDoc.filename,
                  compartoId: tempDoc.compartoId,
                  s3Key: tempDoc.s3Key
                }
              })
              window.dispatchEvent(new CustomEvent('app:documents-updated', {
                detail: { documenti: updated }
              }))
            } catch (e) {
              console.error('📄 [DOCUMENT][EVENT][ERROR] Errore emettendo evento', e)
            }
          })
          return updated
        })
        // ✅ IMPORTANTE: marca hasTempDoc anche in modalità locale per nascondere il placeholder quando appare il documento temporaneo
        setUploads(prev => prev.map((u, idx) => idx === uploadIndex ? { ...u, hasTempDoc: true } : u))
        // Log rimosso per ridurre rumore

        if (existingKeys.has(s3Key)) {
          const uploadToComplete = uploads[uploadIndex]
          const fileToRemove = uploadToComplete?.file
          const compartoIdToRemove = uploadToComplete?.compartoId

          console.log('⚡ [UPLOAD][SKIP-DUPLICATE] File già esistente, completando upload', {
            uploadIndex,
            filename: fileToRemove?.name,
            compartoId: compartoIdToRemove,
            s3Key,
            uploadStatus: uploadToComplete?.status,
            uploadProgress: uploadToComplete?.progress
          })

          setUploads(prev => {
            const updated = prev.map((upload, idx) =>
              idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
            )
            console.log('⚡ [UPLOAD][SKIP-DUPLICATE][SET-UPLOADS] Aggiornato a completed', {
              uploadIndex,
              allUploads: updated.map((u, i) => ({
                idx: i,
                filename: u.file?.name || u.filenameBase,
                status: u.status,
                progress: u.progress,
                compartoId: u.compartoId
              }))
            })
            return updated
          })

          // ✅ Rimuovi solo questo upload completato dopo un breve delay
          if (fileToRemove && compartoIdToRemove) {
            const timeoutId = setTimeout(() => {
              console.log('🗑️ [UPLOAD][REMOVE] Rimuovendo upload completato', {
                filename: fileToRemove.name,
                compartoId: compartoIdToRemove
              })
              setUploads(prev => {
                const beforeCount = prev.length
                const filtered = prev.filter(u => {
                  // Rimuovi solo se è lo stesso file nello stesso comparto
                  const shouldRemove = !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
                  return shouldRemove
                })
                console.log('🗑️ [UPLOAD][REMOVE][DONE] Upload rimosso', {
                  beforeCount,
                  afterCount: filtered.length,
                  removed: beforeCount - filtered.length,
                  remaining: filtered.map((u, i) => ({
                    idx: i,
                    filename: u.file?.name || u.filenameBase,
                    status: u.status,
                    compartoId: u.compartoId
                  }))
                })
                return filtered
              })
            }, 1500)
            console.log('⏰ [UPLOAD][REMOVE][SCHEDULED] Timeout schedulato', {
              timeoutMs: 1500,
              filename: fileToRemove.name
            })
          }
          continue
        }

        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')

        // Per PDF in modalità locale: aspetta generazione thumbnail + rilevamento testo nativo PRIMA di salvare
        let pdfProcessingResult: { dataUrl?: string; hasNativeText: boolean } | null = null
        if (isPdf && localOnly) {
          try {
            const [dataUrl, hasNativeText] = await Promise.all([
              generateClientPdfThumb(file, 220),
              detectNativeTextClient(file)
            ])

            pdfProcessingResult = { dataUrl, hasNativeText }

            console.log('[THUMBNAIL][GENERATION]', {
              filename: file.name,
              s3Key: s3Key.substring(0, 30) + '...',
              hasThumbnail: !!dataUrl,
              hasNativeText // ⚠️ VALORE CRITICO PER IL PROBLEMA
            })

            if (dataUrl) {
              setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
            }

            // Update document with native text detection result AND thumbnail
            setDocumenti(prev => {
              const next = [...prev]
              const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
              if (idxTemp >= 0) {
                next[idxTemp] = {
                  ...next[idxTemp],
                  hasNativeText,
                  thumbnailDataUrl: dataUrl || undefined // Salva thumbnail per salvataggio nel DB
                }
                console.log('[THUMBNAIL][STATE][UPDATED]', {
                  filename: file.name,
                  s3Key: s3Key.substring(0, 30) + '...',
                  hasNativeText: next[idxTemp].hasNativeText, // ⚠️ VALORE CRITICO
                  hasThumbnail: !!(next[idxTemp] as any).thumbnailDataUrl
                })
                return next
              }
              return next
            })
          } catch (error) {
            console.error('⚠️ [ARCH] PDF processing failed', { name: file.name, error, s3Key, tempId })
            pdfProcessingResult = { hasNativeText: false } // Fallback in caso di errore
          }
        } else if (isPdf && !localOnly) {
          // Per PDF non-local: genera in background (non bloccare)
          Promise.all([
            generateClientPdfThumb(file, 220),
            detectNativeTextClient(file)
          ]).then(([dataUrl, hasNativeText]) => {
            if (dataUrl) {
              setUploads(prev => prev.map((upload, idx) => idx === uploadIndex ? { ...upload, preview: dataUrl } : upload))
              setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
            }

            setDocumenti(prev => {
              const next = [...prev]
              const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
              if (idxTemp >= 0) {
                next[idxTemp] = {
                  ...next[idxTemp],
                  hasNativeText,
                  thumbnailDataUrl: dataUrl || undefined
                }
                return next
              }
              return next
            })
          }).catch((error) => {
            console.error('⚠️ [ARCH] PDF processing failed', { name: file.name, error, s3Key, tempId })
          })
        }

        // In modalità locale, copia file in uploads/ subito per garantire persistenza dopo refresh
        // Il blob URL rimane per preview immediato, ma il file fisico è disponibile per OCR
        if (localOnly) {
          console.log('[SAVE][FILE][REFERENCE]', {
            filename: file.name,
            s3Key,
            note: 'File copiato in uploads/ per persistenza (modalità privacy, ma file locale su stessa macchina)'
          })

          // Upload immediato in uploads/ per garantire che OCR funzioni anche dopo refresh
          try {
            const localUploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(s3Key)}`
            await api.uploadFile(localUploadUrl, file)
            console.log('[SAVE][FILE][UPLOADED]', {
              filename: file.name,
              s3Key,
              size: file.size
            })
          } catch (uploadError) {
            console.error('[SAVE][FILE][UPLOAD][ERROR]', {
              filename: file.name,
              s3Key,
              error: uploadError
            })
            // Continua comunque - il blob URL funziona per il viewer
          }

          // ✅ IMPORTANTE: anche in modalità locale, salva il record nel database!
          // Determina tags
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

          console.log('[SAVE][DOCUMENTO][ARCHIVE][LOCAL][START]', {
            filename: file.name,
            praticaId,
            compartoId: compartoIdFinale,
            s3Key,
            localOnly: true,
            targetCompartoId: _compartoId
          })

           try {
             // Ottieni hasNativeText e thumbnail
             // Per PDF: usa il risultato della Promise che abbiamo appena completato
             // Per non-PDF o non-local: leggi dallo stato
             let hasNativeTextValue: boolean
             let thumbnailDataUrl: string | undefined

             if (isPdf && pdfProcessingResult) {
               // Usa il risultato della Promise completata
               hasNativeTextValue = pdfProcessingResult.hasNativeText
               thumbnailDataUrl = pdfProcessingResult.dataUrl || undefined
             } else {
               // Per non-PDF o modalità non-local: leggi dallo stato
               const currentDocs = documenti
               const tempDoc = currentDocs.find(d => d.id === tempId || d.s3Key === s3Key)
               hasNativeTextValue = (tempDoc as any)?.hasNativeText || false
               thumbnailDataUrl = (tempDoc as any)?.thumbnailDataUrl || undefined
             }

             console.log('🔍 [SAVE][BEFORE]', {
               filename: file.name,
               s3Key: s3Key.substring(0, 30) + '...',
               hasNativeTextValue, // ⚠️ VALORE CHE STIAMO PER INVIARE
               fromPdfProcessing: isPdf && !!pdfProcessingResult, // Indica se viene da Promise completata
               hasThumbnail: !!thumbnailDataUrl
             })

              // Cerca di ottenere filePath se disponibile (File System Access API)
              let filePath: string | undefined = undefined

              // Verifica se il file ha una proprietà webkitRelativePath (usato quando si seleziona una directory)
              if ((file as any).webkitRelativePath) {
                // Questo non è il path completo, ma potrebbe essere utile in futuro
                // Per ora lo ignoriamo perché non è un path assoluto
              }

              // Nota: Nel drag & drop normale, il browser non fornisce il path per motivi di sicurezza.
              // Il filePath può essere ottenuto solo tramite File System Access API (showOpenFilePicker),
              // che richiede un'interazione esplicita dell'utente. Per ora, salveremo undefined.
              // In futuro, possiamo aggiungere un file picker opzionale che usa File System Access API
              // per ottenere il path e salvarlo insieme al file.

              const documento = await api.createDocumento({
                praticaId,
                compartoId: compartoIdFinale,
                filename: file.name,
                mime: file.type,
                size: file.size,
                s3Key,
                hash: '', // Il backend calcolerà l'hash dal file
                ocrStatus: 'pending',
                tags,
                thumbnailDataUrl, // Salva thumbnail nel database
                hasNativeText: hasNativeTextValue, // Passa hasNativeText esplicitamente
                filePath, // Path originale se disponibile
              })

            console.log('✅ [SAVE][SUCCESS]', {
              filename: documento.filename,
              docId: documento.id.substring(0, 20) + '...',
              hasNativeText: (documento as any).hasNativeText, // ⚠️ VALORE SALVATO NEL DB
              sentHasNativeText: hasNativeTextValue, // ⚠️ VALORE CHE ABBIAMO INVIATO
              hasThumbnail: !!(documento as any).thumbnailDataUrl
            })

            // ✅ In modalità locale, completa e rimuovi l'upload dopo il salvataggio
            // ✅ Usa setUploads in modo funzionale per leggere lo stato corrente
            setUploads(prev => {
              console.log('🔍 [UPLOAD][COMPLETE][LOCAL][DEBUG] Cercando upload da completare', {
                prevCount: prev.length,
                allUploads: prev.map((u, idx) => ({
                  idx,
                  filename: u.file?.name || u.filenameBase,
                  compartoId: u.compartoId,
                  status: u.status,
                  s3Key: u.s3Key
                })),
                targetS3Key: s3Key,
                targetFile: file.name,
                targetCompartoId: compartoIdFinale
              })

              // ✅ Cerca l'upload usando criteri multipli (s3Key, file, compartoId + filename)
              const uploadIdx = prev.findIndex(u =>
                u.s3Key === s3Key ||
                (u.file === file) ||
                (u.compartoId === compartoIdFinale &&
                 (u.file?.name === file.name || u.filenameBase === file.name.replace(/\.[^.]+$/, '')) &&
                 u.status !== 'completed' &&
                 u.status !== 'error')
              )

              if (uploadIdx < 0) {
                console.warn('⚠️ [UPLOAD][COMPLETE][LOCAL] Upload non trovato', {
                  uploadsCount: prev.length,
                  targetS3Key: s3Key,
                  targetFile: file.name,
                  targetCompartoId: compartoIdFinale
                })
                return prev // Nessun upload trovato, non cambiare nulla
              }

              const uploadToComplete = prev[uploadIdx]
              console.log('✅ [UPLOAD][COMPLETE][LOCAL] Upload trovato e completato', {
                uploadIdx,
                filename: uploadToComplete.file?.name || uploadToComplete.filenameBase,
                compartoId: uploadToComplete.compartoId,
                s3Key: uploadToComplete.s3Key
              })

              const updated = prev.map((upload, idx) =>
                idx === uploadIdx ? { ...upload, progress: 100, status: 'completed' } : upload
              )

              console.log('✅ [UPLOAD][COMPLETE][LOCAL][SET-UPLOADS] Aggiornato a completed', {
                uploadIdx,
                allUploads: updated.map((u, i) => ({
                  idx: i,
                  filename: u.file?.name || u.filenameBase,
                  status: u.status,
                  progress: u.progress,
                  compartoId: u.compartoId,
                  hasTempDoc: u.hasTempDoc
                }))
              })

              // ✅ Rimuovi l'upload completato dopo un breve delay
              const fileToRemove = uploadToComplete.file
              const compartoIdToRemove = uploadToComplete.compartoId

              if (fileToRemove && compartoIdToRemove) {
                setTimeout(() => {
                  console.log('🗑️ [UPLOAD][REMOVE][LOCAL] Rimuovendo upload completato', {
                    filename: fileToRemove.name,
                    compartoId: compartoIdToRemove
                  })
                  setUploads(prevUploads => {
                    const beforeCount = prevUploads.length
                    const filtered = prevUploads.filter(u => {
                      const shouldRemove = !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
                      return shouldRemove
                    })
                    console.log('🗑️ [UPLOAD][REMOVE][LOCAL][DONE] Upload rimosso', {
                      beforeCount,
                      afterCount: filtered.length,
                      removed: beforeCount - filtered.length
                    })
                    return filtered
                  })
                }, 1500)
              }

              return updated
            })

            // Sostituisci il documento temporaneo con quello reale
            // Mantieni blob URL (non fisico) - il file sarà caricato on-demand per OCR
            setDocumenti(prev => {
              const next = [...prev]
              const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
              if (idxTemp >= 0) {
                // Mantieni blob URL originale, non fisico
                const existingBlobUrl = (next[idxTemp] as any).localUrl || blobUrl
                next[idxTemp] = {
                  ...documento,
                  localUrl: existingBlobUrl, // Mantieni blob URL, non fisico
                  hasNativeText: hasNativeTextValue,
                  // Aggiungi riferimento al File originale per upload on-demand
                  _sourceFile: file // Salva riferimento al file per upload on-demand
                } as any
                return next
              }
              return next
            })

            // Ricarica documenti per assicurarsi che tutto sia sincronizzato
            try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }
          } catch (e) {
            console.error('[SAVE][DOCUMENTO][ARCHIVE][LOCAL][ERROR]', {
              filename: file.name,
              praticaId,
              compartoId: compartoIdFinale,
              s3Key,
              error: (e as any)?.message || e,
              stack: (e as any)?.stack
            })
            // Non bloccare - il documento temporaneo rimane visibile
          }

          continue // Salta la parte di upload S3
        }

        if (!localOnly) {
          setUploads(prev => prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, progress: 30 } : upload
          ))
        }

        try {
          await api.uploadFile(uploadUrl, file)
        } catch (e) {
          console.error('❌ [ARCH] upload failed', { name: file.name, s3Key, error: (e as any)?.message || e })
          throw e
        }
        // File caricato

        if (!localOnly) {
          setUploads(prev => prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, progress: 60 } : upload
          ))
        }

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

        let documento
        const compartoIdFinale = (_compartoId && comparti.find(c => c.id === _compartoId)?.id)
          || comparti.find(c => c.key === 'da_classificare')?.id
          || (comparti[0]?.id ?? '')

        console.log('[SAVE][DOCUMENTO][ARCHIVE][START]', {
          filename: file.name,
          praticaId,
          compartoId: compartoIdFinale,
          s3Key,
          localOnly,
          targetCompartoId: _compartoId
        })

        try {
          // Ottieni thumbnail dal documento temporaneo se disponibile
          const currentDocs = documenti
          const tempDoc = currentDocs.find(d => d.id === tempId || d.s3Key === s3Key)
          const thumbnailDataUrl = (tempDoc as any)?.thumbnailDataUrl || undefined
          const hasNativeTextValueNonLocal = (tempDoc as any)?.hasNativeText || false

          console.log('🔍 [SAVE][NON-LOCAL][BEFORE]', {
            filename: file.name,
            s3Key: s3Key.substring(0, 30) + '...',
            hasNativeTextValue: hasNativeTextValueNonLocal, // ⚠️ VALORE CRITICO
            hasThumbnail: !!thumbnailDataUrl
          })

          documento = await api.createDocumento({
            praticaId,
            compartoId: compartoIdFinale,
            filename: file.name,
            mime: file.type,
            size: file.size,
            s3Key,
            hash: '',
            ocrStatus: 'pending',
            tags,
            thumbnailDataUrl, // Salva thumbnail nel database
            hasNativeText: hasNativeTextValueNonLocal, // Passa hasNativeText esplicitamente
          })

          console.log('✅ [SAVE][NON-LOCAL][SUCCESS]', {
            filename: documento.filename,
            docId: documento.id.substring(0, 20) + '...',
            hasNativeText: (documento as any).hasNativeText, // ⚠️ VALORE SALVATO
            sentHasNativeText: hasNativeTextValueNonLocal // ⚠️ VALORE INVIATO
          })
        } catch (e) {
          console.error('[SAVE][DOCUMENTO][ARCHIVE][ERROR]', {
            name: file.name,
            s3Key,
            praticaId,
            compartoId: compartoIdFinale,
            error: (e as any)?.message || e,
            stack: (e as any)?.stack
          })
          throw e
        }
        // Documento creato

        existingKeys.add(s3Key)

        setUploads(prev => prev.map((upload, idx) =>
          idx === uploadIndex ? { ...upload, progress: 80, status: 'processing' } : upload
        ))

        const uploadToComplete = uploads[uploadIndex]
        const fileToRemove = uploadToComplete?.file
        const compartoIdToRemove = uploadToComplete?.compartoId

        console.log('✅ [UPLOAD][COMPLETE] Upload completato con successo', {
          uploadIndex,
          filename: fileToRemove?.name || uploadToComplete?.filenameBase,
          compartoId: compartoIdToRemove,
          s3Key,
          uploadStatus: uploadToComplete?.status,
          uploadProgress: uploadToComplete?.progress
        })

        setUploads(prev => {
          const updated = prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
          )
          console.log('✅ [UPLOAD][COMPLETE][SET-UPLOADS] Aggiornato a completed', {
            uploadIndex,
            allUploads: updated.map((u, i) => ({
              idx: i,
              filename: u.file?.name || u.filenameBase,
              status: u.status,
              progress: u.progress,
              compartoId: u.compartoId,
              hasTempDoc: u.hasTempDoc
            }))
          })
          return updated
        })

        // ✅ Rimuovi solo questo upload completato dopo un breve delay
        if (fileToRemove && compartoIdToRemove) {
          const timeoutId = setTimeout(() => {
            console.log('🗑️ [UPLOAD][REMOVE] Rimuovendo upload completato', {
              filename: fileToRemove.name,
              compartoId: compartoIdToRemove
            })
            setUploads(prev => {
              const beforeCount = prev.length
              const filtered = prev.filter(u => {
                // Rimuovi solo se è lo stesso file nello stesso comparto
                const shouldRemove = !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
                return shouldRemove
              })
              console.log('🗑️ [UPLOAD][REMOVE][DONE] Upload rimosso', {
                beforeCount,
                afterCount: filtered.length,
                removed: beforeCount - filtered.length,
                remaining: filtered.map((u, i) => ({
                  idx: i,
                  filename: u.file?.name || u.filenameBase,
                  status: u.status,
                  compartoId: u.compartoId
                }))
              })
              return filtered
            })
          }, 1500)
          console.log('⏰ [UPLOAD][REMOVE][SCHEDULED] Timeout schedulato', {
            timeoutMs: 1500,
            filename: fileToRemove.name
          })
        }

        // Sostituisci il documento temporaneo con quello reale
        setDocumenti(prev => {
          const next = [...prev]
          const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
          if (idxTemp >= 0) {
            // In modalità non locale, usa URL fisico (S3 o uploads/)
            // In modalità locale, mantieni blob URL (file caricato on-demand per OCR)
            const fileUrl = localOnly
              ? (next[idxTemp] as any).localUrl // Mantieni blob URL se localOnly
              : `http://localhost:3001/api/files/${encodeURIComponent(s3Key)}` // URL fisico per non-local
            // Mantieni hasNativeText se già rilevato lato client
            const existingHasNativeText = (next[idxTemp] as any).hasNativeText
            next[idxTemp] = { ...(documento as any), localUrl: fileUrl, hasNativeText: existingHasNativeText }
            return next
          }
          return [documento, ...prev]
        })
        try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch { }

      } catch (error) {
        console.error('Errore nell\'upload:', error)
        if (!localOnly) {
          try { setDocumenti(prev => prev.filter(d => d.s3Key !== (s3Key as any))) } catch { }
          setUploads(prev => prev.map((upload, idx) =>
            idx === uploadIndex ? {
              ...upload,
              status: 'error',
              error: 'Errore durante il caricamento'
            } : upload
          ))
        }
      }
    }

    if (!localOnly) {
      toast({ title: 'Upload completato', description: `${files.length} file caricati con successo.` })
      try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: 0, target } })) } catch { }
    } else {
      toast({ title: 'Aggiunti in locale', description: `${files.length} file visibili subito.` })
    }

  }, [praticaId, documenti, comparti, toast, uploads.length])

  const handleRemoveThumb = useCallback(async (documentId: string) => {
    const docToRemove = documenti.find(d => d.id === documentId)
    setDocumenti(prev => prev.filter(d => d.id !== documentId))

    // Se è un documento temporaneo (locale), non chiamare l'API
    if (documentId.startsWith('temp:')) {
      toast({
        title: 'Documento eliminato',
        description: docToRemove?.filename || 'Documento rimosso con successo'
      })
      return
    }

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
        description: 'Impossibile eliminare il documento. Ricarico i dati...',
        variant: 'destructive'
      })
      if (praticaId) {
        try {
          const documentiData = await api.getDocumentiByPratica(praticaId)
          setDocumenti(documentiData)
        } catch { }
      }
    }
  }, [documenti, toast, praticaId])

  return {
    documenti,
    setDocumenti,
    uploads,
    clientThumbByS3,
    handleFileDrop,
    handleRemoveThumb,
  }
}

