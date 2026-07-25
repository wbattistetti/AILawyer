import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { DockWorkspaceV3, DockWorkspaceV3Handle } from '../DockWorkspaceV3'
import { usePageRegistry } from '../viewers/usePageRegistry'
import { useToast } from '../../hooks/use-toast'
import { Pratica, Comparto, Documento, Cliente } from '../../types'
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
import { PdfViewerShell } from '../viewers/pdf-viewer/PdfViewerShell'
import { isWordDocument, isImageDocument, isVideoDocument, isAudioDocument } from '../viewers/common/utils/viewerUtils'
import { ImageViewer } from '@/features/explorer/components/viewers/ImageViewer'
import { MediaViewer } from '@/features/explorer/components/viewers/MediaViewer'
import { WordViewerShell } from '../viewers/word-viewer/WordViewerShell'
import { useErrorHandling } from './pratica-canvas/hooks/useErrorHandling'
import { useWorkspaceManager } from './pratica-canvas/hooks/useWorkspaceManager';
import { useEventListeners } from './pratica-canvas/hooks/useEventListeners';
import { ArchiveRenderer } from './pratica-canvas/components/ArchiveRenderer';
import { HeaderToolbar } from './pratica-canvas/components/HeaderToolbar'
import { SearchRenderer } from './pratica-canvas/components/SearchRenderer';
import { PersonsRenderer } from './pratica-canvas/components/PersonsRenderer';
import { ClienteMemoriaRenderer } from './pratica-canvas/components/ClienteMemoriaRenderer';
import { OrphanDocPanelCloser } from './pratica-canvas/components/OrphanDocPanelCloser'
import { findDocumentByCriteria } from './pratica-canvas/hooks/useArchiveHelpers'
import { useDocumentStore } from '../../stores/documentStore/store';

// ✅ Helper: calcola hash SHA-256 del file (client-side)
async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// ✅ Helper: genera thumbnail PDF client-side
async function generateClientPdfThumb(file: File, targetW = 300): Promise<string> {
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

// ✅ Helper: detect native text in PDF
async function detectNativeTextClient(file: File): Promise<boolean> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const task = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const textContent = await page.getTextContent()
    const textItemCount = textContent.items.length
    return textItemCount > 10
  } catch {
    return false
  }
}

// ✅ Helper: carica file da filesystem e crea documento nel database
async function uploadFileFromPath(
  filePath: string,
  praticaId: string,
  compartoId: string,
  api: typeof import('../../lib/api').api
): Promise<Documento> {
  // 1. Leggi file dal filesystem
  const response = await fetch('http://localhost:3001/api/filesystem/read-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  })

  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.status}`)
  }

  const fileBlob = await response.blob()
  const fileName = filePath.split(/[/\\]/).pop() || 'unknown'
  const fileObj = new File([fileBlob], fileName, { type: fileBlob.type || 'application/octet-stream' })

  // 2. Calcola hash
  const fileHash = await calculateFileHash(fileObj)

  // 3. Genera thumbnail e rileva testo nativo usando ThumbnailGenerator (supporta PDF, Word, immagini, video)
  let thumbnailDataUrl: string | undefined = undefined
  let hasNativeText: boolean | undefined = undefined

  try {
    const { ThumbnailGenerator } = await import('../../services/documents/ThumbnailGenerator')
    const result = await ThumbnailGenerator.generate(fileObj)
    thumbnailDataUrl = result.thumbnail
    hasNativeText = result.hasNativeText
  } catch (error) {
    console.warn('[UPLOAD-FROM-PATH] Thumbnail generation failed', { fileName, error })
  }

  // 4. Carica file in uploads
  const ext = fileName.substring(fileName.lastIndexOf('.')) || '.bin'
  const s3Key = `${fileHash}${ext}`
  console.log('[UPLOAD-FROM-PATH][UPLOAD][START] Caricamento file nel backend:', { fileName, s3Key, size: fileObj.size })

  // ✅ IMPORTANTE: Usa l'endpoint /upload/local/:key per specificare il s3Key corretto
  // ✅ Invece di usare getUploadUrl che genera un s3Key diverso (timestamp + UUID)
  const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(s3Key)}`
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: fileObj,
    headers: {
      'Content-Type': fileObj.type,
    },
  })

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.statusText}`)
  }

  console.log('[UPLOAD-FROM-PATH][UPLOAD][SUCCESS] File caricato nel backend:', { fileName, s3Key })

  // 5. Crea documento nel database
  const documento = await api.createDocumento({
    praticaId,
    compartoId,
    filename: fileName,
    mime: fileObj.type,
    size: fileObj.size,
    s3Key,
    hash: fileHash,
    ocrStatus: 'pending',
    tags: [],
    thumbnailDataUrl,
    hasNativeText,
    filePath, // ✅ IMPORTANTE: salva il path originale
  })

  return documento
}

export function PraticaCanvasPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { ExplorerProps } = useExplorer()

  const [pratica, setPratica] = useState<Pratica | null>(null)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [clienti, setClienti] = useState<Cliente[]>([])
  // isExplorerFullscreen removed - now handled by PanelWithFullscreenToggle
  const [syncPage, setSyncPage] = useState<number | null>(null)
  const [saveFilesToDb, setSaveFilesToDb] = useState<boolean>(false) // Default: false (privacy mode)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [explorerSelectedPath, setExplorerSelectedPath] = useState<string | undefined>(undefined)

  // Usa i nuovi hooks per la gestione documenti e OCR
  const {
    documenti,
    documentsLoaded,
    clientThumbByS3,
    uploads,
    handleFileDrop,
    handleRemoveThumb,
    pendingMoveConfirmations,
    handleConfirmMove,
    handleCancelMove
  } = useArchive(id, comparti)

  // ✅ Accesso diretto allo store per ottenere tutti i documenti in memoria (inclusi temporanei)
  const store = useDocumentStore()

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

  // ✅ Stato globale per classificazioni pendenti (in memoria, non ancora nel database)
  // Map<filePath, { compartoKey, compartoNome }>
  const pendingFileClassificationsRef = useRef<Map<string, { compartoKey: string; compartoNome: string }>>(new Map())
  const [pendingClassificationsVersion, setPendingClassificationsVersion] = useState(0) // Per forzare re-render

  // ✅ Funzione per aggiornare classificazioni pendenti
  const updatePendingClassification = useCallback((filePath: string, classification: { compartoKey: string; compartoNome: string } | null) => {
    if (classification) {
      pendingFileClassificationsRef.current.set(filePath, classification)
    } else {
      pendingFileClassificationsRef.current.delete(filePath)
    }
    setPendingClassificationsVersion(prev => prev + 1) // Forza re-render
    // Notifica che le classificazioni sono cambiate
    window.dispatchEvent(new CustomEvent('app:file-classifications-changed'))
  }, [])

  // Verify mode state (completely removed)

  // Usa il nuovo hook per gestire tutti gli event listeners
  useEventListeners({
    documenti,
    clientThumbByS3,
    dockV2Ref,
    handleFileDrop
  })

  // ✅ Esponi dati globalmente per DrawerViewer (cassetti) e Explorer
  useEffect(() => {
    const archiveData = {
      praticaId: id, // ✅ Aggiunto per DrawerViewer se vuole usare gli hook direttamente
      documenti,
      uploads,
      clientThumbByS3,
      comparti,
      handleFileDrop,
      handleRemoveThumb,
      handleOcr,
      handleOcrCancel,
      ocrProgressByDoc,
      ocrEtaByDoc,
      ocrStatusByDoc,
      ocrCancellingByDoc,
      transcribedPctByDoc,
      dockV2Ref,
      toast,
      // ✅ NOVO: Esponi classificazioni pendenti per ArchiveRenderer
      pendingFileClassifications: pendingFileClassificationsRef.current,
      pendingClassificationsVersion,
      // ✅ NUOVO: Esponi funzioni per gestire conferme spostamento
      pendingMoveConfirmations,
      handleConfirmMove,
      handleCancelMove
    }

    ;(window as any).__archiveData = archiveData

    // ✅ NOVO: Esponi funzione per aggiornare classificazioni pendenti (per Explorer)
    ;(window as any).__updatePendingClassification = updatePendingClassification

    // ✅ Emetti evento per notificare DrawerViewer dell'aggiornamento
    window.dispatchEvent(new CustomEvent('app:archive-data-updated'))
  }, [
    id, // ✅ Aggiunto id alle dipendenze
    documenti,
    uploads,
    clientThumbByS3,
    comparti,
    handleFileDrop,
    handleRemoveThumb,
    handleOcr,
    handleOcrCancel,
    ocrProgressByDoc,
    ocrEtaByDoc,
    ocrStatusByDoc,
    ocrCancellingByDoc,
    transcribedPctByDoc,
    dockV2Ref,
    toast,
    updatePendingClassification,
    pendingClassificationsVersion,
    pendingMoveConfirmations,
    handleConfirmMove,
    handleCancelMove
  ])





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

  // ✅ Funzione per normalizzare i nomi dei comparti (converte vecchi nomi ai nuovi)
  const normalizeCompartoNome = useCallback((nome: string): string => {
    // Mappa i vecchi nomi ai nuovi (tutti i possibili nomi vecchi)
    const nomeMap: Record<string, string> = {
      // Vecchi nomi completi
      'O.C.C.C. ANAGRAFICA INQUISITO': 'Parti & Anagrafiche',
      'FATTO REATI CONTESTATI P.M.': 'Admin & Procure',
      'INFORMATIVE': 'Denuncia–Querela / Notizia di reato',
      'FASCICOLO P.M. e GIP': 'Indagini preliminari',
      'VERBALI: ARRESTO PERQUISIZIONI SEQUESTRO': 'Verbal: Arresto Perquisizioni Sequestro',
      'INTERROGATORI E DICHIARAZIONI': 'Interrogatori e Dichiarazioni',
      'INTERCETTAZIONI TELEFONICHE': 'Corrispondenza & PEC',
      'ELENCO UTENZE SCADENZE PROROGHE': 'Elenco Utenze Scadenze Proroghe',
      'TRASCRIZIONI INTERCETTAZIONI TELEFONICHE': 'Trascrizioni Intercettazioni Telefoniche',
      'ATTI INTERLOCUTORI CORRISPONDENZA VARIA': 'Atti Interlocutori Corrispondenza Varia',
      'NOMI CITATI IN ATTI FREQUENTAZIONI': 'Nomi Citati in Atti Frequentazioni',
      'CONTESTAZIONI P.M./GIP': 'Contestazioni P.M./GIP',
      'RACCOLTA PROVE OSSERVAZIONI': 'Raccolta Prove Osservazioni',
      'MAPPE CONCETTUALI GRAFICO': 'Mappe Concettuali Grafico',
      'NOTE A CAMPO LIBERO': 'Note a Campo Libero',
      // Altri possibili nomi vecchi
      'Indagini preliminari (PG/PM, 415-bis)': 'Indagini preliminari',
      'Perizie & Consulenze (CTP/CTU)': 'Perizie e Consulenze',
      'Prove & Allegati (foto, audio, chat)': 'Prove e Allegati',
      'Provvedimenti del giudice (GIP/GUP/Trib.)': 'Provvedimenti (GIP GUP Trib)',
      'Da classificare': 'Parti & Anagrafiche', // Vecchio comparto da classificare mappato al primo
    }
    return nomeMap[nome] || nome
  }, [])

  // Load pratica data
  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setIsLoading(true)
        const [p, c, clientiData] = await Promise.all([
          api.getPratica(id!),
          api.getComparti(id!),
          api.getClientiByPratica(id!)
        ])
        setPratica(p)
        // ✅ Normalizza i nomi dei comparti
        const normalizedComparti = c.map(comparto => ({
          ...comparto,
          nome: normalizeCompartoNome(comparto.nome)
        }))
        setComparti(normalizedComparti)
        setClienti(clientiData.clienti)
        // ✅ Ripristina lo stato Explorer se presente
        if (p.explorerState) {
          try {
            const explorerState = JSON.parse(p.explorerState)
            if (explorerState.selectedPath) {
              // ✅ Passa l'intero oggetto stato per permettere a Explorer di cercare per volume label
              setExplorerSelectedPath(JSON.stringify(explorerState))
            }
          } catch (err) {
            console.warn('[EXPLORER] Errore parsing explorerState:', err)
            // ✅ Fallback: se non è JSON, potrebbe essere solo il path (vecchio formato)
            if (typeof p.explorerState === 'string' && !p.explorerState.startsWith('{')) {
              setExplorerSelectedPath(p.explorerState)
            }
          }
        }
        // Clienti caricati
      } catch (error) {
        console.error('Failed to load pratica:', error)
        toast({ title: 'Errore', description: 'Impossibile caricare la pratica', variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, toast, setIsLoading, normalizeCompartoNome])

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
  const renderDocViewer = (doc: Documento, panelApi?: any) => {
    // ✅ PRIORITÀ 1: localUrl (blob URL per file piccoli durante editing)
    // ✅ PRIORITÀ 2: s3Key (per documenti salvati - repository) - SEMPRE preferire s3Key se disponibile
    // ✅ PRIORITÀ 3: filePath (per file grandi durante editing - streaming diretto) - SOLO se s3Key non disponibile
    // ✅ CORREZIONE: filePath può essere obsoleto o non accessibile dopo il salvataggio, quindi s3Key ha priorità
    const fileUrl = (doc as any).localUrl ||
                    (doc.s3Key ? api.getLocalFileUrl(doc.s3Key) : null) ||
                    ((doc as any).filePath ?
                      `http://localhost:3001/api/filesystem/file/${encodeURIComponent((doc as any).filePath)}` :
                      null)

    if (!fileUrl) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-gray-500">File non disponibile</p>
        </div>
      )
    }

    // ✅ Usa WordViewerShell per documenti Word
    if (isWordDocument(doc)) {
      return (
        <WordViewerShell
          fileUrl={fileUrl}
          page={syncPage || 1}
          onPageChange={(page) => {
            setSyncPage(page)
          }}
          docId={doc.id}
          praticaId={id || ''}
          docName={doc.filename}
          hasNativeText={true} // Word ha sempre testo nativo
          panelApi={panelApi} // ✅ Passa panelApi per gestione attivazione automatica
        />
      )
    }

    // ✅ Usa ImageViewer per immagini
    if (isImageDocument(doc)) {
      return (
        <div className="w-full h-full overflow-auto bg-background">
          <ImageViewer
            file={{
              id: doc.id,
              path: fileUrl,
              name: doc.filename,
              kind: 'image',
              sizeBytes: (doc as any).sizeBytes,
              mtime: (doc as any).mtime
            }}
            className="w-full h-full"
          />
        </div>
      )
    }

    // ✅ Usa MediaViewer per video
    if (isVideoDocument(doc)) {
      return (
        <div className="w-full h-full overflow-auto bg-background">
          <MediaViewer
            file={{
              id: doc.id,
              path: fileUrl,
              name: doc.filename,
              kind: 'video',
              sizeBytes: (doc as any).sizeBytes,
              mtime: (doc as any).mtime
            }}
            className="w-full h-full"
          />
        </div>
      )
    }

    // ✅ Usa MediaViewer per audio
    if (isAudioDocument(doc)) {
      return (
        <div className="w-full h-full overflow-auto bg-background">
          <MediaViewer
            file={{
              id: doc.id,
              path: fileUrl,
              name: doc.filename,
              kind: 'audio',
              sizeBytes: (doc as any).sizeBytes,
              mtime: (doc as any).mtime
            }}
            className="w-full h-full"
          />
        </div>
      )
    }

    // ✅ Usa PdfViewerShell per PDF (default)
    return (
      <PdfViewerShell
        fileUrl={fileUrl}
        page={syncPage || 1}
        lines={null}
        docId={doc.id}
        documentHash={doc.hash}
        storageKey={doc.s3Key}
        praticaId={id || ''}
        onPageChange={(page) => {
          setSyncPage(page)
        }}
        docName={doc.filename}
        hasNativeText={doc.hasNativeText}
        panelApi={panelApi} // ✅ Passa panelApi per gestione attivazione automatica
      />
    )
  }

  // legacy alias removed
  // ✅ AnalysisPanel è ora un componente separato importato

  // REMOVED: renderArchivePane & handleOcr - now replaced by DocumentCollection and useOcr hook
  // REMOVED: AnalysisPanel inline function - now using imported component

  // Event listeners gestiti dal hook useEventListeners

  const renderEvents = useCallback(() => <EventsTab />, [])
  const renderContacts = useCallback(() => <ThingCardsPanel kind="contact" />, [])
  const renderIds = useCallback(() => <ThingCardsPanel kind="id" />, [])

  // Explorer fullscreen handlers - stato esplicito basato sulla tab selezionata
  // handleLeftBorderTabChange removed - fullscreen now handled by PanelWithFullscreenToggle

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
        onSavePratica={async () => {
          if (!id || !pratica) {
            console.warn('[SAVE][PRATICA][FRONTEND] Dati mancanti', { id, pratica })
            return
          }

          setIsSaving(true)

          // ✅ Salva anche lo stato Explorer (mantieni formato completo se già presente)
          let explorerState: string | undefined = undefined
          if (explorerSelectedPath) {
            try {
              // Se è già un JSON string, parsalo e mantieni tutti i campi
              const parsed = JSON.parse(explorerSelectedPath)
              explorerState = JSON.stringify(parsed)
            } catch {
              // Se non è JSON, crea nuovo oggetto con solo selectedPath
              explorerState = JSON.stringify({ selectedPath: explorerSelectedPath })
            }
          }

          const dataToSave = {
            numeroRuolo: pratica.numeroRuolo,
            foro: pratica.foro,
            pmGiudice: pratica.pmGiudice || undefined,
            explorerState
          }

          // Log rimosso (troppo rumoroso)

          try {
            // Salva i dati modificati della pratica
            const updated = await api.updatePratica(id, dataToSave)

            // ✅ NOVO: Salva classificazioni pendenti nel database
            // ✅ IMPORTANTE: Carica prima i documenti dal database per verificare se esistono
            let dbDocsForClassifications: Documento[] = []
            try {
              dbDocsForClassifications = await api.getDocumentiByPratica(id!)
            } catch (error) {
              console.error('[SAVE][CLASSIFICATIONS][LOAD-DB][ERROR] Errore caricamento documenti dal DB:', error)
            }

            // ✅ Crea mappa per lookup veloce: filePath -> documento DB
            const dbDocsByFilePath = new Map<string, Documento>()
            for (const doc of dbDocsForClassifications) {
              if ((doc as any).filePath) {
                dbDocsByFilePath.set((doc as any).filePath, doc)
              }
            }

            const classificationsToSave = Array.from(pendingFileClassificationsRef.current.entries())
            console.log('[SAVE][CLASSIFICATIONS][START]', { count: classificationsToSave.length })

            for (const [filePath, classification] of classificationsToSave) {
              try {
                const comparto = comparti.find(c => c.key === classification.compartoKey)
                if (!comparto) {
                  console.warn('[SAVE][CLASSIFICATIONS][SKIP] Comparto non trovato', { filePath, compartoKey: classification.compartoKey })
                  continue
                }

                // ✅ Cerca se il file esiste già nel database (per filePath)
                // ✅ IMPORTANTE: Cerca solo nei documenti del database, non in quelli temporanei
                const existingDbDoc = dbDocsByFilePath.get(filePath)

                // ✅ Verifica anche se è un documento temporaneo che deve essere creato
                const existingMemDoc = documenti.find(d => (d as any).filePath === filePath)
                const isTemporaryDoc = existingMemDoc && (
                  /^[0-9a-f]{64}$/i.test(existingMemDoc.id) ||
                  existingMemDoc.id.startsWith('temp:') ||
                  existingMemDoc.id.startsWith('pending:')
                )

                if (existingDbDoc) {
                  // ✅ File già nel database: aggiorna compartoId
                  console.log('[SAVE][CLASSIFICATIONS][UPDATE] Aggiorno documento esistente nel DB', { docId: existingDbDoc.id, compartoId: comparto.id })
                  try {
                    await api.updateDocumento(existingDbDoc.id, { compartoId: comparto.id })
                  } catch (error) {
                    console.error('[SAVE][CLASSIFICATIONS][UPDATE][ERROR] Errore aggiornamento documento:', { docId: existingDbDoc.id, error })
                    // Non bloccare il salvataggio per un singolo errore
                  }
                } else if (isTemporaryDoc) {
                  // ✅ Documento temporaneo: sarà gestito dal salvataggio differenziale
                  // ✅ Non fare nulla qui - il salvataggio differenziale lo creerà/aggiornerà
                  console.log('[SAVE][CLASSIFICATIONS][SKIP] Documento temporaneo, gestito dal salvataggio differenziale:', { filePath, docId: existingMemDoc.id })
                } else {
                  // ✅ File non ancora nel database: carica automaticamente
                  console.log('[SAVE][CLASSIFICATIONS][UPLOAD] Carico file automaticamente', { filePath, compartoId: comparto.id })
                  try {
                    await uploadFileFromPath(filePath, id!, comparto.id, api)
                    console.log('[SAVE][CLASSIFICATIONS][UPLOAD][SUCCESS] File caricato e documento creato', { filePath })
                  } catch (error) {
                    console.error('[SAVE][CLASSIFICATIONS][UPLOAD][ERROR] Errore nel caricamento file', { filePath, error })
                    // Non bloccare il salvataggio per un singolo file, ma mostra un warning
                    toast({
                      title: 'Attenzione',
                      description: `Impossibile caricare il file: ${filePath.split(/[/\\]/).pop()}`,
                      variant: 'destructive'
                    })
                  }
                }
              } catch (error) {
                console.error('[SAVE][CLASSIFICATIONS][ERROR]', { filePath, error })
              }
            }

            // ✅ Pulisci classificazioni pendenti dopo il salvataggio
            pendingFileClassificationsRef.current.clear()
            setPendingClassificationsVersion(prev => prev + 1)
            console.log('[SAVE][CLASSIFICATIONS][DONE] Classificazioni salvate e pulite')

            // ✅ CONFRONTO DIFFERENZIALE: Sincronizza documenti in memoria con database
            console.log('[SAVE][DIFF][START] Avvio confronto differenziale documenti')
            try {
              // 1. Carica documenti dal database
              const dbDocs = await api.getDocumentiByPratica(id!)
              console.log('[SAVE][DIFF] Documenti nel DB:', dbDocs.length, {
                dbDocs: dbDocs.map(d => ({
                  id: d.id,
                  filename: d.filename,
                  hash: d.hash?.substring(0, 16) + '...' || 'N/A',
                  s3Key: d.s3Key?.substring(0, 30) + '...' || 'N/A'
                }))
              })

              // ✅ Crea mappa per lookup veloce: filePath -> documento DB
              const dbDocsByFilePath = new Map<string, Documento>()
              for (const doc of dbDocs) {
                if ((doc as any).filePath) {
                  dbDocsByFilePath.set((doc as any).filePath, doc)
                }
              }

              // 2. Ottieni tutti i documenti in memoria (inclusi temporanei)
              const memoryDocs = store.getAllDocuments()
              console.log('[SAVE][DIFF] Documenti in memoria:', memoryDocs.length, {
                memoryDocs: memoryDocs.map(d => ({
                  id: d.id,
                  filename: d.filename,
                  hash: (d as any).hash?.substring(0, 16) + '...' || 'N/A',
                  s3Key: d.s3Key?.substring(0, 30) + '...' || 'N/A'
                }))
              })

              // 3. Identifica documenti da eliminare (nel DB ma non in memoria)
              // ✅ CORREZIONE: Crea mappe per lookup veloce usando hash/s3Key/id
              // ✅ Questo risolve il problema del mismatch tra ID DB e ID store (hash)
              const memoryDocsByHash = new Map<string, Documento>()
              const memoryDocsByS3Key = new Map<string, Documento>()
              const memoryDocsById = new Map<string, Documento>()

              for (const memDoc of memoryDocs) {
                // Crea mappe per lookup veloce
                if ((memDoc as any).hash && (memDoc as any).hash.length === 64) {
                  memoryDocsByHash.set((memDoc as any).hash, memDoc)
                }
                if (memDoc.s3Key) {
                  memoryDocsByS3Key.set(memDoc.s3Key, memDoc)
                }
                memoryDocsById.set(memDoc.id, memDoc)
              }

              // ✅ Documenti da eliminare: quelli nel DB che NON hanno corrispondenza in memoria
              // ✅ Confronta usando hash, s3Key E id (per coprire tutti i casi)
              const docsToDelete = dbDocs.filter(dbDoc => {
                // Verifica se esiste in memoria per hash
                if (dbDoc.hash && dbDoc.hash.length === 64) {
                  if (memoryDocsByHash.has(dbDoc.hash)) {
                    return false // Esiste in memoria
                  }
                }

                // Verifica se esiste in memoria per s3Key
                if (dbDoc.s3Key) {
                  if (memoryDocsByS3Key.has(dbDoc.s3Key)) {
                    return false // Esiste in memoria
                  }
                }

                // Verifica se esiste in memoria per ID (per retrocompatibilità)
                if (memoryDocsById.has(dbDoc.id)) {
                  return false // Esiste in memoria
                }

                // Non trovato in memoria → da eliminare
                return true
              })

              console.log('[SAVE][DIFF] Documenti da eliminare:', docsToDelete.length, {
                toDelete: docsToDelete.map(d => ({
                  id: d.id,
                  filename: d.filename,
                  hash: d.hash?.substring(0, 16) + '...' || 'N/A',
                  s3Key: d.s3Key?.substring(0, 30) + '...' || 'N/A'
                }))
              })

              for (const docToDelete of docsToDelete) {
                try {
                  // ✅ Elimina documento dal database (il backend gestirà l'eliminazione del file S3 se non condiviso)
                  await api.deleteDocumento(docToDelete.id)
                  console.log('[SAVE][DIFF][DELETE] Documento eliminato:', docToDelete.filename)
                } catch (error) {
                  console.error('[SAVE][DIFF][DELETE][ERROR] Errore eliminazione documento:', docToDelete.id, error)
                  // Non bloccare il salvataggio per un singolo errore
                }
              }

              // 4. Identifica documenti nuovi o modificati (in memoria)
              for (const memDoc of memoryDocs) {
                // ✅ Log dettagliato per debug
                console.log('[SAVE][DIFF][DOC] Analisi documento:', {
                  filename: memDoc.filename,
                  docId: memDoc.id,
                  compartoId: memDoc.compartoId,
                  hasFilePath: !!(memDoc as any).filePath,
                  hasLocalUrl: !!(memDoc as any).localUrl,
                  hasS3Key: !!memDoc.s3Key,
                  hasHash: !!(memDoc as any).hash
                })

                // ✅ Identifica documenti temporanei (hash-based o temp:/pending:)
                const isHashOnly = /^[0-9a-f]{64}$/i.test(memDoc.id)
                const isTempPrefix = memDoc.id.startsWith('temp:') || memDoc.id.startsWith('pending:')
                const isTemporary = isTempPrefix || isHashOnly

                // ✅ Verifica se il documento esiste già nel database (per hash o s3Key)
                const existingDbDoc = dbDocs.find(d =>
                  d.id === memDoc.id ||
                  (memDoc.s3Key && d.s3Key === memDoc.s3Key) ||
                  ((memDoc as any).hash && d.hash === (memDoc as any).hash)
                )

                if (isTemporary && !existingDbDoc) {
                  // ✅ Documento nuovo: deve essere creato nel database
                  // ✅ Se ha filePath, carica il file e uploada
                  const filePath = (memDoc as any).filePath
                  if (filePath) {
                    try {
                      // ✅ Verifica che compartoId sia definito
                      if (!memDoc.compartoId) {
                        console.warn('[SAVE][DIFF][CREATE][WARN] CompartoId non definito per documento:', {
                          filename: memDoc.filename,
                          docId: memDoc.id,
                          filePath
                        })
                        // ✅ Usa il primo comparto disponibile come fallback
                        const defaultComparto = comparti.length > 0 ? comparti[0].id : undefined
                        if (!defaultComparto) {
                          throw new Error(`Nessun comparto disponibile per il documento: ${memDoc.filename}`)
                        }
                        console.log('[SAVE][DIFF][CREATE] Usando comparto di default:', defaultComparto)
                        await uploadFileFromPath(filePath, id!, defaultComparto, api)
                      } else {
                        console.log('[SAVE][DIFF][CREATE] Carico nuovo documento da filePath:', {
                          filePath,
                          filename: memDoc.filename,
                          compartoId: memDoc.compartoId
                        })
                        await uploadFileFromPath(filePath, id!, memDoc.compartoId, api)
                      }
                      console.log('[SAVE][DIFF][CREATE][SUCCESS] Documento creato:', memDoc.filename)
                    } catch (error) {
                      console.error('[SAVE][DIFF][CREATE][ERROR] Errore creazione documento:', memDoc.filename, error)
                      toast({
                        title: 'Attenzione',
                        description: `Impossibile caricare il file: ${memDoc.filename}`,
                        variant: 'destructive'
                      })
                    }
                  } else {
                    // ✅ SALVATAGGIO DIFFERENZIALE: Carica il file solo se non esiste già nel backend
                    // ✅ Usa hash + dimensione per verificare se il file è identico
                    const localUrl = (memDoc as any).localUrl
                    const filePath = (memDoc as any).filePath
                    const isVideo = memDoc.mime?.startsWith('video/') ||
                                    /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(memDoc.filename)
                    let finalS3Key = memDoc.s3Key
                    let finalHash = (memDoc as any).hash || (memDoc.id.startsWith('video:') ? '' : memDoc.id)
                    let finalSize = memDoc.size || 0

                    console.log('[SAVE][DIFF][CREATE] Documento temporaneo da salvare:', {
                      filename: memDoc.filename,
                      isVideo,
                      hasLocalUrl: !!localUrl,
                      hasFilePath: !!filePath,
                      hasS3Key: !!memDoc.s3Key,
                      hasHash: !!finalHash,
                      hash: finalHash?.substring(0, 16) + '...' || 'NO-HASH',
                      size: finalSize
                    })

                    // ✅ STEP 1: Recupera file e calcola hash lazy (soprattutto per video)
                    let fileObj: File | null = null

                    // ✅ PER VIDEO: recupera File reference dal fileReferenceStore
                    if (isVideo && memDoc.id.startsWith('video:')) {
                      const { getFileReference } = await import('../../stores/documentStore/fileReferenceStore')
                      const fileRef = getFileReference(memDoc.id)
                      if (fileRef) {
                        fileObj = fileRef
                        console.log('[SAVE][DIFF][CREATE][VIDEO] File reference recuperato:', {
                          filename: memDoc.filename,
                          size: fileObj.size
                        })
                      } else if (filePath) {
                        // ✅ Fallback: se non c'è File reference, usa filePath
                        console.log('[SAVE][DIFF][CREATE][VIDEO] File reference non trovato, uso filePath:', filePath)
                        // fileObj sarà creato da uploadFileFromPath
                      } else {
                        console.error('[SAVE][DIFF][CREATE][VIDEO][ERROR] Nessun File reference o filePath disponibile per video:', memDoc.filename)
                        toast({
                          title: 'Errore',
                          description: `Impossibile salvare il video: ${memDoc.filename}. File non disponibile.`,
                          variant: 'destructive'
                        })
                        continue
                      }
                    }

                    // ✅ PER ALTRI FILE: usa localUrl (blob URL) o filePath
                    if (!fileObj && localUrl && localUrl.startsWith('blob:')) {
                      try {
                        const response = await fetch(localUrl)
                        if (!response.ok) {
                          throw new Error(`Failed to fetch blob: ${response.status}`)
                        }
                        const blob = await response.blob()
                        fileObj = new File([blob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })
                      } catch (error) {
                        console.error('[SAVE][DIFF][CREATE][ERROR] Errore recupero file da blob URL:', memDoc.filename, error)
                        toast({
                          title: 'Errore',
                          description: `Impossibile recuperare il file: ${memDoc.filename}`,
                          variant: 'destructive'
                        })
                        continue
                      }
                    }

                    // ✅ PER VIDEO CON FILEPATH: usa streaming copy-from-path (zero memoria)
                    if (isVideo && filePath && !fileObj) {
                      try {
                        // ✅ STEP 1: Calcola hash lazy (leggendo file in streaming)
                        if (!finalHash || finalHash.length !== 64) {
                          console.log('[SAVE][DIFF][CREATE][VIDEO][HASH][LAZY] Calcolo hash lazy da filePath:', filePath)
                          // ✅ Leggi file in streaming per calcolare hash (non tutto in memoria)
                          const hashResponse = await fetch('http://localhost:3001/api/filesystem/read-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filePath }),
                          })
                          if (!hashResponse.ok) {
                            throw new Error(`Failed to read file for hash: ${hashResponse.status}`)
                          }
                          const hashBlob = await hashResponse.blob()
                          const hashFileObj = new File([hashBlob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })
                          finalHash = await calculateFileHash(hashFileObj)
                          finalSize = hashFileObj.size
                          console.log('[SAVE][DIFF][CREATE][VIDEO][HASH][LAZY][SUCCESS] Hash calcolato:', finalHash.substring(0, 16) + '...')
                        }

                        // ✅ STEP 2: Genera s3Key
                        const ext = memDoc.filename.substring(memDoc.filename.lastIndexOf('.')) || '.bin'
                        finalS3Key = `${finalHash}${ext}`

                        // ✅ STEP 3: Verifica se esiste già nel backend
                        const existingDoc = dbDocs.find(d =>
                          d.hash === finalHash ||
                          (d.s3Key === finalS3Key)
                        )

                        if (existingDoc) {
                          // ✅ File già presente - aggiorna solo metadati
                          console.log('[SAVE][DIFF][CREATE][VIDEO][SKIP-UPLOAD] File già presente nel backend:', memDoc.filename)
                          const updateData: any = {}
                          if (existingDoc.compartoId !== memDoc.compartoId) {
                            updateData.compartoId = memDoc.compartoId
                          }
                          // ✅ Aggiorna sempre la thumbnail se memDoc ce l'ha (indipendentemente da existingDoc)
                          // Questo risolve il problema quando la thumbnail è stata persa durante il ricaricamento
                          if ((memDoc as any).thumbnailDataUrl) {
                            updateData.thumbnailDataUrl = (memDoc as any).thumbnailDataUrl
                          }
                          if (Object.keys(updateData).length > 0) {
                            await api.updateDocumento(existingDoc.id, updateData)
                          }
                          continue
                        }

                        // ✅ STEP 4: Copia file con streaming (zero memoria)
                        console.log('[SAVE][DIFF][CREATE][VIDEO][COPY] Copia streaming filePath → repository:', filePath)
                        const copyResponse = await fetch('http://localhost:3001/api/upload/copy-from-path', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ filePath, s3Key: finalS3Key }),
                        })

                        if (!copyResponse.ok) {
                          throw new Error(`Copy failed: ${copyResponse.statusText}`)
                        }

                        console.log('[SAVE][DIFF][CREATE][VIDEO][COPY][SUCCESS] File copiato nel repository:', memDoc.filename)

                        // ✅ STEP 5: Crea documento nel database
                        await api.createDocumento({
                          praticaId: id!,
                          compartoId: memDoc.compartoId,
                          filename: memDoc.filename,
                          mime: memDoc.mime || 'application/octet-stream',
                          size: finalSize,
                          s3Key: finalS3Key,
                          hash: finalHash,
                          ocrStatus: 'pending',
                          tags: [],
                          thumbnailDataUrl: (memDoc as any).thumbnailDataUrl,
                          hasNativeText: false,
                          filePath: undefined
                        })

                        // ✅ Aggiorna ID del documento nello store da temporaneo a hash
                        const { removeFileReference } = await import('../../stores/documentStore/fileReferenceStore')
                        const store = useDocumentStore.getState()
                        removeFileReference(memDoc.id)
                        const existingDocInStore = store.getDocument(memDoc.id)
                        if (existingDocInStore) {
                          store.removeDocument(memDoc.id)
                          store.addDocument({
                            ...existingDocInStore,
                            id: finalHash,
                            hash: finalHash,
                            s3Key: finalS3Key,
                            size: finalSize
                          })
                        }

                        console.log('[SAVE][DIFF][CREATE][VIDEO][SUCCESS] Video salvato:', memDoc.filename)
                        continue
                      } catch (error) {
                        console.error('[SAVE][DIFF][CREATE][VIDEO][ERROR] Errore salvataggio video:', memDoc.filename, error)
                        toast({
                          title: 'Errore',
                          description: `Impossibile salvare il video: ${memDoc.filename}`,
                          variant: 'destructive'
                        })
                        continue
                      }
                    }

                    // ✅ Se abbiamo fileObj, calcola hash lazy e procedi con upload
                    if (fileObj) {
                      try {
                        // ✅ Calcola hash lazy (soprattutto per video)
                        if (!finalHash || finalHash.length !== 64) {
                          console.log('[SAVE][DIFF][CREATE][HASH][LAZY] Calcolo hash lazy:', memDoc.filename)
                          finalHash = await calculateFileHash(fileObj)
                          console.log('[SAVE][DIFF][CREATE][HASH][LAZY][SUCCESS] Hash calcolato:', finalHash.substring(0, 16) + '...')
                        }

                        // Aggiorna dimensione reale
                        finalSize = fileObj.size

                        // Genera s3Key definitivo (hash + estensione)
                        const ext = memDoc.filename.substring(memDoc.filename.lastIndexOf('.')) || '.bin'
                        finalS3Key = `${finalHash}${ext}`

                        // ✅ STEP 2: Verifica se esiste già un documento con lo stesso hash nel backend
                        // ✅ Questo evita di ricaricare file già presenti
                        const existingDoc = dbDocs.find(d =>
                          d.hash === finalHash ||
                          (d.s3Key === finalS3Key)
                        )

                        if (existingDoc) {
                          // ✅ File già presente nel backend - non serve ricaricarlo!
                          console.log('[SAVE][DIFF][CREATE][SKIP-UPLOAD] File già presente nel backend:', {
                            filename: memDoc.filename,
                            existingDocId: existingDoc.id,
                            existingS3Key: existingDoc.s3Key,
                            hash: finalHash.substring(0, 16) + '...'
                          })

                          // ✅ Usa il documento esistente, ma aggiorna se necessario (compartoId, thumbnail, ecc.)
                          const updateData: any = {}
                          if (existingDoc.compartoId !== memDoc.compartoId) {
                            updateData.compartoId = memDoc.compartoId
                          }
                          // ✅ Aggiorna sempre la thumbnail se memDoc ce l'ha (indipendentemente da existingDoc)
                          // Questo risolve il problema quando la thumbnail è stata persa durante il ricaricamento
                          if ((memDoc as any).thumbnailDataUrl) {
                            updateData.thumbnailDataUrl = (memDoc as any).thumbnailDataUrl
                          }
                          if ((memDoc as any).hasNativeText !== undefined && (existingDoc as any).hasNativeText !== (memDoc as any).hasNativeText) {
                            updateData.hasNativeText = (memDoc as any).hasNativeText
                          }

                          if (Object.keys(updateData).length > 0) {
                            await api.updateDocumento(existingDoc.id, updateData)
                            console.log('[SAVE][DIFF][CREATE][UPDATE] Documento esistente aggiornato:', memDoc.filename)
                          } else {
                            console.log('[SAVE][DIFF][CREATE][SKIP] Documento già presente, nessun aggiornamento necessario')
                          }

                          // ✅ Salta il caricamento del file - è già presente!
                          continue
                        }

                        // ✅ STEP 3: File non presente - caricalo nel backend
                        console.log('[SAVE][DIFF][CREATE][UPLOAD] File non presente nel backend, caricamento:', memDoc.filename)

                        // ✅ IMPORTANTE: Usa l'endpoint /upload/local/:key con il s3Key basato sull'hash
                        // ✅ Invece di usare getUploadUrl che genera un s3Key diverso (timestamp + UUID)
                        const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(finalS3Key)}`
                        const uploadResponse = await fetch(uploadUrl, {
                          method: 'PUT',
                          body: fileObj,
                          headers: {
                            'Content-Type': fileObj.type,
                          },
                        })

                        if (!uploadResponse.ok) {
                          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
                        }

                        console.log('[SAVE][DIFF][CREATE][UPLOAD][SUCCESS] File caricato nel backend:', {
                          filename: memDoc.filename,
                          s3Key: finalS3Key,
                          size: finalSize,
                          hash: finalHash.substring(0, 16) + '...'
                        })
                      } catch (uploadError) {
                        console.error('[SAVE][DIFF][CREATE][UPLOAD][ERROR] Errore caricamento file:', memDoc.filename, uploadError)
                        toast({
                          title: 'Errore',
                          description: `Impossibile caricare il file: ${memDoc.filename}`,
                          variant: 'destructive'
                        })
                        continue
                      }
                    } else {
                      // ⚠️ Nessun blob URL disponibile
                      console.warn('[SAVE][DIFF][CREATE][WARN] Documento temporaneo senza blob URL:', memDoc.filename)

                      // Se ha già un s3Key, verifica che il file esista
                      if (memDoc.s3Key) {
                        try {
                          const testUrl = api.getLocalFileUrl(memDoc.s3Key)
                          const testResponse = await fetch(testUrl, { method: 'HEAD' })
                          if (!testResponse.ok) {
                            throw new Error(`File non trovato nel backend: ${memDoc.s3Key}`)
                          }
                          finalS3Key = memDoc.s3Key
                          console.log('[SAVE][DIFF][CREATE][VERIFY][OK] File esiste già nel backend:', memDoc.s3Key)
                        } catch (verifyError) {
                          console.error('[SAVE][DIFF][CREATE][VERIFY][ERROR] File non trovato e nessun blob URL disponibile:', memDoc.filename)
                          toast({
                            title: 'Errore',
                            description: `Impossibile trovare il file: ${memDoc.filename}. Il file potrebbe non essere più disponibile.`,
                            variant: 'destructive'
                          })
                          continue
                        }
                      } else {
                        // Nessun blob URL e nessun s3Key - impossibile salvare
                        console.error('[SAVE][DIFF][CREATE][ERROR] Documento senza blob URL e senza s3Key:', memDoc.filename)
                        toast({
                          title: 'Errore',
                          description: `Impossibile salvare il documento: ${memDoc.filename}. File non disponibile.`,
                          variant: 'destructive'
                        })
                        continue
                      }
                    }

                    // ✅ STEP 4: Crea documento nel database
                    // ✅ Dopo il caricamento (o verifica) del file, il documento è completamente autonomo
                    try {
                      const s3Key = finalS3Key || `${finalHash}${memDoc.filename.substring(memDoc.filename.lastIndexOf('.')) || '.bin'}`
                      console.log('[SAVE][DIFF][CREATE][DB] Creazione documento nel database:', {
                        filename: memDoc.filename,
                        s3Key: s3Key.substring(0, 30),
                        hash: finalHash?.substring(0, 30),
                        size: finalSize,
                        hasThumbnail: !!(memDoc as any).thumbnailDataUrl
                      })
                      const createdDoc = await api.createDocumento({
                        praticaId: id!,
                        compartoId: memDoc.compartoId,
                        filename: memDoc.filename,
                        mime: memDoc.mime || 'application/octet-stream',
                        size: finalSize,
                        s3Key,
                        hash: finalHash,
                        ocrStatus: 'pending',
                        tags: [],
                        // ✅ Passa null invece di undefined per evitare che JSON.stringify rimuova il campo
                        thumbnailDataUrl: (memDoc as any).thumbnailDataUrl || null,
                        hasNativeText: (memDoc as any).hasNativeText,
                        // ❌ NON salvare filePath - il documento deve essere autonomo
                        filePath: undefined
                      })
                      console.log('[SAVE][DIFF][CREATE][SUCCESS] Documento creato e file caricato:', memDoc.filename)

                      // ✅ PER VIDEO: aggiorna ID del documento nello store da temporaneo a hash
                      if (isVideo && memDoc.id.startsWith('video:')) {
                        const { removeFileReference } = await import('../../stores/documentStore/fileReferenceStore')
                        const store = useDocumentStore.getState()

                        // ✅ Rimuovi File reference (non più necessario)
                        removeFileReference(memDoc.id)

                        // ✅ Aggiorna documento nello store con nuovo ID (hash)
                        const existingDoc = store.getDocument(memDoc.id)
                        if (existingDoc) {
                          store.removeDocument(memDoc.id)
                          store.addDocument({
                            ...existingDoc,
                            id: finalHash, // ✅ Nuovo ID basato su hash
                            hash: finalHash,
                            s3Key,
                            size: finalSize
                          })
                          console.log('[SAVE][DIFF][CREATE][VIDEO][ID-UPDATE] ID aggiornato da temporaneo a hash:', {
                            oldId: memDoc.id.substring(0, 30) + '...',
                            newId: finalHash.substring(0, 30) + '...'
                          })
                        }
                      }
                    } catch (error) {
                      console.error('[SAVE][DIFF][CREATE][ERROR] Errore creazione documento:', memDoc.filename, error)
                      toast({
                        title: 'Errore',
                        description: `Impossibile salvare il documento: ${memDoc.filename}`,
                        variant: 'destructive'
                      })
                    }
                  }
                } else if (existingDbDoc) {
                  // ✅ Documento esiste già nel database: aggiorna invece di creare
                  console.log('[SAVE][DIFF][UPDATE] Documento esiste già nel database, aggiorno:', {
                    docId: existingDbDoc.id,
                    filename: memDoc.filename,
                    hasThumbnail: !!(memDoc as any).thumbnailDataUrl,
                    oldCompartoId: existingDbDoc.compartoId,
                    newCompartoId: memDoc.compartoId
                  })

                  // ✅ Verifica se il file esiste nel backend (per sicurezza)
                  if (existingDbDoc.s3Key) {
                    try {
                      const testUrl = api.getLocalFileUrl(existingDbDoc.s3Key)
                      const testResponse = await fetch(testUrl, { method: 'HEAD' })
                      if (!testResponse.ok) {
                        // File non esiste, prova a caricarlo se abbiamo localUrl
                        const localUrl = (memDoc as any).localUrl
                        if (localUrl && localUrl.startsWith('blob:')) {
                          console.log('[SAVE][DIFF][UPDATE][UPLOAD] File non trovato nel backend, caricamento da blob URL:', memDoc.filename)
                          try {
                            const response = await fetch(localUrl)
                            if (response.ok) {
                              const blob = await response.blob()
                              const fileObj = new File([blob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })

                              // ✅ IMPORTANTE: Usa lo stesso s3Key del documento esistente
                              // ✅ Usa l'endpoint /upload/local/:key per specificare il s3Key
                              const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(existingDbDoc.s3Key)}`
                              await fetch(uploadUrl, {
                                method: 'PUT',
                                body: fileObj,
                                headers: {
                                  'Content-Type': fileObj.type,
                                },
                              })

                              console.log('[SAVE][DIFF][UPDATE][UPLOAD][SUCCESS] File caricato con s3Key esistente:', {
                                filename: memDoc.filename,
                                s3Key: existingDbDoc.s3Key
                              })
                            }
                          } catch (uploadError) {
                            console.error('[SAVE][DIFF][UPDATE][UPLOAD][ERROR] Errore caricamento file:', memDoc.filename, uploadError)
                          }
                        } else {
                          // File non esiste e non abbiamo localUrl - prova a recuperarlo da filePath se disponibile
                          const filePath = (existingDbDoc as any).filePath
                          if (filePath) {
                            console.log('[SAVE][DIFF][UPDATE][UPLOAD] File non trovato nel backend, recupero da filePath:', {
                              filename: memDoc.filename,
                              filePath,
                              s3Key: existingDbDoc.s3Key
                            })
                            try {
                              // ✅ Leggi file dal filesystem
                              const readResponse = await fetch('http://localhost:3001/api/filesystem/read-file', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filePath }),
                              })

                              if (readResponse.ok) {
                                const fileBlob = await readResponse.blob()
                                const fileObj = new File([fileBlob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })

                                // ✅ Carica file nel backend usando lo stesso s3Key
                                const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(existingDbDoc.s3Key)}`
                                const uploadResponse = await fetch(uploadUrl, {
                                  method: 'PUT',
                                  body: fileObj,
                                  headers: {
                                    'Content-Type': fileObj.type,
                                  },
                                })

                                if (uploadResponse.ok) {
                                  console.log('[SAVE][DIFF][UPDATE][UPLOAD][SUCCESS] File recuperato da filePath e caricato:', {
                                    filename: memDoc.filename,
                                    s3Key: existingDbDoc.s3Key
                                  })
                                } else {
                                  throw new Error(`Upload failed: ${uploadResponse.statusText}`)
                                }
                              } else {
                                throw new Error(`Failed to read file from filesystem: ${readResponse.status}`)
                              }
                            } catch (recoveryError) {
                              console.error('[SAVE][DIFF][UPDATE][UPLOAD][ERROR] Errore recupero file da filePath:', memDoc.filename, recoveryError)
                              toast({
                                title: 'Attenzione',
                                description: `Impossibile recuperare il file ${memDoc.filename} dal filesystem originale. Il file potrebbe essere stato spostato o eliminato.`,
                                variant: 'destructive'
                              })
                            }
                          } else {
                            // File non esiste, non abbiamo localUrl e non abbiamo filePath - questo è un problema
                            console.warn('[SAVE][DIFF][UPDATE][WARN] File non trovato nel backend e nessun localUrl/filePath disponibile:', {
                              filename: memDoc.filename,
                              s3Key: existingDbDoc.s3Key
                            })
                            toast({
                              title: 'Attenzione',
                              description: `Il file ${memDoc.filename} non è disponibile nel backend e non può essere recuperato.`,
                              variant: 'destructive'
                            })
                          }
                        }
                      } else {
                        // File esiste - tutto ok
                        console.log('[SAVE][DIFF][UPDATE][VERIFY][OK] File esiste nel backend:', existingDbDoc.s3Key)
                      }
                    } catch (verifyError: any) {
                      // ✅ Gestisci 404 come caso normale (file non esiste ancora)
                      if (verifyError?.message?.includes('404') || verifyError?.status === 404) {
                        // File non esiste - prova a caricarlo se abbiamo localUrl
                        const localUrl = (memDoc as any).localUrl
                        if (localUrl && localUrl.startsWith('blob:')) {
                          console.log('[SAVE][DIFF][UPDATE][UPLOAD] File non trovato (404), caricamento da blob URL:', memDoc.filename)
                          try {
                            const response = await fetch(localUrl)
                            if (response.ok) {
                              const blob = await response.blob()
                              const fileObj = new File([blob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })

                              // ✅ IMPORTANTE: Usa lo stesso s3Key del documento esistente
                              // ✅ Usa l'endpoint /upload/local/:key per specificare il s3Key
                              const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(existingDbDoc.s3Key)}`
                              const uploadResponse = await fetch(uploadUrl, {
                                method: 'PUT',
                                body: fileObj,
                                headers: {
                                  'Content-Type': fileObj.type,
                                },
                              })

                              if (!uploadResponse.ok) {
                                throw new Error(`Upload failed: ${uploadResponse.statusText}`)
                              }

                              console.log('[SAVE][DIFF][UPDATE][UPLOAD][SUCCESS] File caricato con s3Key esistente:', {
                                filename: memDoc.filename,
                                s3Key: existingDbDoc.s3Key
                              })
                            }
                          } catch (uploadError) {
                            console.error('[SAVE][DIFF][UPDATE][UPLOAD][ERROR] Errore caricamento file:', memDoc.filename, uploadError)
                          }
                        } else {
                          // ✅ Se non abbiamo localUrl, prova a recuperarlo da filePath se disponibile
                          const filePath = (existingDbDoc as any).filePath
                          if (filePath) {
                            console.log('[SAVE][DIFF][UPDATE][UPLOAD] File non trovato (404), recupero da filePath:', {
                              filename: memDoc.filename,
                              filePath,
                              s3Key: existingDbDoc.s3Key
                            })
                            try {
                              // ✅ Leggi file dal filesystem
                              const readResponse = await fetch('http://localhost:3001/api/filesystem/read-file', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filePath }),
                              })

                              if (readResponse.ok) {
                                const fileBlob = await readResponse.blob()
                                const fileObj = new File([fileBlob], memDoc.filename, { type: memDoc.mime || 'application/octet-stream' })

                                // ✅ Carica file nel backend usando lo stesso s3Key
                                const uploadUrl = `http://localhost:3001/api/upload/local/${encodeURIComponent(existingDbDoc.s3Key)}`
                                const uploadResponse = await fetch(uploadUrl, {
                                  method: 'PUT',
                                  body: fileObj,
                                  headers: {
                                    'Content-Type': fileObj.type,
                                  },
                                })

                                if (uploadResponse.ok) {
                                  console.log('[SAVE][DIFF][UPDATE][UPLOAD][SUCCESS] File recuperato da filePath e caricato:', {
                                    filename: memDoc.filename,
                                    s3Key: existingDbDoc.s3Key
                                  })
                                } else {
                                  throw new Error(`Upload failed: ${uploadResponse.statusText}`)
                                }
                              } else {
                                throw new Error(`Failed to read file from filesystem: ${readResponse.status}`)
                              }
                            } catch (recoveryError) {
                              console.error('[SAVE][DIFF][UPDATE][UPLOAD][ERROR] Errore recupero file da filePath:', memDoc.filename, recoveryError)
                              toast({
                                title: 'Attenzione',
                                description: `Impossibile recuperare il file ${memDoc.filename} dal filesystem originale. Il file potrebbe essere stato spostato o eliminato.`,
                                variant: 'destructive'
                              })
                            }
                          } else {
                            // File non esiste, non abbiamo localUrl e non abbiamo filePath - questo è un problema
                            console.warn('[SAVE][DIFF][UPDATE][WARN] File non trovato (404) e nessun localUrl/filePath disponibile:', {
                              filename: memDoc.filename,
                              s3Key: existingDbDoc.s3Key
                            })
                            toast({
                              title: 'Attenzione',
                              description: `Il file ${memDoc.filename} non è disponibile nel backend e non può essere recuperato.`,
                              variant: 'destructive'
                            })
                          }
                        }
                      } else {
                        // Altro tipo di errore - logga come warning
                        console.warn('[SAVE][DIFF][UPDATE][VERIFY] Errore verifica file:', memDoc.filename, verifyError)
                      }
                    }
                  }

                  // ✅ Aggiorna documento nel database
                  const updateData: any = {}
                  if (existingDbDoc.compartoId !== memDoc.compartoId) {
                    updateData.compartoId = memDoc.compartoId
                  }
                  if ((memDoc as any).thumbnailDataUrl && !(existingDbDoc as any).thumbnailDataUrl) {
                    updateData.thumbnailDataUrl = (memDoc as any).thumbnailDataUrl
                  }
                  if ((memDoc as any).hasNativeText !== undefined && (existingDbDoc as any).hasNativeText !== (memDoc as any).hasNativeText) {
                    updateData.hasNativeText = (memDoc as any).hasNativeText
                  }

                  if (Object.keys(updateData).length > 0) {
                    await api.updateDocumento(existingDbDoc.id, updateData)
                    console.log('[SAVE][DIFF][UPDATE][SUCCESS] Documento aggiornato:', memDoc.filename)
                  } else {
                    console.log('[SAVE][DIFF][UPDATE][SKIP] Documento già presente, nessun aggiornamento necessario')
                  }
                } else {
                  // ✅ Documento esistente (non temporaneo): verifica se compartoId è cambiato
                  const dbDoc = dbDocs.find(d => d.id === memDoc.id)
                  if (dbDoc && dbDoc.compartoId !== memDoc.compartoId) {
                    // ✅ Spostamento: aggiorna compartoId
                    try {
                      await api.updateDocumento(memDoc.id, { compartoId: memDoc.compartoId })
                      console.log('[SAVE][DIFF][UPDATE] CompartoId aggiornato:', memDoc.filename, dbDoc.compartoId, '->', memDoc.compartoId)
                    } catch (error) {
                      console.error('[SAVE][DIFF][UPDATE][ERROR] Errore aggiornamento compartoId:', memDoc.id, error)
                    }
                  }
                }
              }

              console.log('[SAVE][DIFF][DONE] Confronto differenziale completato')
            } catch (error) {
              console.error('[SAVE][DIFF][ERROR] Errore nel confronto differenziale:', error)
              // Non bloccare il salvataggio, ma logga l'errore
            }

            // ✅ Salva definitivamente la pratica (cambia status da draft a committed)
            if (updated.status === 'draft') {
              console.log('[SAVE][COMMIT] Cambio status da draft a committed')
              await api.commitPratica(id)
            }

            // Log rimosso (troppo rumoroso)

            // Ricarica i dati aggiornati
            await handleRefreshHook(id)

            toast({
              title: 'Pratica salvata',
              description: 'Le modifiche sono state salvate con successo'
            })
          } catch (error) {
            console.error('[SAVE][PRATICA][FRONTEND][ERROR]', {
              praticaId: id,
              error,
              message: (error as Error).message,
              stack: (error as Error).stack
            })
            toast({
              title: 'Errore',
              description: 'Impossibile salvare la pratica',
              variant: 'destructive'
            })
          } finally {
            setIsSaving(false)
          }
        }}
        saveFilesToDb={saveFilesToDb}
        onSaveFilesToDbChange={setSaveFilesToDb}
        isSaving={isSaving}
        onUploadDocuments={() => open()}
        onOpenExplorer={() => {
          // ✅ Apri Explorer tramite ref
          if (dockV2Ref.current && 'openExplorer' in dockV2Ref.current) {
            (dockV2Ref.current as any).openExplorer()
          }
        }}
        onOpenCliente={() => {
          // ✅ Apri analisi cliente (primo cliente disponibile)
          if (dockV2Ref.current && 'openCliente' in dockV2Ref.current) {
            (dockV2Ref.current as any).openCliente()
          }
        }}
        onOpenGraphBuilder={() => {
          // ✅ Apri GraphBuilder tramite ref
          if (dockV2Ref.current && 'openGraphBuilder' in dockV2Ref.current) {
            (dockV2Ref.current as any).openGraphBuilder()
          }
        }}
      />

      {/* Spacer per l'header fisso */}
      <div style={{ height: headerH }} />
      {/* Main Content: Archivio (sx) + Tavolo (dx) sempre insieme */}
      <div className="w-full overflow-hidden" style={{ height: `calc(100vh - ${headerH}px)` }}>
        <DockWorkspaceV3
          key={id}
          ref={dockV2Ref as any}
          storageKey={`ws_dock_v3_${id}`}
          headerHeight={headerH} // ✅ Passa altezza header per posizionare sidebar

          // docs={documenti.map(d => ({ id: d.id, title: d.filename }))} // Removed unused prop
          renderExplorer={() => (
            <Explorer
              {...ExplorerProps}
              praticaId={id}
              initialSelectedPath={explorerSelectedPath}
              onStateChange={async (path, expandedPaths) => {
                setExplorerSelectedPath(path)
                // ✅ Il salvataggio automatico è ora gestito da useExplorerPersistence in Explorer
                // Questo callback è mantenuto per compatibilità ma non è più necessario
                // per il salvataggio automatico
              }}
            />
          )}
          // isExplorerFullscreen removed - now handled by PanelWithFullscreenToggle
          // onLeftBorderTabChange removed - fullscreen now handled by PanelWithFullscreenToggle
          praticaId={id} // Aggiungi questa prop
          renderSearch={() => (
            <SearchRenderer
              documenti={documenti}
              dockV2Ref={dockV2Ref}
              toast={toast}
            />
          )}
          renderPersons={() => (
            <PersonsRenderer
              documenti={documenti}
              dockV2Ref={dockV2Ref}
              toast={toast}
            />
          )}
          renderDoc={(docId: string, panelApi?: any) => {
            if (!documentsLoaded) {
              return <div className="p-4 text-sm text-muted-foreground">Caricamento documento…</div>
            }
            const found = findDocumentByCriteria(documenti, {
              id: docId,
              hash: docId,
              s3Key: docId,
            })
            if (!found) {
              return <OrphanDocPanelCloser panelApi={panelApi} />
            }
            return renderDocViewer(found.doc, panelApi)
          }}
          renderEvents={() => <EventsTab />}
          renderContacts={() => <ThingCardsPanel kind="contact" />}
          renderIds={() => <ThingCardsPanel kind="id" />}
          clienti={clienti}
          renderClienteMemoria={(clienteId: string) => {
            const cliente = clienti.find(c => c.id === clienteId)
            if (!cliente) return <div className="p-4 text-sm text-muted-foreground">Cliente non trovato</div>
            return (
              <ClienteMemoriaRenderer
                praticaId={id!}
                cliente={cliente}
                onTableSave={(clienteId, data) => {
                  console.log(`💾 [PraticaCanvasPage] Tabella salvata per cliente ${clienteId}:`, data)
                }}
              />
            )
          }}
        />

        {/* Divider resizer removed - preview panel disabled */}

        {/* Right: Preview panel in Archivio */}
        {false && (
          <div
            className="relative bg-background border rounded-md overflow-hidden flex flex-col max-w-[60vw]"
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

        {/* Tavolo gestito interamente da DockWorkspaceV3 */}
      </div>

      {/* Overlay globale disattivato */}

      {/* Modal rimosso in questa vista */}
    </div>
  )
}
