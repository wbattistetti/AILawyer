import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Documento, UploadProgress } from '../../../../types'
import { MAX_UPLOAD_SIZE, MAX_FILES_PER_BATCH } from '../../../../lib/constants'
import * as pdfjsLib from 'pdfjs-dist'

// ✅ Helper: calcola hash SHA-256 del file (client-side)
async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

export function useArchive(praticaId: string | undefined, comparti: any[]) {
  const { toast } = useToast()

  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [clientThumbByS3, setClientThumbByS3] = useState<Record<string, string>>({})
  const [openDocumentIds, setOpenDocumentIds] = useState<Set<string>>(new Set())

  // Carica documenti quando cambia praticaId
  useEffect(() => {
    if (!praticaId) {
      setDocumenti([])
      return
    }

    const loadDocumenti = async () => {
      try {
        const documentiData = await api.getDocumentiByPratica(praticaId)

        // ✅ IMPORTANTE: Non sostituire l'array, ma fare un merge con i documenti temporanei esistenti
        // ✅ I documenti temporanei devono rimanere visibili finché non vengono esplicitamente sostituiti
        // ✅ PRESERVA thumbnailDataUrl dai tempDoc quando corrispondono a documenti reali
        setDocumenti(prev => {
          // Trova tutti i documenti temporanei esistenti
          const tempDocs = prev.filter(d => d.id.startsWith('temp:'))

          // Crea una mappa dei documenti reali per s3Key (per deduplicazione)
          const realDocsByS3Key = new Map<string, Documento>()
          documentiData.forEach(d => {
            if (d.s3Key) {
              realDocsByS3Key.set(d.s3Key, d)
            }
          })

          // ✅ Crea mappa tempDoc per filename+compartoId (per match quando s3Key differisce)
          const tempDocsByKey = new Map<string, Documento>()
          tempDocs.forEach(tempDoc => {
            if (tempDoc.filename && tempDoc.compartoId) {
              const key = `${tempDoc.filename}:${tempDoc.compartoId}`
              tempDocsByKey.set(key, tempDoc)
            }
          })

          // ✅ Per ogni documento reale, preserva thumbnailDataUrl dal tempDoc se disponibile
          const enrichedRealDocs = documentiData.map(realDoc => {
            // Cerca tempDoc corrispondente per s3Key (se tempDoc ha s3Key corrispondente)
            let matchingTempDoc: Documento | undefined = undefined
            if (realDoc.s3Key) {
              matchingTempDoc = tempDocs.find(t => t.s3Key === realDoc.s3Key)
            }
            // Se non trovato per s3Key, cerca per filename+compartoId
            if (!matchingTempDoc && realDoc.filename && realDoc.compartoId) {
              const key = `${realDoc.filename}:${realDoc.compartoId}`
              matchingTempDoc = tempDocsByKey.get(key)
            }

            // Se trovato tempDoc con thumbnail, preservala
            if (matchingTempDoc) {
              const tempThumbnail = (matchingTempDoc as any)?.thumbnailDataUrl
              const realThumbnail = (realDoc as any)?.thumbnailDataUrl
              // ✅ Priorità: thumbnail client-side generata (tempDoc) > backend
              if (tempThumbnail && tempThumbnail !== realThumbnail) {
                return {
                  ...realDoc,
                  thumbnailDataUrl: tempThumbnail,
                  localUrl: (matchingTempDoc as any)?.localUrl // Preserva anche localUrl
                } as Documento
              }
            }
            return realDoc
          })

          // Mantieni solo i documenti temporanei che NON hanno un documento reale corrispondente
          const tempDocsToKeep = tempDocs.filter(tempDoc => {
            if (!tempDoc.s3Key) {
              return true // Mantieni temp senza s3Key
            }
            // Escludi temp solo se esiste un documento reale con lo stesso s3Key
            if (realDocsByS3Key.has(tempDoc.s3Key)) {
              return false
            }
            // ✅ Escludi anche se c'è un documento reale con stesso filename+compartoId
            if (tempDoc.filename && tempDoc.compartoId) {
              const key = `${tempDoc.filename}:${tempDoc.compartoId}`
              return !documentiData.some(d => d.filename === tempDoc.filename && d.compartoId === tempDoc.compartoId)
            }
            return true
          })

          // Combina documenti reali arricchiti + documenti temporanei da mantenere
          return [...enrichedRealDocs, ...tempDocsToKeep]
        })
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


    // ✅ Traccia uploads anche in modalità locale per mostrare i placeholder
    setUploads(prev => {
      const updated = [...prev, ...newUploads]
      // ✅ Emetti evento ASYNC per evitare warning React
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new CustomEvent('app:uploading', {
            detail: {
              count: newUploads.length,
              target,
              uploads: updated, // ✅ Passa gli uploads aggiornati (prev + nuovi)
              newUploads // ✅ Passa anche i nuovi uploads
            }
          }))
        } catch (e) {
          console.error('[UPLOAD][EVENT][ERROR]', e)
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

        // ✅ PASSO 1: CALCOLA HASH DEL FILE PRIMA DI TUTTO
        console.log('🔍 [ARCH][HASH][CALC] Inizio calcolo hash', { filename: file.name, size: file.size })
        const fileHash = await calculateFileHash(file)
        console.log('✅ [ARCH][HASH][CALC] Hash calcolato', { filename: file.name, hash: fileHash.substring(0, 16) + '...' })

        // ✅ PASSO 2: CERCA SE DOCUMENTO ESISTE GIÀ NEL DB (per hash)
        let existingDocument: Documento | null = null
        if (praticaId && fileHash) {
          try {
            existingDocument = await api.findDocumentByHash(praticaId, fileHash)
            if (existingDocument) {
              console.log('✅ [ARCH][DUPLICATE][FOUND] Documento già presente nel DB', {
                filename: file.name,
                existingId: existingDocument.id.substring(0, 20),
                existingHash: existingDocument.hash?.substring(0, 16),
                hasThumbnail: !!(existingDocument as any)?.thumbnailDataUrl
              })
            } else {
              console.log('✅ [ARCH][DUPLICATE][NOT-FOUND] Nuovo documento, procedo con tempDoc', { filename: file.name })
            }
          } catch (error) {
            console.error('⚠️ [ARCH][DUPLICATE][CHECK][ERROR]', { filename: file.name, error })
            // Continua comunque - meglio creare tempDoc che perdere il file
          }
        }

        // ✅ PASSO 3: SE DOCUMENTO ESISTE GIÀ, USA QUELLO - NON CREARE TEMPDOC
        if (existingDocument) {
          // Documento già presente: aggiungi all'array se non c'è già, aggiorna upload status
          setDocumenti(prev => {
            // Controlla se già presente
            const alreadyExists = prev.some(d => d.id === existingDocument!.id || d.hash === fileHash)
            if (alreadyExists) {
              console.log('✅ [ARCH][DUPLICATE][SKIP] Documento già nell\'array', { filename: file.name })
              return prev // Già presente, non aggiungere
            }
            // Aggiungi documento esistente con thumbnail se presente
            return [...prev, existingDocument!]
          })

          // Completa upload e rimuovi dopo delay
          setUploads(prev => {
            const updated = prev.map((upload, idx) =>
              idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
            )
            return updated
          })

          setTimeout(() => {
            setUploads(prev => prev.filter((u, idx) => idx !== uploadIndex))
          }, 1500)

          // Emetti evento per notificare
          queueMicrotask(() => {
            try {
              window.dispatchEvent(new CustomEvent('app:documents-updated', {
                detail: { documenti: documenti.concat(existingDocument!) }
              }))
            } catch (e) {
              console.error('[DOCUMENT][EVENT][ERROR]', e)
            }
          })

          continue // ✅ PASSA AL PROSSIMO FILE - NON CREARE TEMPDOC
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
          // ✅ In modalità locale, usa hash come s3Key (identificatore univoco del file)
          const ext = file.name.substring(file.name.lastIndexOf('.')) || '.bin'
          s3Key = `${fileHash}${ext}`
        }

        // ✅ PASSO 4: GENERA THUMBNAIL E CREA TEMPDOC (solo se documento non esiste)
        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')
        let thumbnailDataUrl: string | undefined = undefined
        let hasNativeTextValue: boolean | undefined = undefined

        if (isPdf && localOnly) {
          try {
            // ✅ Genera SUBITO, prima di creare tempDoc
            console.log('✅ [ARCH][THUMBNAIL][GENERATE][START]', { filename: file.name, s3Key })
            const [dataUrl, nativeText] = await Promise.all([
              generateClientPdfThumb(file, 220),
              detectNativeTextClient(file)
            ])
            thumbnailDataUrl = dataUrl || undefined
            hasNativeTextValue = nativeText

            console.log('✅ [ARCH][THUMBNAIL][GENERATE][SUCCESS]', {
              filename: file.name,
              hasThumbnail: !!thumbnailDataUrl,
              hasNativeText: hasNativeTextValue,
              thumbnailLength: thumbnailDataUrl?.length || 0
            })

            // Salva in clientThumbByS3 per riferimento
            if (dataUrl) {
              setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
            }
          } catch (error) {
            console.error('⚠️ [ARCH] PDF processing failed', { name: file.name, error })
            // Continua comunque, senza thumbnail
          }
        }

        // ✅ PASSO 5: CREA TEMPDOC CON HASH COME IDENTIFICATORE (non casuale!)
        // ✅ Usa hash come parte dell'ID per identificare univocamente il file
        const tempId = `temp:${fileHash.substring(0, 16)}` // Primi 16 caratteri dell'hash come ID
        const blobUrl = URL.createObjectURL(file)
        const tempDoc: Documento = {
          id: tempId,
          praticaId: praticaId!,
          compartoId: targetCompartoId,
          filename: file.name,
          mime: file.type,
          size: file.size,
          s3Key,
          hash: fileHash, // ✅ Hash già calcolato!
          ocrStatus: 'pending',
          tags: [],
          createdAt: new Date().toISOString(),
          hasNativeText: hasNativeTextValue, // ✅ Già determinato se PDF
        } as any
        // In modalità locale, usa il blob URL temporaneamente
        ;(tempDoc as any).localUrl = blobUrl
        // ✅ THUMBNAIL GIÀ PRESENTE se generata sopra
        ;(tempDoc as any).thumbnailDataUrl = thumbnailDataUrl

        console.log('✅ [ARCH][TEMPDOC][CREATED]', {
          tempId: tempId.substring(0, 30),
          filename: file.name,
          hasThumbnail: !!thumbnailDataUrl,
          hasNativeText: hasNativeTextValue,
          compartoId: targetCompartoId
        })

        setDocumenti(prev => {
          const updated = [...prev, tempDoc] // ✅ Inserisce alla fine per mantenere ordine cronologico
          // ✅ Emetti evento ASYNC per evitare warning React "Cannot update a component while rendering a different component"
          queueMicrotask(() => {
            try {
              window.dispatchEvent(new CustomEvent('app:documents-updated', {
                detail: { documenti: updated }
              }))
            } catch (e) {
              console.error('[DOCUMENT][EVENT][ERROR]', e)
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

          setUploads(prev => {
            const updated = prev.map((upload, idx) =>
              idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
            )
            return updated
          })

          // ✅ Rimuovi solo questo upload completato dopo un breve delay
          if (fileToRemove && compartoIdToRemove) {
            setTimeout(() => {
              setUploads(prev => {
                return prev.filter(u => {
                  // Rimuovi solo se è lo stesso file nello stesso comparto
                  return !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
                })
              })
            }, 1500)
          }
          continue
        }

        // ✅ PER PDF NON-LOCAL: genera thumbnail in background (per localOnly è già generata sopra)
        if (isPdf && !localOnly) {
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

        // ✅ NOTE: In modalità locale, il file viene mantenuto solo in memoria (blob URL)
        // ✅ NON salvare automaticamente nel DB - l'utente salverà esplicitamente quando necessario
        // ✅ Il file fisico verrà caricato solo quando necessario (es. OCR o salvataggio esplicito)
        // ✅ La miniatura rimane in memoria associata al tempDoc tramite hash
        if (localOnly) {
          // ✅ In modalità locale, non fare nulla - tempDoc rimane in memoria
          // ✅ Il file verrà salvato nel DB solo quando l'utente salva esplicitamente
          // ✅ La miniatura rimane visibile associata al tempDoc tramite hash
          continue // ✅ Salta il resto - tempDoc già creato, nessun salvataggio automatico
        }

        // ✅ CODICE NON LOCALE: mantieni logica esistente per upload S3
        if (false) { // Questo blocco non viene mai eseguito - codice legacy rimosso
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

           try {
             // ✅ USA DIRETTAMENTE le variabili locali generate PRIMA del tempDoc
             // ✅ thumbnailDataUrl e hasNativeTextValue sono già disponibili nella closure
             // ✅ Non cercare nell'array che potrebbe essere stale - usa le variabili locali!
             // thumbnailDataUrl e hasNativeTextValue sono già definiti sopra (linee 274-286)

             console.log('✅ [ARCH][SAVE] Usando thumbnail locale', {
               filename: file.name,
               hasThumbnail: !!thumbnailDataUrl,
               thumbnailLength: thumbnailDataUrl?.length || 0,
               hasNativeText: hasNativeTextValue
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
                hash: fileHash, // ✅ Usa hash già calcolato client-side
                ocrStatus: 'pending',
                tags,
                thumbnailDataUrl, // Salva thumbnail nel database
                hasNativeText: hasNativeTextValue, // Passa hasNativeText esplicitamente
                filePath, // Path originale se disponibile
              })

              // ✅ SOSTITUISCI IL DOCUMENTO TEMPORANEO CON QUELLO REALE
              // ✅ Gli s3Key sono diversi (temp: local:timestamp:id, reale: hash), quindi sostituiamo direttamente
              setDocumenti(prev => {
                // Trova il documento temporaneo corrispondente per compartoId e filename
                const tempDocIndex = prev.findIndex(d =>
                  d.id.startsWith('temp:') &&
                  d.compartoId === compartoIdFinale &&
                  d.filename === file.name
                )

                if (tempDocIndex === -1) {
                  console.warn('⚠️ [ARCH][REPLACE] TempDoc non trovato, aggiungendo documento reale con thumbnail', {
                    compartoId: compartoIdFinale,
                    filename: file.name,
                    documentiIds: prev.map(d => d.id).slice(0, 5),
                    hasThumbnail: !!thumbnailDataUrl
                  })
                  // Nessun documento temporaneo trovato, aggiungi documento reale con thumbnail locale se disponibile
                  const docWithThumbnail = {
                    ...documento,
                    thumbnailDataUrl: thumbnailDataUrl || (documento as any)?.thumbnailDataUrl
                  } as Documento
                  return [...prev, docWithThumbnail]
                }

                // Sostituisci il documento temporaneo con quello reale
                const updated = [...prev]
                const tempDoc = updated[tempDocIndex]

                // ✅ USA LA VARIABILE LOCALE thumbnailDataUrl (già generata sopra, non cercare nell'array!)
                // ✅ La thumbnail client-side ha SEMPRE priorità su quella del backend
                const backendThumbnail = (documento as any)?.thumbnailDataUrl

                // ✅ Preserva SEMPRE il localUrl e la miniatura dal documento temporaneo (client-side generata)
                const realDocWithLocalData = {
                  ...documento,
                  localUrl: (tempDoc as any)?.localUrl,
                  // ✅ PRIORITÀ ASSOLUTA: usa thumbnail locale se disponibile, altrimenti quella del backend
                  thumbnailDataUrl: thumbnailDataUrl || backendThumbnail
                } as any

                console.log('✅ [ARCH][REPLACE] Sostituendo tempDoc con documento reale', {
                  tempDocId: tempDoc.id.substring(0, 20),
                  realDocId: documento.id.substring(0, 20),
                  hasLocalThumbnail: !!thumbnailDataUrl,
                  hasBackendThumbnail: !!backendThumbnail,
                  usingThumbnail: !!(thumbnailDataUrl || backendThumbnail)
                })

              updated[tempDocIndex] = realDocWithLocalData

              // Emetti evento per notificare il cambiamento
              queueMicrotask(() => {
                window.dispatchEvent(new CustomEvent('app:documents-updated', {
                  detail: { documenti: updated }
                }))
              })

              return updated
            })

            // ✅ In modalità locale, completa e rimuovi l'upload dopo il salvataggio
            // ✅ Usa setUploads in modo funzionale per leggere lo stato corrente
            setUploads(prev => {
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

              const updated = prev.map((upload, idx) =>
                idx === uploadIdx ? { ...upload, progress: 100, status: 'completed' } : upload
              )

              // ✅ Rimuovi l'upload completato dopo un breve delay
              const fileToRemove = uploadToComplete.file
              const compartoIdToRemove = uploadToComplete.compartoId

              if (fileToRemove && compartoIdToRemove) {
                setTimeout(() => {
                  setUploads(prevUploads => {
                    const filtered = prevUploads.filter(u => {
                      const shouldRemove = !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
                      return shouldRemove
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

        try {
          // Ottieni thumbnail dal documento temporaneo se disponibile
          const currentDocs = documenti
          const tempDoc = currentDocs.find(d => d.id === tempId || d.s3Key === s3Key)
          const thumbnailDataUrl = (tempDoc as any)?.thumbnailDataUrl || undefined
          const hasNativeTextValueNonLocal = (tempDoc as any)?.hasNativeText || false

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

        setUploads(prev => {
          return prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
          )
        })

        // ✅ Rimuovi solo questo upload completato dopo un breve delay
        if (fileToRemove && compartoIdToRemove) {
          setTimeout(() => {
            setUploads(prev => {
              return prev.filter(u => {
                // Rimuovi solo se è lo stesso file nello stesso comparto
                return !(u.file === fileToRemove && u.compartoId === compartoIdToRemove && u.status === 'completed')
              })
            })
          }, 1500)
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

