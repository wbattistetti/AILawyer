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
import { useErrorHandling } from './pratica-canvas/hooks/useErrorHandling'
import { useWorkspaceManager } from './pratica-canvas/hooks/useWorkspaceManager';
import { useEventListeners } from './pratica-canvas/hooks/useEventListeners';
import { ArchiveRenderer } from './pratica-canvas/components/ArchiveRenderer';
import { HeaderToolbar } from './pratica-canvas/components/HeaderToolbar'
import { SearchRenderer } from './pratica-canvas/components/SearchRenderer';
import { PersonsRenderer } from './pratica-canvas/components/PersonsRenderer';
import { ClienteMemoriaRenderer } from './pratica-canvas/components/ClienteMemoriaRenderer';
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

  // 3. Genera thumbnail e rileva testo nativo se PDF
  const isPdf = fileObj.type?.startsWith('application/pdf') || fileName.toLowerCase().endsWith('.pdf')
  let thumbnailDataUrl: string | undefined = undefined
  let hasNativeText: boolean | undefined = undefined

  if (isPdf) {
    try {
      const [thumb, nativeText] = await Promise.all([
        generateClientPdfThumb(fileObj, 220),
        detectNativeTextClient(fileObj)
      ])
      thumbnailDataUrl = thumb || undefined
      hasNativeText = nativeText
    } catch (error) {
      console.warn('[UPLOAD-FROM-PATH] PDF processing failed', { fileName, error })
    }
  }

  // 4. Carica file in uploads
  const ext = fileName.substring(fileName.lastIndexOf('.')) || '.bin'
  const s3Key = `${fileHash}${ext}`
  const { uploadUrl } = await api.getUploadUrl(fileName, fileObj.type)
  await api.uploadFile(uploadUrl, fileObj)

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
  const renderDocViewer = (doc: Documento) => (
    <PdfViewerShell
      fileUrl={(doc as any).localUrl || api.getLocalFileUrl(doc.s3Key)}
      page={syncPage || 1}
      lines={null}
      docId={doc.id}
      praticaId={id || ''}
      onPageChange={(page) => {
        // Log rimosso (troppo rumoroso)
        setSyncPage(page);
      }}
      docName={doc.filename}
      hasNativeText={doc.hasNativeText}
    />
  )

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
            const classificationsToSave = Array.from(pendingFileClassificationsRef.current.entries())
            console.log('[SAVE][CLASSIFICATIONS][START]', { count: classificationsToSave.length })

            for (const [filePath, classification] of classificationsToSave) {
              try {
                const comparto = comparti.find(c => c.key === classification.compartoKey)
                if (!comparto) {
                  console.warn('[SAVE][CLASSIFICATIONS][SKIP] Comparto non trovato', { filePath, compartoKey: classification.compartoKey })
                  continue
                }

                // Cerca se il file esiste già nel database (per filePath)
                const existingDoc = documenti.find(d => d.filePath === filePath)

                if (existingDoc) {
                  // ✅ File già nel database: aggiorna compartoId
                  console.log('[SAVE][CLASSIFICATIONS][UPDATE] Aggiorno documento esistente', { docId: existingDoc.id, compartoId: comparto.id })
                  await api.updateDocumento(existingDoc.id, { compartoId: comparto.id })
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
              console.log('[SAVE][DIFF] Documenti nel DB:', dbDocs.length)

              // 2. Ottieni tutti i documenti in memoria (inclusi temporanei)
              const memoryDocs = store.getAllDocuments()
              console.log('[SAVE][DIFF] Documenti in memoria:', memoryDocs.length)

              // 3. Identifica documenti da eliminare (nel DB ma non in memoria)
              const dbDocIds = new Set(dbDocs.map(d => d.id))
              const memoryDocIds = new Set(memoryDocs.map(d => d.id))
              const docsToDelete = dbDocs.filter(d => !memoryDocIds.has(d.id))
              console.log('[SAVE][DIFF] Documenti da eliminare:', docsToDelete.length)

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
                // ✅ Identifica documenti temporanei (hash-based o temp:/pending:)
                const isHashOnly = /^[0-9a-f]{64}$/i.test(memDoc.id)
                const isTempPrefix = memDoc.id.startsWith('temp:') || memDoc.id.startsWith('pending:')
                const isTemporary = isTempPrefix || isHashOnly

                if (isTemporary) {
                  // ✅ Documento nuovo: deve essere creato nel database
                  // ✅ Se ha filePath, carica il file e uploada
                  const filePath = (memDoc as any).filePath
                  if (filePath) {
                    try {
                      console.log('[SAVE][DIFF][CREATE] Carico nuovo documento da filePath:', filePath)
                      await uploadFileFromPath(filePath, id!, memDoc.compartoId, api)
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
                    // ✅ Documento temporaneo senza filePath (già uploadato o locale)
                    // ✅ Crea documento nel database con i dati in memoria
                    try {
                      const hash = (memDoc as any).hash || memDoc.id
                      const s3Key = memDoc.s3Key || `${hash}${memDoc.filename.substring(memDoc.filename.lastIndexOf('.')) || '.bin'}`
                      await api.createDocumento({
                        praticaId: id!,
                        compartoId: memDoc.compartoId,
                        filename: memDoc.filename,
                        mime: memDoc.mime || 'application/octet-stream',
                        size: memDoc.size || 0,
                        s3Key,
                        hash,
                        ocrStatus: 'pending',
                        tags: [],
                        thumbnailDataUrl: (memDoc as any).thumbnailDataUrl,
                        hasNativeText: (memDoc as any).hasNativeText,
                        filePath: filePath || undefined
                      })
                      console.log('[SAVE][DIFF][CREATE][SUCCESS] Documento creato (senza filePath):', memDoc.filename)
                    } catch (error) {
                      console.error('[SAVE][DIFF][CREATE][ERROR] Errore creazione documento (senza filePath):', memDoc.filename, error)
                    }
                  }
                } else {
                  // ✅ Documento esistente: verifica se compartoId è cambiato
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
      />

      {/* Spacer per l'header fisso */}
      <div style={{ height: headerH }} />
      {/* Main Content: Archivio (sx) + Tavolo (dx) sempre insieme */}
      <div className="w-full overflow-hidden" style={{ height: `calc(100vh - ${headerH}px)` }}>
        <DockWorkspaceV3
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
          renderDoc={(docId: string) => {
            const doc = documenti.find(d => d.id === docId)
            if (!doc) return <div className="p-4 text-sm">Documento non trovato.</div>
            return renderDocViewer(doc)
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

        {/* Tavolo gestito interamente da DockWorkspaceV3 */}
      </div>

      {/* Overlay globale disattivato */}

      {/* Modal rimosso in questa vista */}
    </div>
  )
}
