import { useState, useCallback } from 'react'
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

  const handleFileDrop = useCallback(async (
    files: File[],
    _compartoId?: string | null,
    target?: { type?: string; id?: string; title?: string; tags?: string[] } | null
  ) => {
    // Modalità locale: non effettua upload/creazione su backend
    const localOnly = (((import.meta as any).env?.VITE_ARCHIVE_LOCAL_ONLY) ?? 'true') !== 'false'
    if (!praticaId) return

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

    if (!localOnly) {
      setUploads(prev => [...prev, ...newUploads])
      try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: newUploads.length, target } })) } catch { }
    }

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

        setDocumenti(prev => [tempDoc, ...prev])
        if (!localOnly) setUploads(prev => prev.map((u, idx) => idx === uploadIndex ? { ...u, hasTempDoc: true } : u))
        // Log rimosso per ridurre rumore

        if (existingKeys.has(s3Key)) {
          setUploads(prev => prev.map((upload, idx) =>
            idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
          ))
          continue
        }

        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')
        if (isPdf) {
          // Generate thumbnail and detect native text in parallel
          Promise.all([
            generateClientPdfThumb(file, 220),
            detectNativeTextClient(file)
          ]).then(([dataUrl, hasNativeText]) => {
            if (dataUrl) {
              if (!localOnly) setUploads(prev => prev.map((upload, idx) => idx === uploadIndex ? { ...upload, preview: dataUrl } : upload))
              setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
            }

            // Update document with native text detection result
            setDocumenti(prev => {
              const next = [...prev]
              const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
              if (idxTemp >= 0) {
                next[idxTemp] = { ...next[idxTemp], hasNativeText }
                return next
              }
              return next
            })
          }).catch((error) => {
            console.warn('⚠️ [ARCH] PDF processing failed', { name: file.name, error, s3Key, tempId })
          })
        }

        // In modalità locale, prova a salvare il file fisicamente nella cartella uploads
        if (localOnly) {
          let saved = false
          try {
            // Salva il file fisicamente usando l'endpoint locale
            const localUploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(s3Key)}`
            await api.uploadFile(localUploadUrl, file)
            saved = true
            // File salvato localmente

            // Sostituisci il blob URL con l'URL fisico (hasNativeText già aggiornato sopra)
            setDocumenti(prev => {
              const next = [...prev]
              const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
              if (idxTemp >= 0) {
                const physicalUrl = `http://localhost:3001/api/files/${encodeURIComponent(s3Key)}`
                next[idxTemp] = { ...next[idxTemp], localUrl: physicalUrl }
                return next
              }
              return next
            })
          } catch (e) {
            // Upload locale fallito, usando blob URL (soft fail)
            // Mantieni il blob URL se il salvataggio fallisce
            // L'OCR può comunque funzionare usando il blob URL se il backend lo supporta
            if (!saved) {
              // Mantenendo blob URL per OCR
            }
          }
          continue
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
        try {
          documento = await api.createDocumento({
            praticaId,
            compartoId: (_compartoId && comparti.find(c => c.id === _compartoId)?.id)
              || comparti.find(c => c.key === 'da_classificare')?.id
              || (comparti[0]?.id ?? ''),
            filename: file.name,
            mime: file.type,
            size: file.size,
            s3Key,
            hash: '',
            ocrStatus: 'pending',
            tags,
          })
        } catch (e) {
          console.error('❌ [ARCH] createDocumento failed', { name: file.name, s3Key, error: (e as any)?.message || e })
          throw e
        }
        // Documento creato

        existingKeys.add(s3Key)

        setUploads(prev => prev.map((upload, idx) =>
          idx === uploadIndex ? { ...upload, progress: 80, status: 'processing' } : upload
        ))

        setUploads(prev => prev.map((upload, idx) =>
          idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
        ))

        // Sostituisci il documento temporaneo con quello reale
        setDocumenti(prev => {
          const next = [...prev]
          const idxTemp = next.findIndex(d => d.id === tempId || d.s3Key === s3Key)
          if (idxTemp >= 0) {
            // In modalità locale, usa l'URL fisico invece del blob URL
            const physicalUrl = localOnly ? `http://localhost:3001/api/files/${encodeURIComponent(s3Key)}` : (next[idxTemp] as any).localUrl
            // Mantieni hasNativeText se già rilevato lato client
            const existingHasNativeText = (next[idxTemp] as any).hasNativeText
            next[idxTemp] = { ...(documento as any), localUrl: physicalUrl, hasNativeText: existingHasNativeText }
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

