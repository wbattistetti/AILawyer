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

  const handleFileDrop = useCallback(async (
    files: File[], 
    _compartoId?: string | null, 
    target?: { type?: string; id?: string; title?: string; tags?: string[] } | null
  ) => {
    if (!praticaId) return

    // Validazione
    if (files.length > MAX_FILES_PER_BATCH) {
      toast({
        title: 'Troppi file',
        description: `Puoi caricare massimo ${MAX_FILES_PER_BATCH} file alla volta.`,
        variant: 'destructive',
      })
      return
    }

    const oversizedFiles = files.filter(file => file.size > MAX_UPLOAD_SIZE)
    if (oversizedFiles.length > 0) {
      toast({
        title: 'File troppo grandi',
        description: `Alcuni file superano il limite di ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`,
        variant: 'destructive',
      })
      return
    }

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
      if (dup) { skipped++; continue }
      toProcess.push(f)
    }

    if (skipped > 0) {
      toast({ title: 'Duplicati ignorati', description: `${skipped} file già presenti non sono stati aggiunti.` })
    }

    // Initialize upload progress
    const newUploads: UploadProgress[] = toProcess.map(file => ({
      file,
      progress: 0,
      status: 'pending',
    }))

    setUploads(prev => [...prev, ...newUploads])
    try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: newUploads.length, target } })) } catch {}

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

    const existingKeys = new Set(documenti.map(d => d.s3Key))

    // Process each file
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      const uploadIndex = uploads.length + i

      try {
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, status: 'uploading', progress: 10 } : upload
        ))
        try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: Math.max(1, files.length - i), target } })) } catch {}

        const { uploadUrl, s3Key } = await api.getUploadUrl(file.name, file.type)

        if (existingKeys.has(s3Key)) {
          setUploads(prev => prev.map((upload, idx) => 
            idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
          ))
          continue
        }

        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')
        if (isPdf) {
          generateClientPdfThumb(file, 320).then((dataUrl) => {
            if (dataUrl) setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
          }).catch(() => {})
        }
        
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 30 } : upload
        ))

        await api.uploadFile(uploadUrl, file)
        
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 60 } : upload
        ))

        const tags: string[] = [...(target?.tags || [])]
        if (target?.type === 'drawer') {
          const key = (target.title || '').toLowerCase()
          if (tags.length === 0) {
            if (key.includes('sequestro')) tags.push('verbale_sequestro','verbale')
            else if (key.includes('arresto')) tags.push('verbale_arresto','verbale')
            else if (key.includes('verbali') || key.includes('verbale')) tags.push('verbale')
            else if (key.includes('intercett')) tags.push('intercettazioni')
            else if (key.includes('reati')) tags.push('reati')
          }
        }

        const documento = await api.createDocumento({
          praticaId,
          compartoId: comparti.find(c => c.key === 'da_classificare')?.id || (comparti[0]?.id ?? ''),
          filename: file.name,
          mime: file.type,
          size: file.size,
          s3Key,
          hash: '',
          ocrStatus: 'pending',
          tags,
        })

        existingKeys.add(s3Key)

        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 80, status: 'processing' } : upload
        ))

        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
        ))

        setDocumenti(prev => {
          const i = prev.findIndex(d => d.id === documento.id)
          if (i >= 0) {
            const next = [...prev]
            next[i] = { ...prev[i], ...documento }
            return next
          }
          return [documento, ...prev]
        })
        try { window.dispatchEvent(new CustomEvent('app:request-documents')) } catch {}

      } catch (error) {
        console.error('Errore nell\'upload:', error)
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { 
            ...upload, 
            status: 'error', 
            error: 'Errore durante il caricamento' 
          } : upload
        ))
      }
    }

    toast({
      title: 'Upload completato',
      description: `${files.length} file caricati con successo.`,
    })
    try { window.dispatchEvent(new CustomEvent('app:uploading', { detail: { count: 0, target } })) } catch {}

  }, [praticaId, documenti, comparti, toast, uploads.length])

  const handleRemoveThumb = useCallback(async (documentId: string) => {
    const docToRemove = documenti.find(d => d.id === documentId)
    setDocumenti(prev => prev.filter(d => d.id !== documentId))
    
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
        } catch {}
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

