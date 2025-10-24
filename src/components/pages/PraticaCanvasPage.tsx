import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { VerifyPdfViewer } from '../viewers/VerifyPdfViewer'
import { PdfViewerShell } from '../viewers/pdf-viewer/PdfViewerShell'
import { DockWorkspaceV2, DockWorkspaceV2Handle } from '../DockWorkspaceV2'
import { usePageRegistry } from '../viewers/usePageRegistry'
import { useToast } from '../../hooks/use-toast'
import { Pratica, Comparto, Documento } from '../../types'
import { ArrowLeft, Upload, RefreshCw, X, FileText, Play, Pause, Square, ChevronDown, ChevronRight } from 'lucide-react'
import { DocumentCollection } from '../../features/documents/DocumentCollection'
import { AnalysisPanel } from './pratica-canvas/components/AnalysisPanel'
import { SearchProvider } from '../search/SearchProvider'
import PersonCardsPanel from '../../features/entities/PersonCardsPanel'
import { buildPdfJsAdaptersFromDocs } from '../../features/entities/adapters/PdfJsDocAdapter'
import { SearchPanelTree } from '../search/SearchPanelTree'
import { EventsTab } from '../../features/events/EventsTab'
import { extractPersonsFromDocs } from '../../features/entities/extract-orchestrator'
import { detectContacts } from '../../features/parsers/contacts'
import { detectVehicles } from '../../features/parsers/vehicles'
import { extractEvents as nlpExtractEvents } from '../../services/nlp/client'
import { ThingCardsPanel } from '../../features/cards/ThingCardsPanel'
import { Explorer, useExplorer } from '../../features/explorer'
import { jobSystem } from '../../analysis/jobSystem'
import { useArchive } from './pratica-canvas/hooks/useArchive'
import { useOcr } from './pratica-canvas/hooks/useOcr'
import { PdfViewerManager } from './pratica-canvas/components/PdfViewerManager'
import { useErrorHandling } from './pratica-canvas/hooks/useErrorHandling'
import { useWorkspaceManager } from './pratica-canvas/hooks/useWorkspaceManager';
import { useEventListeners } from './pratica-canvas/hooks/useEventListeners';
import { ArchiveRenderer } from './pratica-canvas/components/ArchiveRenderer';
import { HeaderToolbar } from './pratica-canvas/components/HeaderToolbar'

export function PraticaCanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { ExplorerProps } = useExplorer()

  const [pratica, setPratica] = useState<Pratica | null>(null)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [isExplorerFullscreen, setIsExplorerFullscreen] = useState<boolean>(false)
  const [syncPage, setSyncPage] = useState<number | null>(null)
  const [testNewViewer, setTestNewViewer] = useState(false)

  // Usa i nuovi hooks per la gestione documenti e OCR
  const {
    documenti,
    clientThumbByS3,
    handleFileDrop,
    handleRemoveThumb
  } = useArchive(id, comparti)

  const {
    ocrProgressByDoc,
    ocrEtaByDoc,
    ocrStatusByDoc,
    ocrCancellingByDoc,
    transcribedPctByDoc,
    handleOcr,
    handleOcrCancel
  } = useOcr(id)

  // Usa il nuovo hook per error handling e loading states
  const {
    isLoading,
    setIsLoading,
    handleRefresh: handleRefreshHook
  } = useErrorHandling()

  // Header height management for fixed toolbar
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerH, setHeaderH] = useState<number>(56)

  // Usa il nuovo hook per la gestione del workspace
  const {
    viewMode,
    setViewMode,
    dockV2Ref,
    persistViewMode
  } = useWorkspaceManager(id)

  // Verify mode state (currently disabled)
  type VLine = { y: number; y1: number; x: number; x1: number; text: string; mid?: number; avgH?: number }
  const [verifyLinesByPage, setVerifyLinesByPage] = useState<Record<number, VLine[]>>({})
  const [verifyEnabled, setVerifyEnabled] = useState(false)

  // Usa il nuovo hook per gestire tutti gli event listeners
  useEventListeners({
    documenti,
    clientThumbByS3,
    dockV2Ref,
    testNewViewer,
    setTestNewViewer,
    handleFileDrop
  })





  // Measure header height dynamically
  useEffect(() => {
    const update = () => {
      const h = headerRef.current?.getBoundingClientRect().height || 56
      setHeaderH(Math.max(48, Math.round(h)))
    }
    update()
    const ro = new ResizeObserver(() => update())
    if (headerRef.current) ro.observe(headerRef.current)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('resize', update); try { ro.disconnect() } catch { } }
  }, [pratica])

  // Load pratica data
  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setIsLoading(true)
        const [p, c] = await Promise.all([api.getPratica(id!), api.getComparti(id!)])
        setPratica(p)
        setComparti(c)
      } catch (error) {
        console.error('Failed to load pratica:', error)
        toast({ title: 'Errore', description: 'Impossibile caricare la pratica', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, toast, setIsLoading])

  // Header height measurement removed; content uses CSS grid rows (auto, 1fr)


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
    <PdfViewerManager
      doc={doc}
      syncPage={syncPage}
      setSyncPage={setSyncPage}
      verifyEnabled={verifyEnabled}
      setVerifyEnabled={setVerifyEnabled}
      verifyLinesByPage={verifyLinesByPage}
      testNewViewer={testNewViewer}
      setTestNewViewer={setTestNewViewer}
    />
  )

  // legacy alias removed


  // Simple placeholder analysis panel
  function AnalysisPanel() {
    const dbg = (...args: any[]) => { try { if ((window as any).__ANALYSIS_LOG) console.log('[ANALYSIS]', ...args) } catch { } }
    // Global capturing logger to guarantee logs on Play clicks
    useEffect(() => {
      const handler = (e: any) => {
        try {
          const el = (e.target as HTMLElement)?.closest?.('[data-ana-action]') as HTMLElement | null
          if (!el) return
          const action = el.getAttribute('data-ana-action') || ''
          const key = el.getAttribute('data-ana-key') || ''
          const doc = el.getAttribute('data-ana-doc') || ''
          // eslint-disable-next-line no-console
          console.log('[ANA DEBUG] click', { action, key, doc })
        } catch { }
      }
      document.addEventListener('click', handler, true)
      return () => document.removeEventListener('click', handler, true)
    }, [])
    const [open, setOpen] = useState<Record<string, boolean>>({})
    const tasksTemplate = [
      { id: 'ocr', label: 'OCR', w: 0 },
      { id: 'entities', label: 'Estrazione anagrafiche', w: 0 },
      { id: 'contacts', label: 'Estrazione contatti', w: 0 },
      { id: 'vehicles', label: 'Estrazione veicoli', w: 0 },
      { id: 'events', label: 'Eventi', w: 0 },
    ] as const

    const weight: Record<string, number> = { ocr: 0.2, entities: 0.4, contacts: 0.1, vehicles: 0.15, events: 0.15 }

    const [hoverDoc, setHoverDoc] = useState<string | null>(null)
    const [hoverTask, setHoverTask] = useState<string | null>(null)

    type DocState = { pages?: number; page?: number; running: Record<string, boolean>; progress: Record<string, number> }
    const [docState, setDocState] = useState<Record<string, DocState>>({})
    const abortRef = useRef<Map<string, { ocr?: AbortController; entities?: AbortController; contacts?: AbortController; vehicles?: AbortController; events?: AbortController }>>(new Map())
    const ensureAbort = (id: string) => { let m = abortRef.current.get(id); if (!m) { m = {}; abortRef.current.set(id, m) } return m }
    const stopTask = (id: string, task: 'ocr' | 'entities' | 'contacts' | 'vehicles' | 'events') => { try { ensureAbort(id)[task]?.abort() } catch { } setDocState(prev => ({ ...prev, [id]: { ...ensureState(id), running: { ...ensureState(id).running, [task]: false } } })) }
    const stopAllTasks = (id: string) => { const m = ensureAbort(id); try { m.ocr?.abort() } catch { }; try { m.entities?.abort() } catch { }; try { m.contacts?.abort() } catch { }; try { m.vehicles?.abort() } catch { }; try { m.events?.abort() } catch { }; setDocState(prev => ({ ...prev, [id]: { ...ensureState(id), running: { ocr: false, entities: false, contacts: false, vehicles: false, events: false } } })) }

    // Perf: throttle progress updates and cache adapters per doc
    const lastUpdateRef = useRef<number>(0)
    const adapterCacheRef = useRef<Map<string, any[]>>(new Map())
    const setProgressThrottled = (docId: string, key: keyof DocState['progress'], page: number, total: number) => {
      const now = performance.now()
      const commit = (now - (lastUpdateRef.current || 0)) > 120 || page >= total
      if (!commit) return
      lastUpdateRef.current = now
      const pct = Math.max(0, Math.min(1, page / Math.max(1, total)))
      setDocState(prev => ({ ...prev, [docId]: { ...ensureState(docId), pages: total, progress: { ...ensureState(docId).progress, [key]: pct }, running: { ...ensureState(docId).running, [key]: true } } }))
      dbg('progress', { docId, task: String(key), page, total, pct })
    }

    // JobSystem listener → riflette progress/stato su UI
    useEffect(() => {
      const off = jobSystem.on((j) => {
        setDocState(prev => {
          const key = j.type as keyof DocState['progress']
          const cur = ensureState(j.docId)
          const running = j.status === 'running'
          const done = j.status === 'success'
          return ({
            ...prev,
            [j.docId]: {
              ...cur,
              running: { ...cur.running, [key]: running },
              progress: { ...cur.progress, [key]: done ? 1 : Math.max(cur.progress[key], j.progress || 0) },
            }
          })
        })
      })
      return () => { try { off() } catch { } }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const getAdapters = async (doc: Documento) => {
      if (adapterCacheRef.current.has(doc.id)) { dbg('adapters:cache-hit', { docId: doc.id }); return adapterCacheRef.current.get(doc.id) as any[] }
      dbg('adapters:build', { docId: doc.id, title: doc.filename })
      const adapters = await buildPdfJsAdaptersFromDocs([doc])
      adapterCacheRef.current.set(doc.id, adapters)
      return adapters
    }

    const ensureState = (id: string) => (docState[id] || { pages: undefined, page: 0, running: { ocr: false, entities: false, contacts: false, vehicles: false, events: false }, progress: { ocr: 0, entities: 0, contacts: 0, vehicles: 0, events: 0 } })

    const startEntities = async (doc: Documento) => {
      const ds = ensureState(doc.id)
      setDocState(prev => ({ ...prev, [doc.id]: { ...ds, running: { ...ds.running, entities: true }, progress: { ...ds.progress, entities: Math.max(ds.progress.entities || 0, 0.0001) } } }))
      try {
        dbg('entities:start', { docId: doc.id, title: doc.filename })
        const adapters = await getAdapters(doc)
        const ctrl = new AbortController(); ensureAbort(doc.id).entities = ctrl
        let totalPages = 0
        await extractPersonsFromDocs(adapters, (p) => {
          // progress callback per pagina
          totalPages = Math.max(totalPages, (ensureState(doc.id).pages || p.page))
          const curr = ensureState(doc.id)
          const pages = curr.pages || totalPages
          setProgressThrottled(doc.id, 'entities', p.page, pages)
          dbg('entities:progress', { docId: doc.id, page: p.page, pages })
        }, { persist: false, signal: ctrl.signal })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('entities start error', e)
      } finally {
        setDocState(prev => ({ ...prev, [doc.id]: { ...ensureState(doc.id), running: { ...ensureState(doc.id).running, entities: false } } }))
        dbg('entities:done', { docId: doc.id })
      }
    }

    const startOcr = async (doc: Documento) => {
      const ds = ensureState(doc.id)
      setDocState(prev => ({ ...prev, [doc.id]: { ...ds, running: { ...ds.running, ocr: true }, progress: { ...ds.progress, ocr: Math.max(ds.progress.ocr || 0, 0.0001) } } }))
      dbg('ocr:start', { docId: doc.id, title: doc.filename })
      await handleOcr(doc)
      setDocState(prev => ({ ...prev, [doc.id]: { ...ensureState(doc.id), running: { ...ensureState(doc.id).running, ocr: false }, progress: { ...ensureState(doc.id).progress, ocr: 1 } } }))
      dbg('ocr:done', { docId: doc.id })
    }

    const startParsers = async (doc: Documento, tasks: Array<'contacts' | 'vehicles'>) => {
      try {
        dbg('parsers:start', { docId: doc.id, tasks })
        const ds = ensureState(doc.id)
        setDocState(prev => ({ ...prev, [doc.id]: { ...ds, running: { ...ds.running, contacts: ds.running.contacts || tasks.includes('contacts'), vehicles: ds.running.vehicles || tasks.includes('vehicles') }, progress: { ...ds.progress, ...(tasks.includes('contacts') ? { contacts: Math.max(ds.progress.contacts || 0, 0.0001) } : {}), ...(tasks.includes('vehicles') ? { vehicles: Math.max(ds.progress.vehicles || 0, 0.0001) } : {}) } } }))
        const adapters = await getAdapters(doc)
        const cCtrl = tasks.includes('contacts') ? new AbortController() : undefined; if (cCtrl) ensureAbort(doc.id).contacts = cCtrl
        const vCtrl = tasks.includes('vehicles') ? new AbortController() : undefined; if (vCtrl) ensureAbort(doc.id).vehicles = vCtrl
        const ad = adapters[0]
        const meta = await ad.getDocMeta()
        const total = Math.max(1, meta.pages || 1)
        dbg('parsers:meta', { docId: doc.id, pages: total })
        for await (const { page, tokens } of ad.streamPageTokens()) {
          if (tasks.includes('contacts')) {
            if (cCtrl?.signal.aborted) break
            try {
              const items = detectContacts({ docId: doc.id, title: doc.filename, page, tokens })
              if (items?.length) {
                try { window.dispatchEvent(new CustomEvent('app:things', { detail: { docId: doc.id, items } })) } catch { }
                dbg('contacts:items', { docId: doc.id, page, count: items.length })
              }
            } catch { }
            setProgressThrottled(doc.id, 'contacts', page, total)
            dbg('contacts:progress', { docId: doc.id, page, total })
          }
          if (tasks.includes('vehicles')) {
            if (vCtrl?.signal.aborted) break
            try {
              const items = detectVehicles({ docId: doc.id, title: doc.filename, page, tokens })
              if (items?.length) {
                try { window.dispatchEvent(new CustomEvent('app:things', { detail: { docId: doc.id, items } })) } catch { }
                dbg('vehicles:items', { docId: doc.id, page, count: items.length })
              }
            } catch { }
            setProgressThrottled(doc.id, 'vehicles', page, total)
            dbg('vehicles:progress', { docId: doc.id, page, total })
          }
        }
      } finally {
        setDocState(prev => ({ ...prev, [doc.id]: { ...ensureState(doc.id), running: { ...ensureState(doc.id).running, contacts: false, vehicles: false } } }))
        dbg('parsers:done', { docId: doc.id, tasks })
      }
    }

    const startEvents = async (doc: Documento) => {
      try {
        dbg('events:start', { docId: doc.id })
        const ds = ensureState(doc.id)
        setDocState(prev => ({ ...prev, [doc.id]: { ...ds, running: { ...ds.running, events: true }, progress: { ...ds.progress, events: Math.max(ds.progress.events || 0, 0.0001) } } }))
        const adapters = await getAdapters(doc)
        const ctrl = new AbortController(); ensureAbort(doc.id).events = ctrl
        const ad = adapters[0]
        const meta = await ad.getDocMeta()
        const total = Math.max(1, meta.pages || 1)
        dbg('events:meta', { docId: doc.id, pages: total })
        for await (const { page, tokens } of ad.streamPageTokens()) {
          // call backend but ignore result here; orchestrator already indexes events
          const text = tokens.map((t: { text: string }) => t.text).join(' ')
          try { await nlpExtractEvents(text, { doc_id: doc.id, page }, { signal: ctrl.signal }) } catch { }
          setProgressThrottled(doc.id, 'events', page, total)
          dbg('events:progress', { docId: doc.id, page, total })
        }
      } finally {
        setDocState(prev => ({ ...prev, [doc.id]: { ...ensureState(doc.id), running: { ...ensureState(doc.id).running, events: false } } }))
        dbg('events:done', { docId: doc.id })
      }
    }

    const JOB_SYSTEM_ENABLED = true
    const enqueueAll = (doc: Documento) => {
      // Concurrency per doc = 1: verranno eseguiti in ordine
      // NON enqueuare OCR automaticamente: l'OCR parte solo dal pulsante sulla miniatura
      jobSystem.enqueue(doc.id, 'entities', async ({ signal }) => { if (signal.aborted) return; await startEntities(doc) })
      jobSystem.enqueue(doc.id, 'contacts', async ({ signal }) => { if (signal.aborted) return; await startParsers(doc, ['contacts']) })
      jobSystem.enqueue(doc.id, 'vehicles', async ({ signal }) => { if (signal.aborted) return; await startParsers(doc, ['vehicles']) })
      jobSystem.enqueue(doc.id, 'events', async ({ signal }) => { if (signal.aborted) return; await startEvents(doc) })
    }
    const startAll = (doc: Documento) => {
      dbg('all:start', { docId: doc.id })
      if (JOB_SYSTEM_ENABLED) { enqueueAll(doc); return }
      // NON avviare OCR in modalità fallback: parte solo su click esplicito
      try { startEntities(doc) } catch { }
      try { startParsers(doc, ['contacts', 'vehicles']) } catch { }
      try { startEvents(doc) } catch { }
    }

    const headerBar = (docId: string, docTitle: string, aggPct: number, isOpen: boolean, onToggle: () => void) => (
      <div className="relative overflow-visible"
        onMouseEnter={() => setHoverDoc(docId)}
        onMouseLeave={() => setHoverDoc(prev => (prev === docId ? null : prev))}>
        <div className="relative w-full h-8 rounded overflow-hidden flex items-center" style={{ backgroundColor: '#d8ecff' }}>
          <FileText className="w-4 h-4 text-neutral-600 ml-2 mr-2 shrink-0" />
          {/* Idle: solo testo; Running: progress bar */}
          {aggPct > 0 ? (
            <div className="relative group flex-1 h-5 bg-white rounded border border-black overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${aggPct}%` }} />
              <div className="absolute inset-0 flex items-center justify-between pl-2 pr-2 text-xs text-black">
                <span className="truncate pr-2">{docTitle}</span>
                <span className="flex items-center">
                  {/* inline toolbar just left of % with 3px gap */}
                  <span className="ana-hover-toolbar flex items-center gap-1 bg-white border border-neutral-300 rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" style={{ marginRight: '3px' }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                    <button type="button" data-ana-action="play-all" data-ana-doc={docId} className="p-0.5 text-neutral-700 hover:text-neutral-900" disabled={Object.values(ensureState(docId).running).some(Boolean)} onClick={(e) => { e.stopPropagation(); try { console.log('[ANALYSIS] doc:play-all', { docId }) } catch { }; const d = documenti.find(x => x.id === docId); if (d) { startAll(d); } }}><Play className="w-3.5 h-3.5" /></button>
                    <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => e.stopPropagation()}><Pause className="w-3.5 h-3.5" /></button>
                    <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => { e.stopPropagation(); stopAllTasks(docId) }} title="Stop"><Square className="w-3.5 h-3.5" /></button>
                  </span>
                  {Math.round(aggPct)}%
                  <button type="button" className="ml-2 text-neutral-600 hover:text-neutral-900" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label={isOpen ? 'Comprimi' : 'Espandi'} title={isOpen ? 'Comprimi' : 'Espandi'}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <div className="relative group flex-1 flex items-center justify-between px-2 text-xs text-black">
              <span className="truncate pr-2">{docTitle}</span>
              <span className="flex items-center">
                <span className="ana-hover-toolbar flex items-center gap-1 bg-white border border-neutral-300 rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" style={{ marginRight: '3px' }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                  <button type="button" data-ana-action="play-all" data-ana-doc={docId} className="p-0.5 text-neutral-700 hover:text-neutral-900" disabled={Object.values(ensureState(docId).running).some(Boolean)} onClick={(e) => { e.stopPropagation(); try { console.log('[ANALYSIS] doc:play-all', { docId }) } catch { }; const d = documenti.find(x => x.id === docId); if (d) { startAll(d); } }}><Play className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => e.stopPropagation()}><Pause className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={(e) => { e.stopPropagation(); stopAllTasks(docId) }} title="Stop"><Square className="w-3.5 h-3.5" /></button>
                </span>
                0%
                <button type="button" className="ml-2 text-neutral-600 hover:text-neutral-900" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label={isOpen ? 'Comprimi' : 'Espandi'} title={isOpen ? 'Comprimi' : 'Espandi'}>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </span>
            </div>
          )}
        </div>
        {/* Removed below-bar hover toolbar to avoid showing it when hovering header */}
      </div>
    )

    const taskRow = (taskKey: string, label: string, pct: number) => (
      <div className="relative overflow-visible"
        onMouseEnter={() => setHoverTask(taskKey)}
        onMouseLeave={() => setHoverTask(prev => (prev === taskKey ? null : prev))}>
        {pct > 0 ? (
          <div className="relative group w-full h-7 bg-white rounded border border-black overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${pct}%` }} />
            <div className="absolute inset-0 flex items-center justify-between px-2 text-[12px] text-black">
              <span className="truncate pr-2">{label}</span>
              <span className="flex items-center">
                <span className="ana-hover-toolbar flex items-center gap-1 bg-white border border-neutral-300 rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" style={{ marginRight: '3px' }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                  <button type="button" data-ana-action="play" data-ana-key={taskKey} data-ana-doc={taskKey.split(':')[0]} className="p-0.5 text-neutral-700 hover:text-neutral-900" disabled={ensureState(taskKey.split(':')[0]).running[taskKey.split(':')[1] as keyof DocState['running']]} onClick={() => { const [docId, task] = taskKey.split(':'); try { console.log('[ANALYSIS] play:click', { docId, task }) } catch { }; const d = documenti.find(x => x.id === docId); if (!d) return; if (task === 'ocr') startOcr(d); if (task === 'entities') startEntities(d); if (task === 'contacts') startParsers(d, ['contacts']); if (task === 'vehicles') startParsers(d, ['vehicles']); if (task === 'events') startEvents(d); }}><Play className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-neutral-700 hover:text-neutral-900"><Pause className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={() => { const [docId, task] = taskKey.split(':') as [string, any]; stopTask(docId, task) }} title="Stop"><Square className="w-3.5 h-3.5" /></button>
                </span>
                {Math.round(pct)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="relative group w-full h-7 flex items-center justify-between px-2 text-[12px] text-black bg-white rounded">
            <span className="truncate pr-2">{label}</span>
            <span className="flex items-center">
              <span className="ana-hover-toolbar flex items-center gap-1 bg-white border border-neutral-300 rounded px-1 py-0.5 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" style={{ marginRight: '3px' }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                <button type="button" data-ana-action="play" data-ana-key={taskKey} data-ana-doc={taskKey.split(':')[0]} className="p-0.5 text-neutral-700 hover:text-neutral-900" disabled={ensureState(taskKey.split(':')[0]).running[taskKey.split(':')[1] as keyof DocState['running']]} onClick={() => { const [docId, task] = taskKey.split(':'); console.log('[ANALYSIS] play:click', { docId, task }); const d = documenti.find(x => x.id === docId); if (!d) return; if (task === 'ocr') startOcr(d); if (task === 'entities') startEntities(d); if (task === 'contacts') startParsers(d, ['contacts']); if (task === 'vehicles') startParsers(d, ['vehicles']); if (task === 'events') startEvents(d); }}><Play className="w-3.5 h-3.5" /></button>
                <button className="p-0.5 text-neutral-700 hover:text-neutral-900"><Pause className="w-3.5 h-3.5" /></button>
                <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={() => { const [docId, task] = taskKey.split(':') as [string, any]; stopTask(docId, task) }} title="Stop"><Square className="w-3.5 h-3.5" /></button>
              </span>
              0%
            </span>
          </div>
        )}
      </div>
    )

    const SmallToolbar = ({ onPlay, onPause, onStop }: { onPlay?: () => void; onPause?: () => void; onStop?: () => void }) => (
      <span className="inline-flex items-center gap-1 bg-white/90 border border-neutral-300 rounded px-1 py-0.5">
        <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onPlay}><Play className="w-3.5 h-3.5" /></button>
        <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onPause}><Pause className="w-3.5 h-3.5" /></button>
        <button className="p-0.5 text-neutral-700 hover:text-neutral-900" onClick={onStop}><Square className="w-3.5 h-3.5" /></button>
      </span>
    )

    const startAllDocs = () => { dbg('global:play-all'); for (const d of documenti) startAll(d) }

    const globalAggPct = (() => {
      const perDoc = documenti.map(d => {
        const ds = ensureState(d.id)
        const tasks = tasksTemplate.map(t => ({ ...t, w: ds.progress[t.id as keyof typeof ds.progress] || 0 }))
        return tasks.reduce((s, t) => s + (t.w * (weight[t.id] || 0)), 0)
      })
      const avg = perDoc.length ? (perDoc.reduce((a, b) => a + b, 0) / perDoc.length) : 0
      return Math.round(avg * 100)
    })()

    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-2 border-b bg-white sticky top-0 z-10">
          <div className="relative w-full h-6 bg-white rounded border border-black overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-blue-700" style={{ width: `${globalAggPct}%` }} />
            <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-black">
              <span className="truncate pr-2">Analisi documenti</span>
              <span className="flex items-center">
                <SmallToolbar onPlay={startAllDocs} />
                <span className="ml-1">{globalAggPct}%</span>
              </span>
            </div>
            <button className="absolute top-1/2 -translate-y-1/2 right-2 text-neutral-700 hover:text-neutral-900" onClick={() => { }} title="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-3">
          {documenti.map(doc => {
            const ds = ensureState(doc.id)
            const tasks = tasksTemplate.map(t => ({ ...t, w: ds.progress[t.id as keyof typeof ds.progress] || 0 }))
            const agg = tasks.reduce((s, t) => s + (t.w * (weight[t.id] || 0)), 0) * 100
            const isOpen = open[doc.id] ?? true
            return (
              <div key={doc.id} className="rounded overflow-visible" style={{ backgroundColor: '#eef6ff' }}>
                <div className="px-3 py-2 rounded-t" style={{ backgroundColor: '#d8ecff' }}>
                  {headerBar(doc.id, doc.filename, agg, isOpen, () => setOpen(prev => ({ ...prev, [doc.id]: !isOpen })))}
                </div>
                {isOpen && (
                  <div className="pb-3 pr-3 pl-6 space-y-2 overflow-visible rounded-b">
                    {tasks.map((t: { id: string; label: string; w: number }) => (
                      <div key={t.id}>{taskRow(`${doc.id}:${t.id}`, t.label, (t.w || 0) * 100)}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // REMOVED: renderArchivePane & handleOcr - now replaced by DocumentCollection and useOcr hook

  // Event listeners gestiti dal hook useEventListeners

  const renderEvents = useCallback(() => <EventsTab />, [])
  const renderContacts = useCallback(() => <ThingCardsPanel kind="contact" />, [])
  const renderIds = useCallback(() => <ThingCardsPanel kind="id" />, [])

  // Explorer fullscreen handlers - stato esplicito basato sulla tab selezionata
  const handleLeftBorderTabChange = useCallback((component: string) => {
    setIsExplorerFullscreen(component === 'explorer')
  }, [])

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
    <div className="h-screen overflow-hidden bg-background">

      {/* Header */}
      <HeaderToolbar
        pratica={pratica}
        onHomeClick={() => navigate('/')}
        onOpenPratica={() => navigate('/')}
        onSavePratica={() => handleRefreshHook(id!)}
        onUploadDocuments={() => open()}
      />

      {/* Spacer per l'header fisso */}
      <div style={{ height: headerH }} />
      {/* Main Content: Archivio (sx) + Tavolo (dx) sempre insieme */}
      <div className="w-full overflow-hidden" style={{ height: `calc(100vh - ${headerH}px)` }}>
        <DockWorkspaceV2
          ref={dockV2Ref as any}
          storageKey={`ws_dock_v2_${id}`}
          docs={documenti.map(d => ({ id: d.id, title: d.filename }))}
          renderExplorer={() => <Explorer {...ExplorerProps} />}
          isExplorerFullscreen={isExplorerFullscreen}
          onLeftBorderTabChange={handleLeftBorderTabChange}
          praticaId={id} // Aggiungi questa prop
          renderArchive={() => (
            <ArchiveRenderer
              documenti={documenti}
              clientThumbByS3={clientThumbByS3}
              dockV2Ref={dockV2Ref}
              handleFileDrop={handleFileDrop}
              handleRemoveThumb={handleRemoveThumb}
              handleOcr={handleOcr}
              handleOcrCancel={handleOcrCancel}
              ocrProgressByDoc={ocrProgressByDoc}
              ocrEtaByDoc={ocrEtaByDoc}
              ocrStatusByDoc={ocrStatusByDoc}
              ocrCancellingByDoc={ocrCancellingByDoc}
              transcribedPctByDoc={transcribedPctByDoc}
              toast={toast}
            />
          )}
          renderSearch={() => (
            <SearchProvider defaultScope={'archive'} registry={{
              getAllDocs: () => documenti.map(d => ({ id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: (d.mime?.includes('word') ? 'word' : 'pdf') })),
              getOpenDocs: () => [],
              ensureDocOpen: async (docId: string) => { const d = documenti.find(x => x.id === docId); if (d) { dockV2Ref.current?.openDoc({ id: d.id, title: d.filename }); toast({ title: 'Aperto nel Tavolo', description: d.filename }) }; return null },
            }} onSearch={async (q, _scope) => {
              try {
                const anyPdf: any = pdfjsLib as any
                if (anyPdf && anyPdf.GlobalWorkerOptions && !anyPdf.GlobalWorkerOptions.workerSrc) {
                  anyPdf.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.7.107/build/pdf.worker.min.js'
                }
              } catch { }
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
                    const boxes: { x: number; y: number; w: number; h: number }[] = []
                    for (const it of items) {
                      const s = (it.str || '') as string
                      const tx = it.transform
                      const h = (it.height as number) || Math.abs(tx[5] - (tx[5] - (it.height as number))) || 0
                      const cw = ((it.width as number) || 0) / Math.max(1, s.length)
                      for (let i = 0; i < s.length; i++) { const x = (tx[4] as number) + (cw * i); const y = (tx[5] as number) - h; boxes.push({ x, y, w: cw, h }) }
                      buffer += s + ' '
                    }
                    const hay = buffer.toLowerCase(); const needle = q.toLowerCase()
                    let pos = 0
                    while (true) {
                      const idx = hay.indexOf(needle, pos); if (idx < 0) break
                      const start = idx, end = idx + needle.length
                      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
                      for (let i = start; i < end && i < boxes.length; i++) { const c = boxes[i]; l = Math.min(l, c.x); t = Math.min(t, c.y); r = Math.max(r, c.x + c.w); b = Math.max(b, c.y + c.h) }
                      if (isFinite(l) && isFinite(t) && isFinite(r) && isFinite(b)) {
                        const vp = page.getViewport({ scale: 1 })
                        const x0Pct = l / vp.width, x1Pct = r / vp.width
                        const y0Pct = (vp.height - b) / vp.height, y1Pct = (vp.height - t) / vp.height
                        matches.push({ id: `${d.id}-${p}-${start}`, docId: d.id, docTitle: d.filename, kind: 'pdf', page: p, q, x0Pct, x1Pct, y0Pct, y1Pct, charIdx: start, qLength: needle.length, snippet: buffer.slice(Math.max(0, start - 40), Math.min(buffer.length, end + 40)).trim(), score: 0, ord: ord++ })
                      }
                      pos = end
                    }
                  }
                  console.log('[ARCHIVE SEARCH] doc done', d.filename, { matches: matches.length })
                  groups.push({ doc: { id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: 'pdf' }, matches })
                } catch (err) {
                  console.warn('[ARCHIVE SEARCH] doc error', d.filename, err)
                  groups.push({ doc: { id: d.id, title: d.filename, hash: d.hash || '', pages: 0, kind: 'pdf' }, matches: [] })
                }
              }
              const total = groups.reduce((s, g) => s + g.matches.length, 0)
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
                if (d) {
                  dockV2Ref.current?.openDoc({ id: d.id, title: d.filename })
                  toast({ title: 'Aperto nel Tavolo', description: d.filename })
                }
                try {
                  window.dispatchEvent(new CustomEvent('app:goto-match', { detail: { docId: o.docId, q: '', match: { id: o.id, docId: o.docId, docTitle: o.docTitle, kind: 'pdf', page: o.page, q: '', x0Pct: o.box.x0Pct, x1Pct: o.box.x1Pct, y0Pct: o.box.y0Pct, y1Pct: o.box.y1Pct, snippet: o.snippet, score: 1 } } }))
                } catch { }
              }}
            />
          )}
          renderDoc={(docId: string) => {
            const doc = documenti.find(d => d.id === docId)
            if (!doc) return <div className="p-4 text-sm">Documento non trovato.</div>
            return renderDocViewer(doc)
          }}
          renderEvents={renderEvents}
          renderContacts={renderContacts}
          renderIds={renderIds}
        />

        {/* Divider resizer removed - preview panel disabled */}

        {/* Right: Preview panel in Archivio */}
        {false && (
          <div
            className="relative bg-white border rounded-md overflow-hidden flex flex-col max-w-[60vw]"
            style={{ width: 576 }}
          >
            <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
              <span className="truncate pr-2">Preview</span>
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