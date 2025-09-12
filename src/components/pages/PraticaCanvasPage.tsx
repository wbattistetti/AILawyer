import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
// import { UploadPanel } from '../../components/upload/UploadPanel'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { PdfReader } from '../../components/viewers/PdfReader'
import { OcrVerify } from '../../components/ocr/OcrVerify'
import { useToast } from '../../hooks/use-toast'
import { Pratica, Comparto, Documento, UploadProgress } from '../../types'
import { ArrowLeft, Upload, RefreshCw, X, Columns } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { MAX_UPLOAD_SIZE, MAX_FILES_PER_BATCH } from '../../lib/constants'
import { ThumbCard } from '../viewers/ThumbCard'

export function PraticaCanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [pratica, setPratica] = useState<Pratica | null>(null)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [previewDoc, setPreviewDoc] = useState<Documento | null>(null)
  const [activeTab, setActiveTab] = useState<'original' | 'ocr' | 'split'>('original')
  const [syncPage, setSyncPage] = useState<number | null>(null)
  const [syncScrollTop, setSyncScrollTop] = useState<number>(0)
  const [syncMax, setSyncMax] = useState<number>(1)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number>(576) // px, ~36rem
  const resizeRef = useRef<{ startX: number; startW: number; ghost?: HTMLDivElement } | null>(null)
  const [ocrProgressByDoc, setOcrProgressByDoc] = useState<Record<string, number>>({})

  // Dropzone: applicata alla colonna sinistra
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => handleFileDrop(files, null),
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  useEffect(() => {
    if (id) {
      loadPraticaData(id)
    }
  }, [id])

  const loadPraticaData = async (praticaId: string) => {
    setIsLoading(true)
    try {
      const [praticaData, compartiData, documentiData] = await Promise.all([
        api.getPratica(praticaId),
        api.getComparti(praticaId),
        api.getDocumentiByPratica(praticaId),
      ])

      setPratica(praticaData)
      setComparti(compartiData)
      setDocumenti(documentiData)
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error)
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i dati della pratica.',
        variant: 'destructive',
      })
      navigate('/')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileDrop = async (files: File[], _compartoId?: string | null) => {
    if (!id) return

    // Validation
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

    // Temporaneo: usa un comparto placeholder lato backend

    // Initialize upload progress
    const newUploads: UploadProgress[] = files.map(file => ({
      file,
      progress: 0,
      status: 'pending',
    }))

    setUploads(prev => [...prev, ...newUploads])

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const uploadIndex = uploads.length + i

      try {
        // Update status to uploading
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, status: 'uploading', progress: 10 } : upload
        ))

        // Get upload URL
        const { uploadUrl, s3Key } = await api.getUploadUrl(file.name, file.type)
        
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 30 } : upload
        ))

        // Upload file
        await api.uploadFile(uploadUrl, file)
        
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 60 } : upload
        ))

        // Create document record
        const documento = await api.createDocumento({
          praticaId: id,
          compartoId: comparti.find(c => c.key === 'da_classificare')?.id || (comparti[0]?.id ?? ''),
          filename: file.name,
          mime: file.type,
          size: file.size,
          s3Key,
          hash: '', // Will be calculated by backend
          ocrStatus: 'pending',
          tags: [],
        })

        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 80, status: 'processing' } : upload
        ))

        // Non lanciare OCR per ora

        // Update uploads and documents
        setUploads(prev => prev.map((upload, idx) => 
          idx === uploadIndex ? { ...upload, progress: 100, status: 'completed' } : upload
        ))

        setDocumenti(prev => [documento, ...prev])

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
  }

  // Removed unused handlers

  const handleRefresh = () => {
    if (id) {
      loadPraticaData(id)
    }
  }

  const handlePreview = (documento: Documento) => {
    setPreviewDoc(documento)
    setActiveTab((documento.ocrPdfKey || documento.ocrText) ? 'split' : 'original')
    // aggiorna recenti
    try {
      const raw = localStorage.getItem('recent_pratiche')
      const list = raw ? JSON.parse(raw) as any[] : []
      if (pratica) {
        const item = { id: pratica.id, nome: pratica.nome, cliente: pratica.cliente, foro: pratica.foro }
        const next = [item, ...list.filter(x => x.id !== item.id)].slice(0, 6)
        localStorage.setItem('recent_pratiche', JSON.stringify(next))
      }
    } catch {}
  }

  const handleRemoveThumb = (documentId: string) => {
    setDocumenti(prev => prev.filter(d => d.id !== documentId))
    // TODO: quando sarà disponibile l'endpoint di delete, chiamarlo qui
  }

  const handleTableAction = (documento: Documento) => {
    toast({ title: 'Azione tabella', description: 'Azione in arrivo per: ' + documento.filename })
  }

  // Queue OCR for a document and start polling job progress
  const handleOcr = async (documento: Documento) => {
    try {
      setSelectedDocId(documento.id)
      console.log('[OCR] queue request', documento.id, documento.filename)
      toast({ title: 'OCR avviato', description: documento.filename })
      // Queue job
      const job = await api.queueOcr(documento.id)
      setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: 0 }))

      // Polling loop
      let active = true
      const poll = async () => {
        if (!active) return
        try {
          const j = await api.getJob(job.id)
          console.log('[OCR] job', j.status, j.progress)
          setOcrProgressByDoc(prev => ({ ...prev, [documento.id]: j.progress }))
          if (j.status === 'completed' || j.status === 'failed') {
            active = false
            if (j.status === 'failed') {
              toast({ title: 'OCR fallito', description: j.error || 'Errore sconosciuto', variant: 'destructive' })
            } else {
              toast({ title: 'OCR completato', description: documento.filename })
              // Refresh documents to get updated OCR fields and status
              if (id) await loadPraticaData(id)
            }
            // Clear progress overlay after a short delay
            setTimeout(() => {
              setOcrProgressByDoc(prev => { const { [documento.id]: _, ...rest } = prev; return rest })
            }, 1500)
            return
          }
        } catch {}
        setTimeout(poll, 1000)
      }
      poll()
    } catch (error) {
      console.error('[OCR] queue error', error)
      toast({ title: 'Errore', description: 'Impossibile avviare OCR', variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Caricamento pratica...</p>
        </div>
      </div>
    )
  }

  if (!pratica) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">Pratica non trovata</p>
          <Button onClick={() => navigate('/')}>Torna alla Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Button>
              
              <div>
                <h1 className="text-xl font-bold">{pratica.nome}</h1>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Cliente: {pratica.cliente}</span>
                  <span>Foro: {pratica.foro}</span>
                  {pratica.numeroRuolo && <span>N. {pratica.numeroRuolo}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Aggiorna
              </Button>
              <Button size="sm" onClick={() => open()}>
                <Upload className="w-4 h-4 mr-2" />
                Carica Documenti
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content (Drop + Thumbs + Preview) */}
      <div className="container mx-auto px-4 py-6 h-[calc(100vh-120px)]">
        <div className="flex h-full">
          {/* Left: Drop + Thumbnails (copre tutta l'altezza utile) */}
          <div className="flex-1 flex flex-col min-h-full" {...getRootProps()}>
            <input {...getInputProps()} />
            <div
              className={`flex-1 h-full flex flex-col border-2 border-dashed rounded-md p-6 transition ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-muted-foreground/30'
              }`}
              onClick={() => { if (documenti.length === 0) open() }}>
              {documenti.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm">Trascina qui i file oppure clicca nell'area</p>
                  </div>
                </div>
              )}

              <div className="grid [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] gap-6 items-start overflow-auto flex-1 p-1">
              {documenti.map(doc => {
                const isPdf = doc.mime?.startsWith('application/pdf')
                const thumb = isPdf && doc.hash ? api.getThumbUrl(doc.hash) : api.getLocalFileUrl(doc.s3Key)
                return (
                  <ThumbCard
                    key={doc.id}
                    title={doc.filename}
                    imgSrc={thumb}
                    selected={selectedDocId === doc.id}
                    onSelect={() => setSelectedDocId(doc.id)}
                    onPreview={() => { setSelectedDocId(doc.id); handlePreview(doc) }}
                    onPreviewOcr={() => { if (doc.ocrPdfKey) window.open(api.getLocalFileUrl(doc.ocrPdfKey), '_blank') }}
                    onTable={() => { setSelectedDocId(doc.id); handleTableAction(doc) }}
                    onRemove={() => handleRemoveThumb(doc.id)}
                    onOcr={() => handleOcr(doc)}
                    ocrProgressPct={ocrProgressByDoc[doc.id] ?? null}
                    hasOcr={!!doc.ocrPdfKey}
                  />
                )
              })}
              </div>
            </div>
          </div>

          {/* Divider resizer between panels */}
          {previewDoc && (
            <div
              className="w-1.5 cursor-col-resize mx-1 self-stretch bg-transparent hover:bg-blue-400/30"
              onMouseDown={(e) => {
                e.preventDefault()
                const body = document.body as HTMLBodyElement
                const prevCursor = body.style.cursor
                const prevSelect = body.style.userSelect
                body.style.cursor = 'col-resize'
                body.style.userSelect = 'none'

                // Create ghost guide line
                const ghost = document.createElement('div')
                ghost.style.position = 'fixed'
                ghost.style.top = '0'
                ghost.style.bottom = '0'
                ghost.style.width = '2px'
                ghost.style.background = 'rgba(59,130,246,0.8)'
                ghost.style.left = e.clientX + 'px'
                ghost.style.zIndex = '9999'
                ghost.style.pointerEvents = 'none'
                ghost.style.boxShadow = '0 0 0 1px rgba(59,130,246,0.6)'
                document.body.appendChild(ghost)

                resizeRef.current = { startX: e.clientX, startW: previewWidth, ghost }
                const onMove = (ev: MouseEvent) => {
                  if (!resizeRef.current?.ghost) return
                  resizeRef.current.ghost.style.left = ev.clientX + 'px'
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                  const curr = resizeRef.current
                  const dx = curr ? curr.startX - (parseInt(curr.ghost?.style.left || String(curr.startX)) || curr.startX) : 0
                  const next = Math.min(Math.max((curr?.startW || previewWidth) + dx, 320), Math.floor(window.innerWidth * 0.6))
                  setPreviewWidth(next)
                  // trigger fit-to-width in PdfReader by dispatching a resize event so it recomputes layout
                  window.dispatchEvent(new Event('resize'))
                  // Cleanup ghost and styles
                  if (curr?.ghost && curr.ghost.parentNode) curr.ghost.parentNode.removeChild(curr.ghost)
                  resizeRef.current = null
                  body.style.cursor = prevCursor
                  body.style.userSelect = prevSelect
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              title="Ridimensiona"
            />
          )}

          {/* Right: Preview panel */}
          {previewDoc && (
            <div
              className="relative bg-white border rounded-md overflow-hidden flex flex-col max-w-[60vw]"
              style={{ width: previewWidth }}
            >
              <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
                <span className="truncate pr-2">{previewDoc.filename}</span>
                <button
                  className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
                  aria-label="Chiudi"
                  onClick={() => setPreviewDoc(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Tabs */}
                <div className="border-b px-2 py-1 text-sm flex items-center gap-2">
                  <button
                    className={`px-2 py-1 rounded ${activeTab==='original' ? 'bg-muted font-medium' : 'hover:bg-muted'}`}
                    onClick={() => setActiveTab('original')}
                    title="Originale"
                  >Originale</button>
                  {(previewDoc.ocrPdfKey || previewDoc.ocrText) && (
                    <button
                      className={`px-2 py-1 rounded ${activeTab==='ocr' ? 'bg-muted font-medium' : 'hover:bg-muted'}`}
                      onClick={() => setActiveTab('ocr')}
                      title="OCR-ed"
                    >OCR-ed</button>
                  )}
                  {(previewDoc.ocrPdfKey || previewDoc.ocrText) && (
                    <button
                      className={`px-2 py-1 rounded inline-flex items-center gap-1 ${activeTab==='split' ? 'bg-muted font-medium' : 'hover:bg-muted'}`}
                      onClick={() => setActiveTab('split')}
                      title="Affianca"
                    ><Columns className="w-4 h-4" /> Affianca</button>
                  )}
                </div>
                {/* Panel content */}
                <div className="flex-1 overflow-hidden">
                  {activeTab === 'original' && !previewDoc.ocrPdfKey ? (
                    // Solo originale
                    <>
                      {previewDoc.mime?.startsWith('application/pdf') ? (
                        <PdfReader fileUrl={api.getLocalFileUrl(previewDoc.s3Key)} />
                      ) : previewDoc.mime?.startsWith('image/') ? (
                        <div className="w-full h-full overflow-auto p-2"><img src={api.getLocalFileUrl(previewDoc.s3Key)} alt={previewDoc.filename} className="max-w-full" /></div>
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                          Anteprima non disponibile per questo formato. <a className="underline" href={api.getLocalFileUrl(previewDoc.s3Key)} target="_blank" rel="noreferrer">Scarica il file</a>.
                        </div>
                      )}
                    </>
                  ) : activeTab === 'split' ? (
                    // Affianca Originale e OCR-ed pagina per pagina
                    <div className="grid grid-cols-2 gap-2 h-full">
                      <div className="min-h-0">
                        <PdfReader 
                          fileUrl={api.getLocalFileUrl(previewDoc.s3Key)} 
                          onVisiblePageChange={(p)=>setSyncPage(p)} 
                          visiblePageExternal={syncPage ?? undefined}
                          onScrollTopChange={(st, max)=>{ setSyncScrollTop(st); setSyncMax(max || 1) }}
                        />
                      </div>
                      <div className="min-h-0">
                        {previewDoc.ocrPdfKey ? (
                          <PdfReader 
                            fileUrl={api.getLocalFileUrl(previewDoc.ocrPdfKey)} 
                            visiblePageExternal={syncPage ?? undefined} 
                            onVisiblePageChange={(p)=>setSyncPage(p)}
                            externalScrollTop={syncScrollTop}
                            hideScrollbar
                          />
                        ) : (
                          <div className="w-full h-full p-0"><OcrVerify documento={previewDoc} externalPage={syncPage ?? undefined} onPageChange={(p)=>setSyncPage(p)} /></div>
                        )}
                      </div>
                    </div>
                  ) : activeTab === 'ocr' ? (
                    <div className="w-full h-full">
                      { previewDoc.ocrPdfKey ? (
                        <PdfReader fileUrl={api.getLocalFileUrl(previewDoc.ocrPdfKey)} />
                      ) : (previewDoc.ocrText ? (
                        <div className="w-full h-full p-0"><OcrVerify documento={previewDoc} /></div>
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">Nessun risultato OCR disponibile.</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Upload Panel rimosso */}
        </div>
      </div>

      {/* Overlay globale disattivato */}

      {/* Modal rimosso in questa vista */}
    </div>
  )
}