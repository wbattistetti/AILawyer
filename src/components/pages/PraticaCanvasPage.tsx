import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as pdfjsLib from 'pdfjs-dist'
import { useParams, useNavigate } from 'react-router-dom'
// import { UploadPanel } from '../../components/upload/UploadPanel'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
// import { PdfReader } from '../../components/viewers/PdfReader'
import { VerifyPdfViewer } from '../viewers/VerifyPdfViewer'
import { DockWorkspaceV2, DockWorkspaceV2Handle } from '../DockWorkspaceV2'
import { usePageRegistry } from '../viewers/usePageRegistry'
// import { OcrVerify } from '../../components/ocr/OcrVerify'
import { useToast } from '../../hooks/use-toast'
import { Pratica, Comparto, Documento, UploadProgress } from '../../types'
import { ArrowLeft, Upload, RefreshCw } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { MAX_UPLOAD_SIZE, MAX_FILES_PER_BATCH } from '../../lib/constants'
import { ThumbCard } from '../viewers/ThumbCard'
import { SearchProvider } from '../search/SearchProvider'
import PersonCardsPanel from '../../features/entities/PersonCardsPanel'
import { buildPdfJsAdaptersFromDocs } from '../../features/entities/adapters/PdfJsDocAdapter'
import { SearchPanelTree } from '../search/SearchPanelTree'

export function PraticaCanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [pratica, setPratica] = useState<Pratica | null>(null)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  // Client-side provisional thumbs for PDFs (by s3Key)
  const [clientThumbByS3, setClientThumbByS3] = useState<Record<string, string>>({})
  const [previewDoc] = useState<Documento | null>(null)
  // const [activeTab, setActiveTab] = useState<'original' | 'ocr' | 'split' | 'verify'>('original')
  const [syncPage, setSyncPage] = useState<number | null>(null)
  // removed unused scroll sync state after simplifying viewer
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number>(576) // px, ~36rem
  const resizeRef = useRef<{ startX: number; startW: number; ghost?: HTMLDivElement } | null>(null)
  const [ocrProgressByDoc, setOcrProgressByDoc] = useState<Record<string, number>>({})
  // Workspace (Tavolo)
  const [viewMode, setViewMode] = useState<'archivio' | 'tavolo'>('archivio')
  // Simplified viewer: no split view metrics needed
  // Verify mode state
  const verifyDocRef = useRef<any | null>(null)
  const verifyHostRef = useRef<HTMLDivElement | null>(null)
  const { registerPage, unregisterPage, getPageRect, hitTestPage, pageRefs } = usePageRegistry(verifyHostRef as any)
  type VLine = { y: number; y1: number; x: number; x1: number; text: string; mid?: number; avgH?: number }
  const [verifyLinesByPage, setVerifyLinesByPage] = useState<Record<number, VLine[]>>({})
  const [verifyHover, setVerifyHover] = useState<{
    text: string
    page: number
    pdfX0: number
    pdfX1: number
    pdfY0: number
    pdfY1: number
    vpW: number
    vpH: number
    gapPct: number
  } | null>(null)
  // const [verifyFontSize, setVerifyFontSize] = useState<number>(12)
  const [verifyPageSize, setVerifyPageSize] = useState<Record<number, { width: number; height: number }>>({})
  const [verifyPinned, setVerifyPinned] = useState<boolean>(false)
  const [verifyEditText, setVerifyEditText] = useState<string>('')
  const [verifyDebug, setVerifyDebug] = useState<boolean>(false)
  const [verifyEnabled, setVerifyEnabled] = useState<boolean>(false)
  const dockV2Ref = useRef<DockWorkspaceV2Handle | null>(null)
  const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null)

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

  // Removed px remap useEffect per expert's guidance; overlay is positioned in % within page wrapper

  useEffect(() => {
    const host = verifyHostRef.current
    if (!host) return
    let cancelled = false
    const findInner = () => {
      if (cancelled) return
      // Heuristica: primo discendente scrollabile
      let inner: HTMLElement | null = null
      const stack: HTMLElement[] = [host]
      while (stack.length) {
        const el = stack.pop()!
        const cs = getComputedStyle(el)
        const canScroll = /(auto|scroll)/.test(cs.overflowY || '') && el.scrollHeight > el.clientHeight + 4
        if (el !== host && canScroll) { inner = el; break }
        stack.push(...Array.from(el.children).filter(n => n instanceof HTMLElement) as HTMLElement[])
      }
      inner = inner || (host.querySelector('.rpv-core__inner') as HTMLElement | null) || (host.querySelector('.rpv-core__pages') as HTMLElement | null) || (host.querySelector('.rpv-core__viewer') as HTMLElement | null)
      if (inner) {
        setOverlayTarget(inner)
        if (verifyDebug) console.log('[VERIFY] overlay target mounted', inner.className)
      } else {
        if (verifyDebug) console.log('[VERIFY] waiting for inner container...')
        requestAnimationFrame(findInner)
      }
    }
    findInner()
    return () => { cancelled = true }
  }, [verifyEnabled, verifyHostRef.current])

  useEffect(() => { if (verifyDebug) console.log('[VERIFY] enabled =', verifyEnabled) }, [verifyEnabled, verifyDebug])

  // Registry: track pages inside the viewer and keep their rects updated
  useEffect(() => {
    const host = verifyHostRef.current
    if (!host) return
    const scan = () => {
      const nodes = Array.from(host.querySelectorAll('[data-page-number]')) as HTMLElement[]
      const seen = new Set<number>()
      for (const el of nodes) {
        const num = parseInt(el.getAttribute('data-page-number') || '', 10)
        if (!num) continue
        seen.add(num)
        registerPage(num, el)
      }
      // Fallback robusto: usa i canvas ordinati per posizione e ancora alla syncPage
      if (seen.size === 0) {
        const canvases = Array.from(host.querySelectorAll('canvas')) as HTMLElement[]
        const sorted = canvases
          .map(el => ({ el, rect: el.getBoundingClientRect() }))
          .sort((a, b) => a.rect.top - b.rect.top)
        if (sorted.length) {
          // Trova canvas ancora alla parte alta del viewer
          const refTop = (overlayTarget || host).getBoundingClientRect().top
          let anchorIdx = 0
          let best = Infinity
          for (let i = 0; i < sorted.length; i++) {
            const d = Math.abs(sorted[i].rect.top - refTop)
            if (d < best) { best = d; anchorIdx = i }
          }
          const base = (syncPage || 1)
          for (let i = 0; i < sorted.length; i++) {
            const num = base + (i - anchorIdx)
            seen.add(num)
            // Registra il canvas come elemento pagina per i rect; overlay resta nel container
            registerPage(num, sorted[i].el)
          }
        }
      }
      // Unregister pages not seen
      for (const key of Array.from(pageRefs.keys())) {
        if (!seen.has(key)) unregisterPage(key)
      }
    }
    scan()
    const mo = new MutationObserver(() => scan())
    mo.observe(host, { subtree: true, childList: true, attributes: true })
    return () => mo.disconnect()
  }, [verifyEnabled, registerPage, unregisterPage, pageRefs])

  // Debug: log registry size periodically when Verify è ON
  useEffect(() => {
    if (!verifyEnabled || !verifyDebug) return
    const id = setInterval(() => {
      console.log('[VERIFY] pages registered =', pageRefs.size)
    }, 500)
    return () => clearInterval(id)
  }, [verifyEnabled, verifyDebug, pageRefs])

  // Ensure we always receive mousemove events even if React bubbling fails
  useEffect(() => {
    if (verifyDebug) console.log('[VERIFY] binding global mousemove')
    const onMove = async (e: MouseEvent) => {
      const hostDiv = verifyHostRef.current
      if (!hostDiv) return
      const pageNum = hitTestPage(e.clientX, e.clientY)
      const rect = pageNum ? getPageRect(pageNum) : undefined
      if (verifyDebug) console.log('[VERIFY] mouse over(win-reg)', { pageNum, hasRect: !!rect, enabled: verifyEnabled, pinned: verifyPinned })
      if (!verifyEnabled || verifyPinned) return
      if (!pageNum || !rect) { setVerifyHover(null); return }
      const insideX = e.clientX - rect.left
      const insideY = e.clientY - rect.top
      if (insideX < 0 || insideY < 0 || insideX > rect.width || insideY > rect.height) { setVerifyHover(null); return }

      // Prefer PDF OCR layer (when present on the current previewDoc)
      const currentDoc = previewDoc
      if (currentDoc?.ocrPdfKey) {
        if (!verifyDocRef.current) {
          try { const task = pdfjsLib.getDocument({ url: api.getLocalFileUrl(currentDoc.ocrPdfKey) }); verifyDocRef.current = await task.promise } catch { return }
        }
        if (!verifyLinesByPage[pageNum]) {
          try {
            const page = await verifyDocRef.current.getPage(pageNum)
            const vp = page.getViewport({ scale: 1, rotation: (page as any).rotate || 0 })
            const tc = await page.getTextContent()
            if (verifyDebug) console.log('[VERIFY] ocrPdf text items', (tc as any).items?.length)
            const items = (tc.items as any[])
            let avgH = 0
            for (const it of items) avgH += (it.height || 10)
            avgH = items.length ? avgH / items.length : 10
            const thr = Math.max(2, avgH * 0.6)
            type LineAgg = { y0: number; y1: number; x0: number; x1: number; parts: { x: number; str: string; h: number }[]; yMid: number; sumH: number; n: number }
            const aggs: LineAgg[] = []
            for (const it of items) {
              const t = it.transform
              const x = t[4] as number
              const yTop = t[5] as number
              const h = (it.height as number) || 10
              const w = (it.width as number) || ((it.str?.length || 1) * h * 0.5)
              const yMid = vp.height - (yTop - h / 2)
              let target: LineAgg | null = null
              for (const ln of aggs) { if (Math.abs(ln.yMid - yMid) <= thr) { target = ln; break } }
              if (!target) {
                target = { y0: yTop - h, y1: yTop, x0: x, x1: x + w, parts: [], yMid, sumH: 0, n: 0 }
                aggs.push(target)
              } else {
                target.y0 = Math.min(target.y0, yTop - h)
                target.y1 = Math.max(target.y1, yTop)
                target.x0 = Math.min(target.x0, x)
                target.x1 = Math.max(target.x1, x + w)
                target.yMid = (target.yMid + yMid) / 2
              }
              target.parts.push({ x, str: (it as any).str || '', h })
              target.sumH += h
              target.n += 1
            }
            const lines: VLine[] = aggs.map(ln => {
              const sorted = ln.parts.sort((a, b) => a.x - b.x)
              const text = sorted.map(p => p.str).join(' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()
              const avgH2 = ln.n ? ln.sumH / ln.n : (ln.y1 - ln.y0)
              return { y: vp.height - ln.y1, y1: vp.height - ln.y0, x: ln.x0, x1: ln.x1, text, mid: ln.yMid, avgH: avgH2 }
            })
            setVerifyLinesByPage(prev => ({ ...prev, [pageNum]: lines }))
            setVerifyPageSize(prev => ({ ...prev, [pageNum]: { width: vp.width, height: vp.height } }))
          } catch {}
        }
        const lines = verifyLinesByPage[pageNum]
        if (!lines || !lines.length) { if (verifyDebug) console.log('[VERIFY] no lines for page', pageNum); setVerifyHover(null); return }
        const vpH = verifyPageSize[pageNum]?.height || lines.reduce((m, l) => Math.max(m, l.y1), 0)
        const pdfY = (insideY / rect.height) * vpH
        let best = lines[0]
        let bestDist = Math.abs(((best.y + best.y1) / 2) - pdfY)
        for (const l of lines) {
          const d = Math.abs(((l.y + l.y1) / 2) - pdfY)
          if (d < bestDist) { best = l; bestDist = d }
        }
        const vpW = verifyPageSize[pageNum]?.width || lines.reduce((m,l)=> Math.max(m, l.x1), 0)
        // const hostRect = (overlayTarget || hostDiv).getBoundingClientRect()
        const lineHPdf = best.avgH || (best.y1 - best.y)
        const gapPdf = Math.max(lineHPdf * 0.5, 6 * (vpH / rect.height))
        const gapPct = 100 * (gapPdf / vpH)
        const text = (best.text || '').trim()
        if (!text) { setVerifyHover(null); return }
        setVerifyHover({
          text,
          page: pageNum,
          pdfX0: best.x,
          pdfX1: best.x1,
          pdfY0: best.y,
          pdfY1: best.y1,
          vpW,
          vpH,
          gapPct
        })
        return
      }

      // ocrLayout / original fallback are handled by the in-DOM handler; here we stop
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [verifyEnabled, verifyPinned, syncPage, verifyDebug, verifyLinesByPage, verifyPageSize, hitTestPage, getPageRect])

  // Global hotkeys for debug and pin even when the host doesn't have focus
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'F9') {
        setVerifyDebug(v => !v)
      }
      if (ev.key === 'F2') {
        if (verifyEnabled && verifyHover && !verifyPinned) { setVerifyPinned(true); setVerifyEditText(verifyHover.text) }
      }
      if (verifyPinned && (ev.key === 'Escape' || ev.key === 'Enter')) {
        setVerifyPinned(false); setVerifyHover(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [verifyEnabled, verifyHover, verifyPinned])

  useEffect(() => {
    if (id) {
      loadPraticaData(id)
      // restore only viewMode for V2
      try {
        const raw = localStorage.getItem(`ws_${id}`)
        if (raw) {
          const ws = JSON.parse(raw)
          if (ws.viewMode === 'tavolo' || ws.viewMode === 'archivio') setViewMode(ws.viewMode)
        }
      } catch {}
    }
  }, [id])

  // Header height measurement removed; content uses CSS grid rows (auto, 1fr)

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

    // Helper: generate client-side PDF first-page thumb (non blocking)
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

        // Fire client-side PDF thumb generation (non-blocking)
        const isPdf = file.type?.startsWith('application/pdf') || file.name.toLowerCase().endsWith('.pdf')
        if (isPdf) {
          generateClientPdfThumb(file, 320).then((dataUrl) => {
            if (dataUrl) setClientThumbByS3(prev => ({ ...prev, [s3Key]: dataUrl }))
          }).catch(() => {})
        }
        
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

  // removed legacy handlePreview

  // ===== Workspace helpers =====
  // persistWs legacy placeholder (kept for backward compatibility)
  // const persistWs = (_tabs: any, _activeId: string | null, mode: 'archivio'|'tavolo') => {
  //   if (!id) return
  //   try { localStorage.setItem(`ws_${id}`, JSON.stringify({ viewMode: mode })) } catch {}
  // }

  // removed legacy openFromArchive (use openInTable)

  // closeWsTab handled implicitly by DockWorkspace; keep function removed

  // legacy tabs bar: replaced by DockWorkspace

  // Reusable viewer for a documento with Verify mode toggle
  const renderDocViewer = (doc: Documento) => (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <div className="border-b px-2 py-1 text-sm flex items-center gap-2">
        <button
          className={`px-2 py-1 rounded ${verifyEnabled ? 'bg-blue-100 text-blue-700' : 'hover:bg-muted'}`}
          onClick={() => setVerifyEnabled(v => !v)}
          title="Attiva/Disattiva Verify"
        >Verify {verifyEnabled ? 'ON' : 'OFF'}</button>
      </div>
      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <div
            className="h-full relative overflow-x-hidden overflow-hidden"
            ref={verifyHostRef}
            tabIndex={0}
            onPointerMove={async (e) => {
              if (!verifyEnabled || verifyPinned) { setVerifyHover(null); return }
              const pageEl = (e.target as HTMLElement)?.closest('[data-vp-page]') as HTMLElement | null
              if (!pageEl) { setVerifyHover(null); return }
              const pageNum = Number((pageEl as any).dataset.pageNum) || (syncPage || 1)
              const rect = pageEl.getBoundingClientRect()
              const vp = verifyPageSize[pageNum]
              if (!vp) { setVerifyHover(null); return }
              const insideY = (e as unknown as PointerEvent).clientY - rect.top
              const yMousePdf = (insideY / rect.height) * vp.height

              // Prefer PDF OCR text layer quando disponibile
              if (doc.ocrPdfKey) {
                if (!verifyDocRef.current) {
                  try { const task = pdfjsLib.getDocument({ url: api.getLocalFileUrl(doc.ocrPdfKey) }); verifyDocRef.current = await task.promise } catch { return }
                }
                if (!verifyLinesByPage[pageNum]) {
                  try {
                    const page = await verifyDocRef.current.getPage(pageNum)
                    const vpObj = page.getViewport({ scale: 1, rotation: (page as any).rotate || 0 })
                    const tc = await page.getTextContent()
                    setVerifyPageSize(prev => ({ ...prev, [pageNum]: { width: vpObj.width, height: vpObj.height } }))
                    const items = (tc.items as any[])
                    let avgH = 0
                    for (const it of items) avgH += (it.height || 10)
                    avgH = items.length ? avgH / items.length : 10
                    const thr = Math.max(2, avgH * 0.6)
                    type LineAgg = { y0: number; y1: number; x0: number; x1: number; parts: { x: number; str: string; h: number }[]; yMid: number; sumH: number; n: number }
                    const aggs: LineAgg[] = []
                    for (const it of items) {
                      const t = it.transform
                      const x = t[4] as number
                      const yTop = t[5] as number
                      const h = (it.height as number) || 10
                      const w = (it.width as number) || ((it.str?.length || 1) * h * 0.5)
                      const yMid = vpObj.height - (yTop - h / 2)
                      let target: LineAgg | null = null
                      for (const ln of aggs) { if (Math.abs(ln.yMid - yMid) <= thr) { target = ln; break } }
                      if (!target) { target = { y0: yTop - h, y1: yTop, x0: x, x1: x + w, parts: [], yMid, sumH: 0, n: 0 }; aggs.push(target) }
                      else {
                        target.y0 = Math.min(target.y0, yTop - h)
                        target.y1 = Math.max(target.y1, yTop)
                        target.x0 = Math.min(target.x0, x)
                        target.x1 = Math.max(target.x1, x + w)
                        target.yMid = (target.yMid + yMid) / 2
                      }
                      target.parts.push({ x, str: (it as any).str || '', h })
                      target.sumH += h
                      target.n += 1
                    }
                    const lines = aggs.map(ln => {
                      const sorted = ln.parts.sort((p1: any, p2: any) => p1.x - p2.x)
                      const text = sorted.map((p: any) => p.str).join(' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()
                      const avgH2 = ln.n ? ln.sumH / ln.n : (ln.y1 - ln.y0)
                      return { y: ln.y0, y1: ln.y1, x: ln.x0, x1: ln.x1, text, mid: ln.yMid, avgH: avgH2 }
                    })
                    setVerifyLinesByPage(prev => ({ ...prev, [pageNum]: lines }))
                  } catch {}
                }
                const lines = verifyLinesByPage[pageNum]
                if (!lines || !lines.length) { setVerifyHover(null); return }
                const vpH = vp.height
                let best = lines[0]
                let bestDist = Math.abs(((best.y + best.y1) / 2) - yMousePdf)
                for (const l of lines) { const d = Math.abs(((l.y + l.y1) / 2) - yMousePdf); if (d < bestDist) { best = l; bestDist = d } }
                const vpW = vp.width
                const lineHPdf = best.avgH || (best.y1 - best.y)
                const gapPdf = Math.max(lineHPdf * 0.5, 6 * (vpH / rect.height))
                const gapPct = 100 * (gapPdf / vpH)
                const text = (best.text || '').trim()
                if (!text) { setVerifyHover(null); return }
                setVerifyHover({ text, page: pageNum, pdfX0: best.x, pdfX1: best.x1, pdfY0: best.y, pdfY1: best.y1, vpW, vpH, gapPct })
                // dynamic font sizing skipped for now
                return
              }

              // Fallback A: usa ocrLayout precomputato
              try {
                const raw: any = (doc as any).ocrLayout
                if (!raw) { setVerifyHover(null); return }
                let arr: any = Array.isArray(raw) ? raw : JSON.parse(raw)
                const lay = arr.find((p: any) => p?.page === pageNum) || arr[0]
                if (!lay || !Array.isArray(lay.words)) { setVerifyHover(null); return }
                if (!verifyLinesByPage[pageNum]) {
                  type Word = { x0: number; x1: number; y0: number; y1: number; text: string }
                  const words = (lay.words as Word[])
                  const heights = words.map(w => (w.y1 - w.y0))
                  const avgH = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 10
                  const thr = Math.max(2, avgH * 0.6)
                  type Agg = { y0: number; y1: number; x0: number; x1: number; yMid: number; parts: { x: number; text: string; h: number }[]; sumH: number; n: number }
                  const aggs: Agg[] = []
                  for (const w of words) {
                    const yMid = (w.y0 + w.y1) / 2
                    let target: Agg | null = null
                    for (const ln of aggs) { if (Math.abs(ln.yMid - yMid) <= thr) { target = ln; break } }
                    if (!target) { target = { y0: w.y0, y1: w.y1, x0: w.x0, x1: w.x1, yMid, parts: [], sumH: 0, n: 0 }; aggs.push(target) }
                    else {
                      target.y0 = Math.min(target.y0, w.y0)
                      target.y1 = Math.max(target.y1, w.y1)
                      target.x0 = Math.min(target.x0, w.x0)
                      target.x1 = Math.max(target.x1, w.x1)
                      target.yMid = (target.yMid + yMid) / 2
                    }
                    target.parts.push({ x: w.x0, text: w.text, h: (w.y1 - w.y0) })
                    target.sumH += (w.y1 - w.y0)
                    target.n += 1
                  }
                  const lines: VLine[] = aggs.map(a => {
                    const sorted = a.parts.sort((p, q) => p.x - q.x)
                    const text = sorted.map(p => p.text).join(' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()
                    const avgH2 = a.n ? a.sumH / a.n : (a.y1 - a.y0)
                    return { y: a.y0, y1: a.y1, x: a.x0, x1: a.x1, text, mid: a.yMid, avgH: avgH2 }
                  })
                  setVerifyLinesByPage(prev => ({ ...prev, [pageNum]: lines }))
                  setVerifyPageSize(prev => ({ ...prev, [pageNum]: { width: lay.width || 595, height: lay.height || 842 } }))
                }
                const lines = verifyLinesByPage[pageNum]
                if (!lines || !lines.length) { setVerifyHover(null); return }
                const pdfH = vp.height
                const pdfW = vp.width
                const yPdf = yMousePdf
                let best = lines[0]
                let bestDist = Math.abs(((best.y + best.y1) / 2) - yPdf)
                for (const l of lines) { const d = Math.abs(((l.y + l.y1) / 2) - yPdf); if (d < bestDist) { best = l; bestDist = d } }
                const gapPdf = Math.max((best.avgH || (best.y1 - best.y)) * 0.5, 6 * (pdfH / rect.height))
                const gapPct = 100 * (gapPdf / pdfH)
                const text = (best.text || '').trim()
                if (!text) { setVerifyHover(null); return }
                setVerifyHover({ text, page: pageNum, pdfX0: best.x, pdfX1: best.x1, pdfY0: best.y, pdfY1: best.y1, vpW: pdfW, vpH: pdfH, gapPct })
                // dynamic font sizing skipped for now
              } catch { if (verifyDebug) console.log('[VERIFY] ocrLayout parse error'); setVerifyHover(null) }

              // Fallback B: se non c'è ocrPdfKey né ocrLayout, prova PDF originale (come sopra)
            }}
            onMouseLeave={() => { if (!verifyPinned) setVerifyHover(null) }}
            onKeyDown={(ev)=>{
              if (ev.key === 'F2') {
                if (verifyEnabled && verifyHover && !verifyPinned) { setVerifyPinned(true); setVerifyEditText(verifyHover.text) }
              }
              if (ev.key === 'F9') { setVerifyDebug(v => !v) }
              if (verifyPinned && (ev.key === 'Escape' || ev.key === 'Enter')) {
                setVerifyPinned(false)
                setVerifyHover(null)
              }
            }}
          >
            <VerifyPdfViewer
              fileUrl={api.getLocalFileUrl(doc.s3Key)}
              page={syncPage || 1}
              lines={verifyLinesByPage[syncPage || 1] as any}
              docId={doc.id}
              onPageChange={(p)=> setSyncPage(p)}
            />

            {/* Overlay per hover/tooltip: montato nel wrapper pagina e posizionato in % */}
            {verifyEnabled && verifyHover && pageRefs.get(verifyHover.page) && createPortal(
              (() => {
                const { pdfX0, pdfX1, pdfY0, pdfY1, vpW, vpH, gapPct, text } = verifyHover
                const leftPct = 100 * (pdfX0 / vpW)
                const topPct = 100 * (pdfY0 / vpH)
                const widthPct = 100 * ((pdfX1 - pdfX0) / vpW)
                const heightPct = 100 * ((pdfY1 - pdfY0) / vpH)
                const tooltipTopPct = topPct + heightPct + gapPct
                return (
                  <>
                    <div className="absolute pointer-events-none border-2 border-blue-500/70 bg-blue-200/20 rounded" style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }} />
                    {verifyPinned ? (
                      <textarea className="absolute bg-white px-2 py-1 rounded shadow border outline-none" style={{ left: `${leftPct}%`, top: `${tooltipTopPct}%`, width: `${widthPct}%` }} value={verifyEditText} onChange={(ev)=>setVerifyEditText(ev.target.value)} />
                    ) : (
                      <div className="absolute pointer-events-auto bg-black/80 text-white px-2 py-1 rounded shadow flex items-center" style={{ left: `${leftPct}%`, top: `${tooltipTopPct}%`, maxWidth: '100%' }}>
                        <span style={{ display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{text}</span>
                      </div>
                    )}
                  </>
                )
              })(), pageRefs.get(verifyHover.page) as HTMLElement)
            }
          </div>
        </div>
      </div>
  )

  const handleRemoveThumb = (documentId: string) => {
    setDocumenti(prev => prev.filter(d => d.id !== documentId))
    // TODO: quando sarà disponibile l'endpoint di delete, chiamarlo qui
  }

  // legacy alias removed

  const openInTable = (documento: Documento) => {
    try {
      // Apri nel Tabset centrale di DockWorkspaceV2
      setTimeout(() => {
        dockV2Ref.current?.openDoc({ id: documento.id, title: documento.filename })
      }, 0)
      toast({ title: 'Aperto nel Tavolo', description: documento.filename })
    } catch {
      toast({ title: 'Errore', description: 'Impossibile aprire nel Tavolo', variant: 'destructive' })
    }
  }

  // Render Archivio come pane standalone (riutilizzato sia in vista Archivio sia nel pane sinistro di DockV2)
  const renderArchivePane = () => (
    <div
      {...getRootProps()}
      className={`w-full h-full min-h-full flex flex-col border-2 border-dashed rounded-md transition ${
        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
      }`}
      style={{ padding: '12px' }}
      onClick={() => { if (documenti.length === 0) open() }}>
      <input {...getInputProps()} />
      {documenti.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm">Trascina qui i file della pratica oppure clicca per selezionarli</p>
          </div>
        </div>
      )}

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] gap-6 items-start overflow-auto flex-1 p-2">
      {documenti.map(doc => {
        const isPdf = doc.mime?.startsWith('application/pdf') || doc.filename.toLowerCase().endsWith('.pdf')
        const serverThumb = isPdf && doc.hash ? api.getThumbUrl(doc.hash) : ''
        const clientThumb = clientThumbByS3[doc.s3Key]
        const thumb = clientThumb || serverThumb || api.getLocalFileUrl(doc.s3Key)
        return (
          <ThumbCard
            key={doc.id}
            title={doc.filename}
            imgSrc={thumb}
            selected={selectedDocId === doc.id}
            onSelect={() => setSelectedDocId(doc.id)}
            onPreview={() => { setSelectedDocId(doc.id); openInTable(doc) }}
            onPreviewOcr={() => { if (doc.ocrPdfKey) window.open(api.getLocalFileUrl(doc.ocrPdfKey), '_blank') }}
            onTable={() => { setSelectedDocId(doc.id); openInTable(doc) }}
            onRemove={() => handleRemoveThumb(doc.id)}
            onOcr={() => handleOcr(doc)}
            onOcrQuick={() => handleOcr(doc, 'quick')}
            ocrProgressPct={ocrProgressByDoc[doc.id] ?? null}
            hasOcr={!!doc.ocrPdfKey}
          />
        )
      })}
      </div>
    </div>
  )

  // Seed Tavolo: not needed in V2 (tabs managed by DockWorkspaceV2)

  // Queue OCR for a document and start polling job progress
  const handleOcr = async (documento: Documento, mode: 'quick' | 'full' = 'full') => {
    try {
      setSelectedDocId(documento.id)
      console.log('[OCR] queue request', documento.id, documento.filename)
      toast({ title: 'OCR avviato', description: documento.filename })
      // Queue job
      const job = await api.queueOcr(documento.id, mode)
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
    <div className="h-screen overflow-hidden bg-background grid" style={{ gridTemplateRows: 'auto 1fr' }}>
      
      {/* Header */}
      <div className="border-b bg-white">
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

      {/* Main Content: Archivio (sx) + Tavolo (dx) sempre insieme */}
      <div className="h-full w-full overflow-hidden">
        <DockWorkspaceV2
          ref={dockV2Ref as any}
          storageKey={`ws_dock_v2_${id}`}
          docs={[]}
          renderArchive={() => (
            <div className="w-full h-full">
              {renderArchivePane()}
            </div>
          )}
          renderSearch={() => (
            <SearchProvider defaultScope={'archive'} registry={{
              getAllDocs: () => documenti.map(d => ({ id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: (d.mime?.includes('word') ? 'word' : 'pdf') })),
              getOpenDocs: () => [],
              ensureDocOpen: async (docId: string) => { const d = documenti.find(x=>x.id===docId); if (d) openInTable(d); return null },
            }} onSearch={async(q, _scope)=>{
              try {
                const anyPdf: any = pdfjsLib as any
                if (anyPdf && anyPdf.GlobalWorkerOptions && !anyPdf.GlobalWorkerOptions.workerSrc) {
                  anyPdf.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js'
                }
              } catch {}
              const targets = documenti.filter(d => (d.mime?.includes('pdf') || d.filename.toLowerCase().endsWith('.pdf')))
              const groups: any[] = []
              console.log('[ARCHIVE SEARCH] start', { q, targets: targets.length })
              for (const d of targets) {
                const fileUrl = api.getLocalFileUrl(d.ocrPdfKey || d.s3Key)
                try {
                  // Fetch as ArrayBuffer to avoid CORS/URL issues
                  const res = await fetch(fileUrl)
                  const buf = await res.arrayBuffer()
                  const doc = await (pdfjsLib as any).getDocument({ data: new Uint8Array(buf), disableWorker: false }).promise
                  const matches: any[] = []
                  let ord = 0
                  const total = doc.numPages || 0
                  console.log('[ARCHIVE SEARCH] doc', d.filename, { pages: total })
                  for (let p = 1; p <= total; p++) {
                    const page = await doc.getPage(p)
                    const content = await page.getTextContent()
                    const items = content.items as any[]
                    let buffer = ''
                    const boxes: { x:number;y:number;w:number;h:number }[] = []
                    for (const it of items) {
                      const s = (it.str || '') as string
                      const tx = it.transform
                      const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0
                      const cw = ((it.width as number) || 0) / Math.max(1, s.length)
                      for (let i=0;i<s.length;i++){ const x=(tx[4] as number)+(cw*i); const y=(tx[5] as number)-h; boxes.push({x,y,w:cw,h}) }
                      buffer += s + ' '
                    }
                    const hay = buffer.toLowerCase(); const needle = q.toLowerCase()
                    let pos = 0
                    while (true) {
                      const idx = hay.indexOf(needle, pos); if (idx < 0) break
                      const start = idx, end = idx + needle.length
                      let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity
                      for (let i=start;i<end && i<boxes.length;i++){ const c=boxes[i]; l=Math.min(l,c.x); t=Math.min(t,c.y); r=Math.max(r,c.x+c.w); b=Math.max(b,c.y+c.h) }
                      if (isFinite(l)&&isFinite(t)&&isFinite(r)&&isFinite(b)){
                        const vp = page.getViewport({ scale:1 })
                        const x0Pct = l/vp.width, x1Pct = r/vp.width
                        const y0Pct = (vp.height - b)/vp.height, y1Pct = (vp.height - t)/vp.height
                        matches.push({ id: `${d.id}-${p}-${start}`, docId: d.id, docTitle: d.filename, kind:'pdf', page:p, q, x0Pct, x1Pct, y0Pct, y1Pct, charIdx:start, qLength: needle.length, snippet: buffer.slice(Math.max(0,start-40), Math.min(buffer.length,end+40)).trim(), score:0, ord: ord++ })
                      }
                      pos = end
                    }
                  }
                  console.log('[ARCHIVE SEARCH] doc done', d.filename, { matches: matches.length })
                  groups.push({ doc:{ id:d.id, title:d.filename, hash:d.hash||'', pages:0, kind:'pdf' }, matches })
                } catch (err) {
                  console.warn('[ARCHIVE SEARCH] doc error', d.filename, err)
                  groups.push({ doc:{ id:d.id, title:d.filename, hash:d.hash||'', pages:0, kind:'pdf' }, matches:[] })
                }
              }
              const total = groups.reduce((s,g)=> s + g.matches.length, 0)
              console.log('[ARCHIVE SEARCH] done', { total })
              return { id: String(Date.now()), query: q, scope: 'archive' as any, total, groups } as any
            }}>
              <SearchPanelTree showInput={true} />
            </SearchProvider>
          )}
          renderPersons={() => (
            <PersonCardsPanel
              getAllDocsMeta={async () => documenti.map(d => ({ praticaId: d.praticaId, hash: d.hash, docId: d.id, title: d.filename, pages: 0 }))}
              buildAdapters={async (docs) => {
                const map = new Map(docs.map(m => [m.docId, m]))
                const selected = documenti.filter(d => map.has(d.id))
                return buildPdfJsAdaptersFromDocs(selected)
              }}
              onOpenOccurrence={(o) => {
                // Open doc tab, then dispatch navigation event used by VerifyPdfViewer
                const d = documenti.find(x => x.id === o.docId)
                if (d) openInTable(d)
                try {
                  window.dispatchEvent(new CustomEvent('app:goto-match', { detail: { docId: o.docId, q: '', match: { id: o.id, docId: o.docId, docTitle: o.docTitle, kind: 'pdf', page: o.page, q: '', x0Pct: o.box.x0Pct, x1Pct: o.box.x1Pct, y0Pct: o.box.y0Pct, y1Pct: o.box.y1Pct, snippet: o.snippet, score: 1 } } }))
                } catch {}
              }}
            />
          )}
          renderDoc={(docId) => {
            const doc = documenti.find(d => d.id === docId)
            if (!doc) return <div className="p-4 text-sm">Documento non trovato.</div>
            return renderDocViewer(doc)
          }}
        />

          {/* Divider resizer between panels: (legacy archivio preview) */}
          {false && viewMode === 'archivio' && previewDoc && (
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

          {/* Right: Preview panel in Archivio */}
          {false && viewMode === 'archivio' && previewDoc && (
            <div
              className="relative bg-white border rounded-md overflow-hidden flex flex-col max-w-[60vw]"
              style={{ width: previewWidth }}
            >
              <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
                <span className="truncate pr-2">{previewDoc?.filename || ''}</span>
                <div />
        </div>
              {/* Preview usa il nuovo viewer in modalità lite (senza overlay) */}
              <div className="h-[calc(100vh-180px)]">
                <div />
          </div>
        </div>
      )}

          {/* Tavolo gestito interamente da DockWorkspaceV2 */}
      </div>

      {/* Overlay globale disattivato */}

      {/* Modal rimosso in questa vista */}
    </div>
  )
}