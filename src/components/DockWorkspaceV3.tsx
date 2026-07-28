import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps, IDockviewPanelHeaderProps, DockviewDefaultTab } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { type GraphBuilderHandle } from '../features/case-overview/graph-builder/GraphBuilder'
import { GraphBuilderPanelContent } from '../features/case-overview/graph-builder/GraphBuilderPanelContent'
import { GraphBuilderTabHeader } from '../features/case-overview/graph-builder/GraphBuilderTab'
import { GraphWorkspaceProvider } from '../features/case-overview/graph-builder/graph-workspace-context'
import {
  withGraphContent,
  type GraphMenuItem,
  type SavedGraph,
} from '../features/case-overview/graph-builder/graphSerialization'
import { useGraphCatalog } from '../features/case-overview/graph-builder/use-graph-catalog'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
import { DrawerTabStrip, DrawerTabItem } from '../features/drawers/DrawerTabStrip'
import { colorFor, iconFor } from '../features/drawers/drawerPalette'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText, FolderOpen, Search, User, CreditCard, Calendar, Network, Mail, Image } from 'lucide-react'
import type { Comparto } from '@/types'
import { api } from '@/lib/api'
import type { DrawerType } from '../features/drawers/types'
import { deduplicateDocuments } from '@/utils/documentDeduplication'
import {
  getRestorableLayoutForPratica,
  saveLastWorkspaceSession,
} from '@/utils/lastWorkspaceSession'
import './DockWorkspaceV3.css'
import type { ExtractionTabProgress } from '../features/entities/extract-progress'
import {
  getPersonDraft,
  subscribePersonDraft,
} from '../features/entities/person-draft-store'
import {
  getEntityDraft,
  subscribeEntityDraft,
} from '../features/generic-entities/entity-draft-store'
import { resolveDocumentHeaderStyle } from './viewers/common/utils/documentHeaderStyle'
import {
  bindDrawerOsFileDrop,
  uploadOsFilesToDrawer,
} from '../features/drawers/drawerOsFileDrop'

/** Fill di progresso estrazione sulla tab anagrafiche/entità. */
function ExtractionTabFill({
  praticaId,
  kind,
  children,
  fillColor,
}: {
  praticaId: string
  kind: 'persons' | 'entities'
  children: React.ReactNode
  fillColor: string
}) {
  const [progress, setProgress] = useState<ExtractionTabProgress | null>(null)

  useEffect(() => {
    const sync = () => {
      const next = kind === 'persons'
        ? getPersonDraft(praticaId)?.progress ?? null
        : getEntityDraft(praticaId)?.progress ?? null
      setProgress(next)
    }
    sync()
    return kind === 'persons'
      ? subscribePersonDraft(sync)
      : subscribeEntityDraft(sync)
  }, [praticaId, kind])

  return (
    <div
      title={progress?.label}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 3,
      }}
    >
      {progress && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(4, progress.pct)}%`,
            background: fillColor,
            transition: 'width 0.3s ease',
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </div>
  )
}

// ✅ RIMOSSO: Context non più necessario - ogni viewer gestisce la propria attivazione via props.api.onDidActiveChange

type DocTab = { id: string; title: string }

// ✅ Mappatura colori e icone per ogni tipo di tab (stesso di V2)
type TabConfig = {
  icon: React.ComponentType<any>
  colorBase: string // Colore base (usato quando tab è chiusa - spento)
  colorActive: string // Colore attivo (usato quando tab è aperta - vivace)
}

const TAB_CONFIGS: Record<string, TabConfig> = {
  'explorer': {
    icon: FolderOpen,
    colorBase: '#93c5fd', // blue-300 spento
    colorActive: '#3b82f6' // blue-500 vivace
  },
  'search': {
    icon: Search,
    colorBase: '#fbbf24', // amber-300 spento
    colorActive: '#f59e0b' // amber-500 vivace
  },
  'persons': {
    icon: User,
    colorBase: '#86efac', // green-300 spento
    colorActive: '#22c55e' // green-500 vivace
  },
  'entities': {
    icon: Boxes,
    colorBase: '#67e8f9', // cyan-300 spento
    colorActive: '#06b6d4' // cyan-500 vivace
  },
  'contacts': {
    icon: Phone,
    colorBase: '#60a5fa', // blue-400 spento
    colorActive: '#2563eb' // blue-600 vivace
  },
  'ids': {
    icon: CreditCard,
    colorBase: '#f472b6', // pink-300 spento
    colorActive: '#ec4899' // pink-500 vivace
  },
  'events': {
    icon: Calendar,
    colorBase: '#fb7185', // rose-400 spento
    colorActive: '#e11d48' // rose-600 vivace
  },
  'graph': {
    icon: Network,
    colorBase: '#34d399', // emerald-300 spento
    colorActive: '#10b981' // emerald-500 vivace
  },
  'graph-builder': {
    icon: Network,
    colorBase: '#34d399', // emerald-300 spento
    colorActive: '#10b981' // emerald-500 vivace
  },
  'cliente-memoria': {
    icon: Users,
    colorBase: '#94a3b8', // slate-400 spento
    colorActive: '#64748b' // slate-500 vivace
  }
}

// Props interface (manteniamo la stessa di V2 per compatibilità)
export type Props = {
  renderPersons?: () => React.ReactNode
  renderEntities?: () => React.ReactNode
  renderContacts?: () => React.ReactNode
  renderIds?: () => React.ReactNode
  renderDoc?: (docId: string, panelApi?: any) => React.ReactNode
  storageKey?: string
  renderEvents?: () => React.ReactNode
  renderExplorer?: () => React.ReactNode
  renderSearch?: () => React.ReactNode
  onLeftBorderTabChange?: (component: string) => void
  praticaId?: string
  clienti?: Array<{ id: string; nome: string; cognome: string }>
  renderClienteMemoria?: (clienteId: string) => React.ReactNode
  headerHeight?: number
  /**
   * JSON `Pratica.graphsState` da ripristinare.
   * `undefined` = catalogo ancora in caricamento (i canvas restano in attesa),
   * `null` = pratica senza grafi salvati.
   */
  graphsState: string | null | undefined
  /** Notifica il catalogo grafi (toolbar multi-grafo). */
  onGraphsChange?: (graphs: GraphMenuItem[]) => void
}

export type DockWorkspaceV3Handle = {
  /** Attiva il documento e restituisce true se il viewer era già montato. */
  openDoc: (doc: DocTab) => boolean
  openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => void
  openExplorer: () => void
  openCliente: (clienteId?: string) => void
  /** Crea un nuovo grafo, oppure apre quello indicato. */
  openGraphBuilder: (graphId?: string) => void
  /** Apre il pannello di consultazione delle schede anagrafiche. */
  openPersons: () => void
  /** Chiude il pannello schede anagrafiche se presente. */
  closePersons: () => void
  /** Apre il pannello luoghi/persone/oggetti. */
  openEntities: () => void
  /** Chiude il pannello entità se presente. */
  closeEntities: () => void
  /** Catalogo grafi allineato al contenuto vivo dei canvas montati. */
  saveAllGraphs: () => SavedGraph[]
}

// Componente wrapper per pannelli con fullscreen toggle
const PanelWithFullscreenToggle: React.FC<{
  children: React.ReactNode
  component: string
  panelId: string
  panelApi: any // API del pannello Dockview
  registerToggle: (id: string, fn: () => void) => void
  setFullscreenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>
  forceRerender: () => void
  forceTabUpdate: (panelId: string) => void
}> = ({ children, component, panelId, panelApi, registerToggle, setFullscreenStates, forceRerender, forceTabUpdate }) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const supportsFullscreen = ['explorer', 'graph'].includes(component)

  useEffect(() => {
    setFullscreenStates(prev => {
      const newMap = new Map(prev)
      newMap.set(panelId, isFullscreen)
      return newMap
    })
    forceRerender()
  }, [isFullscreen, panelId, setFullscreenStates, forceRerender])

  const handleFullscreenToggle = useCallback(() => {
    if (!panelApi) return

    const group = panelApi.group
    if (!group) return

    if (isFullscreen) {
      // Esci da fullscreen - ripristina il gruppo
      if (group.api && typeof group.api.exitMaximized === 'function') {
        group.api.exitMaximized()
      }
    } else {
      // Entra in fullscreen - massimizza il gruppo
      if (group.api && typeof group.api.maximize === 'function') {
        group.api.maximize()
      }
    }
    setIsFullscreen(prev => !prev)
  }, [isFullscreen, panelApi])

  useEffect(() => {
    registerToggle(panelId, handleFullscreenToggle)
  }, [panelId, registerToggle, handleFullscreenToggle])

  if (!supportsFullscreen) {
    return <>{children}</>
  }

  return (
    <div className="w-full h-full relative">
      {children}
      <button
        className="absolute top-2 right-2 z-50 p-1 rounded bg-orange-500 text-white hover:bg-orange-600"
        onClick={handleFullscreenToggle}
        title={isFullscreen ? 'Esci da fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? '⤓' : '⤢'}
      </button>
    </div>
  )
}

function DockWorkspaceV3Component(props: Props, ref: React.Ref<DockWorkspaceV3Handle>) {
  const {
    renderPersons,
    renderEntities,
    renderContacts,
    renderIds,
    renderDoc,
    storageKey = 'ws_dock_v3',
    renderEvents,
    renderExplorer,
    renderSearch,
    onLeftBorderTabChange,
    praticaId,
    clienti = [],
    renderClienteMemoria,
    headerHeight = 0,
    graphsState: graphsStateProp,
    onGraphsChange,
  } = props

  // ✅ Costante per la posizione della striscia dei cassetti (top, bottom, left, right)
  const DRAWER_STRIP_POSITION: 'top' | 'bottom' | 'left' | 'right' = 'bottom'

  const dockviewApiRef = useRef<any>(null)
  const fullscreenTogglesRef = useRef<Map<string, () => void>>(new Map())
  const [fullscreenStates, setFullscreenStates] = useState<Map<string, boolean>>(new Map())
  const [fullscreenTrigger, setFullscreenTrigger] = useState(0)

  // State per i cassetti (comparti)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [selectedDrawerId, setSelectedDrawerId] = useState<string | undefined>(undefined)
  const dockRootRef = useRef<HTMLDivElement | null>(null)
  const [isDrawerStripVisible, setIsDrawerStripVisible] = useState(false)
  const [isDrawerStripPinned, setIsDrawerStripPinned] = useState(false) // ✅ PIN per fissare i cassetti
  const [drawerPanelsUpdateTrigger, setDrawerPanelsUpdateTrigger] = useState(0) // ✅ Trigger per aggiornare drawerTabs quando i pannelli cambiano
  const [documentsUpdateTrigger, setDocumentsUpdateTrigger] = useState(0) // ✅ Trigger per aggiornare drawerTabs quando i documenti cambiano

  // Catalogo grafi: unica fonte di verità del contenuto. I canvas montati vi
  // riversano le modifiche, così una tab chiusa o nascosta non perde nulla.
  const persistGraphsState = useCallback((graphsState: string) => {
    if (!praticaId) return
    api.updatePratica(praticaId, { graphsState }).catch((err: unknown) => {
      console.error('[DOCK-V3] Errore salvataggio graphsState:', err)
    })
  }, [praticaId])
  const graphCatalog = useGraphCatalog({
    graphsState: graphsStateProp,
    onPersist: persistGraphsState,
  })
  const [openGraphIds, setOpenGraphIds] = useState<Set<string>>(new Set())
  const graphBuilderRefs = useRef<Map<string, GraphBuilderHandle>>(new Map())

  const {
    graphsById,
    listGraphs,
    createGraph: createGraphInCatalog,
    renameGraph: renameGraphInCatalog,
    removeGraph: removeGraphFromCatalog,
  } = graphCatalog

  // Il listener dockview vive fuori dal ciclo di render: accede via ref.
  const ensureGraphRef = useRef(graphCatalog.ensureGraph)
  ensureGraphRef.current = graphCatalog.ensureGraph

  useEffect(() => {
    if (!onGraphsChange) return
    const items: GraphMenuItem[] = Array.from(graphsById.values()).map((g) => ({
      id: g.id,
      name: g.name,
      isOpen: openGraphIds.has(g.id),
    }))
    onGraphsChange(items)
  }, [graphsById, openGraphIds, onGraphsChange])

  const renameGraph = useCallback((graphId: string, name: string) => {
    renameGraphInCatalog(graphId, name)
    const panel = dockviewApiRef.current?.getPanel(graphId)
    if (panel?.api?.setTitle) panel.api.setTitle(name)
    else if (typeof panel?.api?.updateTitle === 'function') panel.api.updateTitle(name)
  }, [renameGraphInCatalog])

  const deleteGraph = useCallback((graphId: string) => {
    removeGraphFromCatalog(graphId)
    setOpenGraphIds((prev) => {
      if (!prev.has(graphId)) return prev
      const next = new Set(prev)
      next.delete(graphId)
      return next
    })
    graphBuilderRefs.current.delete(graphId)
    const panel = dockviewApiRef.current?.getPanel(graphId)
    if (panel?.api?.close) panel.api.close()
  }, [removeGraphFromCatalog])

  const openGraphPanel = useCallback((graphId: string, graphName: string) => {
    if (!dockviewApiRef.current) return
    const existingPanel = dockviewApiRef.current.getPanel(graphId)
    if (existingPanel) {
      if (typeof dockviewApiRef.current.setActivePanel === 'function') {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else if (existingPanel.api) {
        existingPanel.api.setActive()
      }
      return
    }
    const newPanel = dockviewApiRef.current.addPanel({
      id: graphId,
      component: 'graph-builder',
      params: {
        component: 'graph-builder',
        graphId,
        graphName,
      },
      title: graphName,
      closeable: true,
      // Senza questo dockview smonta il canvas quando la tab non è visibile.
      renderer: 'always',
    })
    if (newPanel?.group?.locked) {
      newPanel.group.locked = false
    }
  }, [])

  const createGraph = useCallback(() => {
    const graph = createGraphInCatalog()
    openGraphPanel(graph.id, graph.name)
  }, [createGraphInCatalog, openGraphPanel])

  const graphWorkspaceValue = useMemo(() => ({
    graphsById: graphCatalog.graphsById,
    isCatalogLoaded: graphCatalog.isLoaded,
    catalogLoadError: graphCatalog.loadError,
    openNoteByGraphId: graphCatalog.openNoteByGraphId,
    setGraphNote: graphCatalog.setGraphNote,
    toggleGraphNote: graphCatalog.toggleGraphNote,
    closeGraphNote: graphCatalog.closeGraphNote,
    updateGraphContent: graphCatalog.updateGraphContent,
    renameGraph,
    deleteGraph,
  }), [graphCatalog, renameGraph, deleteGraph])

  // ✅ Listener per aggiornare drawerTabs quando cambiano i documenti
  useEffect(() => {
    const handleDocumentsChange = () => {
      setDocumentsUpdateTrigger(prev => prev + 1)
    }
    window.addEventListener('app:documents' as any, handleDocumentsChange)
    window.addEventListener('app:upload-files' as any, handleDocumentsChange)
    window.addEventListener('app:documents-updated' as any, handleDocumentsChange) // ✅ Aggiungi questo per aggiornare immediatamente
    return () => {
      window.removeEventListener('app:documents' as any, handleDocumentsChange)
      window.removeEventListener('app:upload-files' as any, handleDocumentsChange)
      window.removeEventListener('app:documents-updated' as any, handleDocumentsChange) // ✅ Rimuovi anche questo
    }
  }, [])

  const drawerStripTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ✅ Handler per mouse enter/leave della zona cassetti (solo se non fissato)
  const handleDrawerStripMouseEnter = useCallback(() => {
    if (!isDrawerStripPinned) {
      setIsDrawerStripVisible(true)
      if (drawerStripTimeoutRef.current) {
        clearTimeout(drawerStripTimeoutRef.current)
        drawerStripTimeoutRef.current = null
      }
    }
  }, [isDrawerStripPinned])

  const handleDrawerStripMouseLeave = useCallback(() => {
    if (!isDrawerStripPinned) {
      // ✅ Usa un listener globale per controllare se il mouse è ancora nella zona estesa
      const checkMouseInZone = (e: MouseEvent) => {
        const drawerStripEl = document.querySelector('[data-drawer-strip]') as HTMLElement
        if (!drawerStripEl) {
          setIsDrawerStripVisible(false)
          document.removeEventListener('mousemove', checkMouseInZone)
          return
        }

        const rect = drawerStripEl.getBoundingClientRect()
        const extendedTop = rect.top - 76 // Zona estesa di 76px sopra
        const mouseY = e.clientY

        // ✅ Se il mouse è ancora nella zona estesa, mantieni i cassetti visibili
        if (mouseY >= extendedTop && mouseY <= rect.bottom) {
          if (drawerStripTimeoutRef.current) {
            clearTimeout(drawerStripTimeoutRef.current)
            drawerStripTimeoutRef.current = null
          }
          // Non rimuovere il listener, continua a controllare
          return
        }

        // ✅ Se il mouse è fuori dalla zona estesa, avvia il timeout per nascondere
        if (!drawerStripTimeoutRef.current) {
          drawerStripTimeoutRef.current = setTimeout(() => {
            // ✅ Controlla una volta finale prima di nascondere
            const finalRect = drawerStripEl.getBoundingClientRect()
            const finalExtendedTop = finalRect.top - 76
            const finalMouseY = e.clientY

            if (finalMouseY < finalExtendedTop || finalMouseY > finalRect.bottom) {
              setIsDrawerStripVisible(false)
            }
            document.removeEventListener('mousemove', checkMouseInZone)
            drawerStripTimeoutRef.current = null
          }, 300)
        }
      }

      // ✅ Aggiungi listener globale per controllare la posizione del mouse
      document.addEventListener('mousemove', checkMouseInZone)

      // ✅ Rimuovi il listener dopo un periodo più lungo se non è stato rimosso prima
      setTimeout(() => {
        document.removeEventListener('mousemove', checkMouseInZone)
        if (drawerStripTimeoutRef.current) {
          clearTimeout(drawerStripTimeoutRef.current)
          drawerStripTimeoutRef.current = null
        }
      }, 2000) // Rimuovi dopo 2 secondi se non è stato rimosso prima
    }
  }, [isDrawerStripPinned])

  // ✅ Handler per aprire cassetti senza fissare (preview temporaneo)
  const handleOpenDrawers = useCallback(() => {
    // ✅ Apri solo, senza fissare
    setIsDrawerStripVisible(true)
    // ✅ Se c'è un timeout attivo, cancellalo
    if (drawerStripTimeoutRef.current) {
      clearTimeout(drawerStripTimeoutRef.current)
      drawerStripTimeoutRef.current = null
    }
  }, [])

  // ✅ Handler per aprire E fissare (quando si clicca su PIN dalla linguetta)
  const handleOpenAndPin = useCallback(() => {
    // ✅ Apri E fissa in un'unica azione
    setIsDrawerStripVisible(true)
    setIsDrawerStripPinned(true)
    // ✅ Se c'è un timeout attivo, cancellalo
    if (drawerStripTimeoutRef.current) {
      clearTimeout(drawerStripTimeoutRef.current)
      drawerStripTimeoutRef.current = null
    }
  }, [])

  // ✅ Handler per toggle PIN (fissa/sfissa quando i cassetti sono già aperti)
  const handleTogglePin = useCallback(() => {
    setIsDrawerStripPinned(prev => {
      const newPinned = !prev
      if (newPinned) {
        // ✅ Quando si fissa, assicurati che siano visibili
        setIsDrawerStripVisible(true)
      } else {
        // ✅ Quando si sfissa, nascondi dopo un breve delay
        drawerStripTimeoutRef.current = setTimeout(() => {
          setIsDrawerStripVisible(false)
        }, 300)
      }
      return newPinned
    })
  }, [])

  // ✅ Ref per gestire il drag attivo (senza re-render della mappa components)
  const isDragActiveRef = useRef(false)

  // ✅ Funzione per abilitare drag mode
  const enableDragMode = useCallback(() => {
    if (!isDragActiveRef.current) {
      console.log('[DOCK-V3] 📦 Abilito drag mode - disabilito pointer-events sul contenuto')
      isDragActiveRef.current = true
    }
  }, [])

  // ✅ Funzione per disabilitare drag mode
  const disableDragMode = useCallback(() => {
    if (isDragActiveRef.current) {
      console.log('[DOCK-V3] 📦 Disabilito drag mode - riabilito pointer-events sul contenuto')
      isDragActiveRef.current = false
    }
  }, [])

  // Carica comparti
  useEffect(() => {
    if (!praticaId) return
    api.getComparti(praticaId).then(comparti => {
      setComparti(comparti || [])
    }).catch(err => {
      console.error('[DOCK-V3] Errore caricamento comparti:', err)
    })
  }, [praticaId])

  // ✅ RIMOSSO: archiveTabs - non più necessario senza SidebarArchivi
  // Se in futuro servono cassetti a sinistra, si usa un'altra istanza di DrawerTabStrip con position='left'

  // Prepara le tab per DrawerTabStrip
  const drawerTabs = useMemo<DrawerTabItem[]>(() => {
    // ✅ Ottieni i documenti da window.__archiveData per contare i documenti per comparto
    const archiveData = (window as any).__archiveData
    const documenti: Array<{ compartoId?: string }> = archiveData?.documenti || []

    // ✅ Log rimosso per ridurre spam console

    // ✅ Calcola quali cassetti hanno un dock pane aperto
    const openDrawerIds = new Set<string>()
    if (dockviewApiRef.current) {
      comparti.forEach(comparto => {
        const panelId = `drawer-${comparto.id}`
        const panel = dockviewApiRef.current?.getPanel(panelId)
        if (panel) {
          openDrawerIds.add(comparto.id)
        }
      })
    }

    const tabs = comparti.map(comparto => {
      const IconComponent = iconFor(comparto.nome)
      const drawerColor = colorFor(comparto.nome)

      // ✅ Conta i documenti per questo comparto CON deduplicazione
      const matchingDocs = documenti.filter(doc => (doc as any).compartoId === comparto.id)
      // ✅ Deduplica per evitare di contare documenti temporanei duplicati
      const deduplicatedDocs = deduplicateDocuments(matchingDocs)
      const documentCount = deduplicatedDocs.length

      // ✅ Verifica se il cassetto ha un dock pane aperto
      const isOpen = openDrawerIds.has(comparto.id)

      // ✅ NON passare il colore qui - sarà gestito da DrawerTabStrip
      return {
        id: comparto.id,
        label: comparto.nome,
        icon: <IconComponent size={24} />, // ✅ Icona senza colore, sarà colorata da DrawerTabStrip
        color: drawerColor,
        type: comparto.chiave as DrawerType,
        documentCount, // ✅ Numero di documenti nel cassetto
        isOpen // ✅ Se il cassetto ha un dock pane aperto
      }
    })
    // ✅ Log rimosso per ridurre spam console
    return tabs
  }, [comparti, drawerPanelsUpdateTrigger, documentsUpdateTrigger]) // ✅ Aggiungi trigger per forzare re-calcolo quando i pannelli o i documenti cambiano

  // ✅ Wrapper per il contenuto dei pannelli (no overlay che forza remount del registry componenti)
  const PanelContentWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative w-full h-full">{children}</div>
  )

  /** Identità stabile: il canvas non deve ri-registrarsi a ogni render del workspace. */
  const registerGraphHandle = useCallback((graphId: string, handle: GraphBuilderHandle | null) => {
    if (handle) graphBuilderRefs.current.set(graphId, handle)
    else graphBuilderRefs.current.delete(graphId)
  }, [])

  // Render callback live: evita di ricostruire la mappa `components` a ogni render del parent
  // (ricostruire i componenti Dockview remounta i viewer → pane bianco / pagina 1).
  const panelRenderersRef = useRef({
    renderExplorer,
    renderPersons,
    renderEntities,
    renderContacts,
    renderIds,
    renderEvents,
    renderClienteMemoria,
    renderDoc,
    praticaId,
    comparti,
    registerGraphHandle,
  })
  panelRenderersRef.current = {
    renderExplorer,
    renderPersons,
    renderEntities,
    renderContacts,
    renderIds,
    renderEvents,
    renderClienteMemoria,
    renderDoc,
    praticaId,
    comparti,
    registerGraphHandle,
  }

  // ✅ RIMOSSO: State e ref per activePanelId - ogni viewer gestisce la propria attivazione via props.api.onDidActiveChange

  // Factory per i componenti Dockview
  const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = useMemo(() => {
    const registerToggle = (id: string, fn: () => void) => {
      fullscreenTogglesRef.current.set(id, fn)
    }

    const forceRerender = () => {
      // Non invalidare la mappa components: basta lo state fullscreen locale del pannello.
      setFullscreenTrigger(prev => prev + 1)
    }

    const forceTabUpdate = (_panelId: string) => {
      // Dockview gestisce automaticamente gli aggiornamenti
    }

    return {
      'explorer': (props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelWithFullscreenToggle
            component="explorer"
            panelId={props.api.id}
            panelApi={props.api}
            registerToggle={registerToggle}
            setFullscreenStates={setFullscreenStates}
            forceRerender={forceRerender}
            forceTabUpdate={forceTabUpdate}
          >
            <PanelContentWrapper>
              <div className="w-full h-full overflow-hidden bg-background">
                {live.renderExplorer ? live.renderExplorer() : <div>Explorer non disponibile</div>}
              </div>
            </PanelContentWrapper>
          </PanelWithFullscreenToggle>
        )
      },
      'graph': (props: IDockviewPanelProps) => {
        return (
          <PanelWithFullscreenToggle
            component="graph"
            panelId={props.api.id}
            panelApi={props.api}
            registerToggle={registerToggle}
            setFullscreenStates={setFullscreenStates}
            forceRerender={forceRerender}
            forceTabUpdate={forceTabUpdate}
          >
            <PanelContentWrapper>
              <div className="w-full h-full overflow-hidden bg-background">
                <CaseOverviewDiagram praticaId={panelRenderersRef.current.praticaId || ''} />
              </div>
            </PanelContentWrapper>
          </PanelWithFullscreenToggle>
        )
      },
      'graph-builder': (props: IDockviewPanelProps<{ graphId?: string; graphName?: string }>) => {
        const live = panelRenderersRef.current
        const graphId = props.params?.graphId || props.api.id

        return (
          <PanelWithFullscreenToggle
            component="graph-builder"
            panelId={props.api.id}
            panelApi={props.api}
            registerToggle={registerToggle}
            setFullscreenStates={setFullscreenStates}
            forceRerender={forceRerender}
            forceTabUpdate={forceTabUpdate}
          >
            <PanelContentWrapper>
              <GraphBuilderPanelContent
                graphId={graphId}
                praticaId={live.praticaId || undefined}
                registerHandle={live.registerGraphHandle}
              />
            </PanelContentWrapper>
          </PanelWithFullscreenToggle>
        )
      },
      'persons': (_props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderPersons ? live.renderPersons() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'entities': (_props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderEntities ? live.renderEntities() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'contacts': (_props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderContacts ? live.renderContacts() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'ids': (_props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderIds ? live.renderIds() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'events': (_props: IDockviewPanelProps) => {
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderEvents ? live.renderEvents() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'cliente-memoria': (props: IDockviewPanelProps<{ clienteId?: string }>) => {
        const live = panelRenderersRef.current
        const clienteId = props.params?.clienteId || props.api.id.replace('cliente-', '').replace('-tab', '').split('-')[0]
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderClienteMemoria && clienteId ? live.renderClienteMemoria(clienteId) : <div>Cliente non trovato</div>}
            </div>
          </PanelContentWrapper>
        )
      },
      'drawer-content': (props: IDockviewPanelProps<{ drawerId?: string; drawerKey?: string; drawerTitle?: string }>) => {
        const live = panelRenderersRef.current
        const drawerId = props.params?.drawerId || props.api.id.replace('drawer-', '')
        const drawerTitle = props.params?.drawerTitle || props.api.title || 'Cassetto'
        const comparto = live.comparti.find(c => c.id === drawerId)
        return (
          <PanelContentWrapper>
            <div
              className="w-full h-full overflow-auto bg-background"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-explorer-file')) {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDrop={(e) => {
                if (e.dataTransfer.types.includes('application/x-explorer-file')) {
                  return
                }
              }}
            >
              <DrawerViewer
                id={drawerId}
                title={drawerTitle}
                type={comparto?.chiave as DrawerType}
              />
            </div>
          </PanelContentWrapper>
        )
      },
      'doc': (props: IDockviewPanelProps<{ docId?: string }>) => {
        const docId = props.params?.docId || props.api.id.replace('doc-', '')
        const live = panelRenderersRef.current
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background">
              {live.renderDoc ? live.renderDoc(docId, props.api) : <div>Documento non disponibile</div>}
            </div>
          </PanelContentWrapper>
        )
      },
      'tmpdoc': (props: IDockviewPanelProps<{ meta?: any }>) => {
        const meta = props.params?.meta || {}
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-background p-4">
              <div className="text-sm mb-3">
                <span className="inline-flex items-center gap-1 bg-slate-100 border rounded px-2 py-0.5">
                  <FileText size={14} className="text-slate-700" /> {meta.title || 'Documento temporaneo'}
                </span>
              </div>
              <div className="prose max-w-none">
                {meta.content || meta.text || 'Nessun contenuto disponibile'}
              </div>
            </div>
          </PanelContentWrapper>
        )
      }
    }
  // Mappa stabile: i renderer vivi arrivano da panelRenderersRef (niente remount al drag/split).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // ✅ Componente tab personalizzato con icone e colori (stesso aspetto di V2)
  const defaultTabComponent = useCallback((props: IDockviewPanelHeaderProps) => {
    // Debug: verifica struttura props
    // ✅ Log rimosso per ridurre spam console

    // Prova diversi modi per accedere al panel
    let panel: any = null
    let component = ''

    // Metodo 1: cerca nel model
    if (props.api.group?.model?.panels) {
      panel = props.api.group.model.panels.find((p: any) => p.id === props.api.id)
      component = panel?.params?.component || ''
    }

    // Metodo 2: se non trovato, prova a cercare tramite dockviewApi
    if (!panel && dockviewApiRef.current) {
      panel = dockviewApiRef.current.getPanel(props.api.id)
      if (panel) {
        component = (panel.params as any)?.component || ''
      }
    }

    // Metodo 3: estrai dall'ID se è un drawer
    const tabId = props.api.id
    if (!component && tabId.startsWith('drawer-')) {
      component = 'drawer-content'
    }

    // ✅ Log rimosso per ridurre spam console

    // ✅ Verifica se il pannello è closeable (dal panel object o default true)
    const isCloseable = panel?.closeable ?? true

    const isActive = props.api.group?.model?.activePanel?.id === tabId

    // ✅ Tab drawer-content - layout verticale come nell'immagine (numero in alto, icona e testo sotto)
    if (component === 'drawer-content') {
      const drawerId = panel?.params?.drawerId || panel?.params?.drawerKey || tabId.replace('drawer-', '')

      // ✅ Usa prima i dati salvati nei params (disponibili immediatamente anche se comparti non sono ancora caricati)
      let drawerNumber = panel?.params?.drawerNumber
      let drawerColor = panel?.params?.drawerColor || '#f59e0b'
      let drawerTitleForIcon = panel?.params?.drawerTitle as string | undefined

      // ✅ Se i comparti sono ora disponibili, aggiorna con i dati più recenti
      const comparto = comparti.find(c => c.id === drawerId)
      if (comparto) {
        drawerNumber = comparti.findIndex(c => c.id === drawerId) + 1
        drawerColor = colorFor(comparto.nome)
        drawerTitleForIcon = comparto.nome
      }

      // ✅ Stessa icona del cassetto Correlato (drawerPalette), mai emoji cartella
      const IconComponent = iconFor(drawerTitleForIcon)
      const drawerIcon = <IconComponent size={14} />

      // ✅ Layout orizzontale come in V2: numero e icona affiancati, poi testo
      const tabParts: React.ReactNode[] = []

      // Numero
      if (drawerNumber !== undefined) {
        tabParts.push(
          <span key="number" style={{
            marginRight: '4px',
            fontWeight: 600,
            color: drawerColor,
                fontSize: 'var(--font-size-sm)' // usa variabile scalabile
          }}>
            {drawerNumber}
          </span>
        )
      }

      // Icona (stesso componente Lucide del cassetto Correlato)
      tabParts.push(
        <span key="icon" style={{
          marginRight: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          color: drawerColor
        }}>
          {drawerIcon}
        </span>
      )

      // ✅ Marker per bindDrawerOsFileDrop (capture nativo — React onDrop non è affidabile su tab Dockview)
      return (
        <div
          data-drawer-drop-id={drawerId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            width: '100%',
            minHeight: '100%',
          }}
        >
          {tabParts.length > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              {tabParts}
            </span>
          )}
          <span style={{ flex: 1 }}>{props.api.title}</span>
          {isCloseable && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.api.close()
              }}
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '1rem', // usa rem scalabile
                lineHeight: 1,
                color: 'var(--ui-text-muted)',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ui-bg-hover)'
                e.currentTarget.style.color = 'var(--drawer-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--ui-text-muted)'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </div>
      )
    }

    // ✅ Tab documenti temporanei
    if (component === 'tmpdoc') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <ScanText size={18} style={{ color: '#10b981' }} />
          <span style={{ flex: 1 }}>{props.api.title}</span>
          {isCloseable && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.api.close()
              }}
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '1rem', // usa rem scalabile
                lineHeight: 1,
                color: 'var(--ui-text-muted)',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ui-bg-hover)'
                e.currentTarget.style.color = 'var(--drawer-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--ui-text-muted)'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </div>
      )
    }

    // ✅ Tab documenti normali — stessa icona tipo-file delle thumbnail (PDF Adobe, Word, ecc.)
    if (component === 'doc') {
      const headerStyle = resolveDocumentHeaderStyle({
        filename: props.api.title || '',
      })
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <img
            src={headerStyle.iconSrc}
            alt=""
            aria-hidden="true"
            style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
          />
          <span style={{ flex: 1 }}>{props.api.title}</span>
          {isCloseable && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.api.close()
              }}
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '1rem', // usa rem scalabile
                lineHeight: 1,
                color: 'var(--ui-text-muted)',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ui-bg-hover)'
                e.currentTarget.style.color = 'var(--drawer-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--ui-text-muted)'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </div>
      )
    }

    // ✅ Tab graph-builder (rename / note / delete)
    if (component === 'graph-builder') {
      return (
        <GraphBuilderTabHeader
          {...props}
          isCloseable={isCloseable}
        />
      )
    }

    // ✅ Tab con configurazione (explorer, graph, persons, etc.)
    // Titolo sempre con lo stesso colore di testo delle tab documento (es. PDF),
    // per contrasto leggibile; solo l'icona resta colorata per tipo.
    const config = TAB_CONFIGS[component]
    if (config) {
      const Icon = config.icon
      const iconColor = isActive ? config.colorActive : config.colorBase
      const tabTitle = component === 'persons'
        ? 'Schede anagrafiche'
        : component === 'entities'
          ? 'Entità'
          : props.api.title

      const tabBody = (
        <>
          <Icon
            size={18}
            strokeWidth={2.5}
            fill="none"
            style={{
              position: 'relative',
              color: iconColor,
              stroke: iconColor,
              flexShrink: 0,
              transition: 'color 0.3s ease, stroke 0.3s ease'
            }}
          />
          <span style={{
            position: 'relative',
            fontWeight: isActive ? 700 : 400,
            color: 'hsl(var(--foreground))',
            transition: 'font-weight 0.3s ease',
            flex: 1
          }}>
            {tabTitle}
          </span>
          {isCloseable && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.api.close()
              }}
              style={{
                position: 'relative',
                marginLeft: '8px',
                padding: '2px 6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '1rem', // usa rem scalabile
                lineHeight: 1,
                color: 'var(--ui-text-muted)',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ui-bg-hover)'
                e.currentTarget.style.color = 'var(--drawer-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--ui-text-muted)'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </>
      )

      if ((component === 'persons' || component === 'entities') && praticaId) {
        return (
          <div style={{ width: '100%' }}>
            <ExtractionTabFill
              praticaId={praticaId}
              kind={component}
              fillColor={component === 'persons'
                ? 'rgba(34, 197, 94, 0.22)'
                : 'rgba(6, 182, 212, 0.22)'}
            >
              {tabBody}
            </ExtractionTabFill>
          </div>
        )
      }

      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%'
        }}>
          {tabBody}
        </div>
      )
    }

    // Default: solo testo
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <span style={{ flex: 1 }}>{props.api.title}</span>
        {isCloseable && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              props.api.close()
            }}
            style={{
              marginLeft: '8px',
              padding: '2px 6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              color: '#666',
              borderRadius: '3px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ui-bg-hover)'
              e.currentTarget.style.color = 'var(--drawer-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--ui-text-muted)'
            }}
            title="Chiudi"
          >
            ×
          </button>
        )}
      </div>
    )
  }, [drawerTabs, comparti, dockviewApiRef, praticaId])

  // Handler per quando Dockview è pronto
  const onReady = useCallback((event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api

    // Ripristina layout solo se è l'ultima pratica lasciata aperta; altrimenti riparte da zero
    try {
      const layout = getRestorableLayoutForPratica(praticaId)
      if (layout) {
        event.api.fromJSON(layout)
      }
    } catch (err) {
      console.error('[DOCK-V3] Errore caricamento layout ultima sessione:', err)
    }

    // ✅ Funzione helper per sbloccare tutti i gruppi
    const unlockAllGroups = () => {
      const groups = event.api.groups
      // ✅ Log rimosso per ridurre spam console
      groups.forEach((group, index) => {
        const wasLocked = group.locked
        if (group.locked) {
          group.locked = false
          console.log(`[DOCK-V3] 🔓 Gruppo ${index} (${group.id}) sbloccato. Era locked:`, wasLocked)
        } else {
          // ✅ Log rimosso per ridurre spam console
        }
      })
    }

    // ✅ Assicura che tutti i gruppi non siano bloccati per permettere drag and drop
    unlockAllGroups()

    // ✅ Sblocca anche dopo un breve delay per assicurarsi che il layout sia completamente caricato
    setTimeout(unlockAllGroups, 100)

    // ✅ Listener per quando vengono aggiunti nuovi gruppi - assicura che non siano bloccati
    const disposableGroups = event.api.onDidAddGroup((group) => {
      console.log('[DOCK-V3] ➕ Nuovo gruppo aggiunto:', group.id, 'locked:', group.locked)
      if (group.locked) {
        group.locked = false
        console.log('[DOCK-V3] 🔓 Nuovo gruppo sbloccato:', group.id)
      }
    })

    // ✅ Listener per quando viene aggiunto un pannello
    const disposablePanels = event.api.onDidAddPanel((panel) => {
      console.log('[DOCK-V3] ➕ Nuovo pannello aggiunto:', panel.id, 'gruppo:', panel.group?.id, 'gruppo locked:', panel.group?.locked)
      if (panel.group?.locked) {
        panel.group.locked = false
        console.log('[DOCK-V3] 🔓 Gruppo del pannello sbloccato:', panel.group.id)
      }
      const isGraph =
        (panel as any).params?.component === 'graph-builder'
        || (panel as any).component === 'graph-builder'
      if (isGraph) {
        const graphId = (panel as any).params?.graphId || panel.id
        const graphName =
          (panel as any).params?.graphName
          || (panel as any).title
          || 'Grafo'
        // Vale anche per i pannelli ripristinati dal layout salvato: il canvas
        // non deve mai essere smontato al cambio tab.
        if (panel.api.renderer !== 'always') {
          panel.api.setRenderer('always')
        }
        setOpenGraphIds((prev) => {
          if (prev.has(graphId)) return prev
          const next = new Set(prev)
          next.add(graphId)
          return next
        })
        ensureGraphRef.current(graphId, graphName)
      }
      setDrawerPanelsUpdateTrigger(prev => prev + 1) // ✅ Aggiorna trigger quando viene aggiunto un pannello
    })

    // ✅ Listener per quando viene rimosso un pannello
    const disposablePanelsRemove = event.api.onDidRemovePanel((panel: any) => {
      const isGraph =
        panel?.params?.component === 'graph-builder'
        || panel?.component === 'graph-builder'
      if (isGraph) {
        const graphId = panel?.params?.graphId || panel?.id
        if (graphId) {
          setOpenGraphIds((prev) => {
            if (!prev.has(graphId)) return prev
            const next = new Set(prev)
            next.delete(graphId)
            return next
          })
        }
      }
      setDrawerPanelsUpdateTrigger(prev => prev + 1) // ✅ Aggiorna trigger quando viene rimosso un pannello
    })

    // ✅ Verifica metodi disponibili sull'API per debug
    const apiMethods = Object.keys(event.api).filter(key => key.startsWith('on'))
    // ✅ Log rimosso per ridurre spam console

    // ✅ Traccia la posizione dei pannelli prima del drag per confrontare dopo
    // ✅ Usa un oggetto ref-like per isDragging (non possiamo usare useRef dentro un callback)
    const dragState = { isDragging: false }
    let panelPositionsBeforeDrag = new Map<string, string>()

    // ✅ RIMOSSI handler globali - Dockview gestisce internamente i suoi drag
    // ✅ I componenti locali (DocumentCollection, DrawerTabStrip, ecc.) gestiscono i loro drop
    // ✅ Nessun conflitto: ogni sistema gestisce solo i suoi eventi

    // ✅ Listener per eventi di drag (se disponibile)
    let disposableWillDrag: any = null
    if (typeof event.api.onWillDragPanel === 'function') {
      try {
        disposableWillDrag = event.api.onWillDragPanel((dragEvent: any) => {
          dragState.isDragging = true // ✅ Usa oggetto ref-like
          // ✅ NON mostrare overlay qui - aspetta che dragover venga chiamato
          // Questo garantisce che Dockview abbia già inizializzato il drag

          // ✅ Salva posizioni prima del drag
          panelPositionsBeforeDrag.clear()
          event.api.groups.forEach((group) => {
            group.panels.forEach(panel => {
              panelPositionsBeforeDrag.set(panel.id, group.id)
            })
          })

          console.log('[DOCK-V3] 🖱️ DRAG INIZIATO - Pannello:', dragEvent.panel?.id, 'Gruppo:', dragEvent.panel?.group?.id, 'Gruppo locked:', dragEvent.panel?.group?.locked)
          console.log('[DOCK-V3] 🖱️ DRAG - Event completo:', dragEvent)

          // ✅ Verifica se possiamo prevenire il drag (per debug)
          if (dragEvent.nativeEvent) {
            const nativeEvent = dragEvent.nativeEvent as DragEvent
            console.log('[DOCK-V3] 🖱️ DRAG - Native event:', nativeEvent)
            console.log('[DOCK-V3] 🖱️ DRAG - DataTransfer effectAllowed:', nativeEvent.dataTransfer?.effectAllowed)

            // ✅ Imposta effectAllowed per permettere il move
            if (nativeEvent.dataTransfer) {
              nativeEvent.dataTransfer.effectAllowed = 'move'
              console.log('[DOCK-V3] 🖱️ DRAG - Impostato effectAllowed a "move"')
            }
          }

          // ✅ Reset flag dopo un timeout (in caso il drop non venga rilevato)
          setTimeout(() => {
            if (dragState.isDragging) {
              console.log('[DOCK-V3] ⚠️ DRAG FINITO (timeout) - Reset flag')
              dragState.isDragging = false
              disableDragMode() // ✅ Disabilita drag mode anche in caso di timeout
            }
          }, 5000)
        })
      } catch (err) {
        console.error('[DOCK-V3] ❌ Errore registrazione onWillDragPanel:', err)
      }
    } else {
      console.warn('[DOCK-V3] ⚠️ onWillDragPanel non disponibile')
    }

    // ✅ Listener per eventi di drop (se disponibile)
    let disposableWillDrop: any = null
    if (typeof event.api.onWillDrop === 'function') {
      try {
        disposableWillDrop = event.api.onWillDrop((dropEvent: any) => {
          console.log('[DOCK-V3] 🎯 DROP - Pannello:', dropEvent.panel?.id, 'Target:', dropEvent.target?.type, 'Target ID:', dropEvent.target?.id)
          console.log('[DOCK-V3] 🎯 DROP - Event completo:', dropEvent)
          console.log('[DOCK-V3] 🎯 DROP - Target group:', dropEvent.target?.group?.id, 'Target group locked:', dropEvent.target?.group?.locked)
          // ✅ Verifica se possiamo prevenire il drop (per debug)
          if (dropEvent.nativeEvent) {
            console.log('[DOCK-V3] 🎯 DROP - Native event:', dropEvent.nativeEvent)
          }
          // ✅ NON restituire nulla - permette il drop
          return undefined // Permetti il drop
        })
      } catch (err) {
        console.error('[DOCK-V3] ❌ Errore registrazione onWillDrop:', err)
      }
    } else {
      console.warn('[DOCK-V3] ⚠️ onWillDrop non disponibile')
    }

    // ✅ Listener per quando un pannello viene spostato (se disponibile)
    let disposableDidMove: any = null
    if (typeof event.api.onDidMovePanel === 'function') {
      try {
        disposableDidMove = event.api.onDidMovePanel((moveEvent: any) => {
          console.log('[DOCK-V3] ✅ PANNELLO SPOSTATO - Pannello:', moveEvent.panel?.id, 'Da gruppo:', moveEvent.from?.group?.id, 'A gruppo:', moveEvent.to?.group?.id)
          const panel = moveEvent.panel
          // Dopo lo split il contenuto spesso resta non ridisegnato finché non forziamo size/attivo.
          const heal = () => {
            try {
              if (panel?.api && typeof panel.api.setActive === 'function') {
                panel.api.setActive()
              }
              window.dispatchEvent(new Event('resize'))
            } catch (cause) {
              console.error('[DOCK-V3] heal post-move fallito', cause)
            }
          }
          requestAnimationFrame(() => {
            heal()
            setTimeout(heal, 80)
            setTimeout(heal, 220)
          })
        })
      } catch (err) {
        console.error('[DOCK-V3] ❌ Errore registrazione onDidMovePanel:', err)
      }
    } else {
      console.warn('[DOCK-V3] ⚠️ onDidMovePanel non disponibile')
    }

    // ✅ Listener per mouseup globale per rilevare quando il drag termina
    const handleMouseUp = () => {
        if (dragState.isDragging) {
          console.log('[DOCK-V3] 🖱️ MOUSE UP - Drag terminato')
          dragState.isDragging = false
          disableDragMode() // ✅ Disabilita drag mode quando il mouse viene rilasciato

        // ✅ Dopo un breve delay, verifica se il pannello è stato spostato
        setTimeout(() => {
          const currentPositions = new Map<string, string>()
          event.api.groups.forEach((group) => {
            group.panels.forEach(panel => {
              currentPositions.set(panel.id, group.id)
            })
          })

          let foundMovement = false
          currentPositions.forEach((groupId, panelId) => {
            const oldGroupId = panelPositionsBeforeDrag.get(panelId)
            if (oldGroupId && oldGroupId !== groupId) {
              console.log(`[DOCK-V3] ✅ SPOSTAMENTO CONFERMATO - Pannello ${panelId}: da gruppo ${oldGroupId} a gruppo ${groupId}`)
              foundMovement = true
            }
          })

          if (!foundMovement && panelPositionsBeforeDrag.size > 0) {
            console.log(`[DOCK-V3] ❌ NESSUNO SPOSTAMENTO - Il pannello è rimasto nella stessa posizione`)
            console.log(`[DOCK-V3] ❌ Posizioni prima:`, Array.from(panelPositionsBeforeDrag.entries()))
            console.log(`[DOCK-V3] ❌ Posizioni dopo:`, Array.from(currentPositions.entries()))
          }

          panelPositionsBeforeDrag.clear()
        }, 100)
      }
    }

    // ✅ Aggiungi listener globale per mouseup
    document.addEventListener('mouseup', handleMouseUp)

    // ✅ RIMOSSO: updateActivePanel, handleTabClick, click listener - ogni viewer gestisce la propria attivazione

    // ✅ Listener per layout changes (event-driven, più efficiente del polling)
    let layoutChangeCount = 0
    const disposableLayoutChange = event.api.onDidLayoutChange(() => {
      // ✅ RIMOSSO: updateActivePanel - ogni viewer gestisce la propria attivazione

      layoutChangeCount++
      const currentPositions = new Map<string, string>()
      event.api.groups.forEach((group) => {
        group.panels.forEach(panel => {
          currentPositions.set(panel.id, group.id)
        })
      })

      // ✅ Solo log dettagliato se non stiamo facendo drag (per evitare spam durante il drag)
      if (!dragState.isDragging || layoutChangeCount % 5 === 0) {
        console.log(`[DOCK-V3] 📐 LAYOUT CAMBIATO (#${layoutChangeCount}) - Gruppi:`, event.api.groups.length, 'Pannelli totali:', event.api.panels.length)
      }

      // ✅ Confronta posizioni per rilevare spostamenti (solo dopo che il drag è finito)
      if (!dragState.isDragging && panelPositionsBeforeDrag.size > 0) {
        let foundMovement = false
        currentPositions.forEach((groupId, panelId) => {
          const oldGroupId = panelPositionsBeforeDrag.get(panelId)
          if (oldGroupId && oldGroupId !== groupId) {
            console.log(`[DOCK-V3] ✅ SPOSTAMENTO RILEVATO - Pannello ${panelId}: da gruppo ${oldGroupId} a gruppo ${groupId}`)
            foundMovement = true
          }
        })

        if (!foundMovement && panelPositionsBeforeDrag.size > 0) {
          console.log(`[DOCK-V3] ⚠️ DROP COMPLETATO MA NESSUNO SPOSTAMENTO - Il pannello è tornato nella posizione originale`)
        }

        // ✅ Reset dopo il confronto
        panelPositionsBeforeDrag.clear()
      }

      if (!dragState.isDragging || layoutChangeCount % 5 === 0) {
        event.api.groups.forEach((group, idx) => {
          const panelIds = group.panels.map(p => p.id).join(', ')
          console.log(`[DOCK-V3] 📐 Gruppo ${idx} (${group.id}): locked:`, group.locked, 'pannelli:', group.panels.length, 'IDs:', panelIds)
        })
      }

      // ✅ Salva posizioni correnti per il prossimo confronto
      if (!dragState.isDragging) {
        panelPositionsBeforeDrag = new Map(currentPositions)
      }
    })

    // Salva solo l'ultima sessione (pratica corrente + layout)
    const disposableLayout = event.api.onDidLayoutChange(() => {
      try {
        if (!praticaId) return
        const layout = event.api.toJSON()
        saveLastWorkspaceSession(praticaId, layout)
        // Legacy per-pratica: non aggiornare più ws_dock_v3_* (evita restore non coordinato)
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // ignore
        }
      } catch (err) {
        console.error('[DOCK-V3] Errore salvataggio layout ultima sessione:', err)
      }
    })

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      // ✅ RIMOSSO: cleanup click listener e polling - non più necessari
      // ✅ RIMOSSO cleanupGlobalListeners - non ci sono più handler globali
      disposableGroups.dispose()
      disposablePanels.dispose()
      if (disposablePanelsRemove) disposablePanelsRemove.dispose()
      if (disposableWillDrag) disposableWillDrag.dispose()
      if (disposableWillDrop) disposableWillDrop.dispose()
      if (disposableDidMove) disposableDidMove.dispose()
      disposableLayoutChange.dispose()
      disposableLayout.dispose()
    }
  }, [storageKey, praticaId, enableDragMode, disableDragMode])

  // Handler per click su drawer tab
  const handleDrawerTabClick = useCallback((drawerKey: string, drawerId: string) => {
    if (!dockviewApiRef.current) return

    const panelId = `drawer-${drawerId}`
    const existingPanel = dockviewApiRef.current.getPanel(panelId)

    if (existingPanel) {
      // ✅ Verifica che setActivePanel esista prima di chiamarlo
      if (typeof dockviewApiRef.current.setActivePanel === 'function') {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else if (existingPanel.api) {
        // Fallback: usa l'API del pannello direttamente
        existingPanel.api.setActive()
      }
      } else {
        // Crea nuovo pannello nella zona drawer (bottom)
        const comparto = comparti.find(c => c.id === drawerId)
        const drawerNumber = comparto ? comparti.findIndex(c => c.id === drawerId) + 1 : undefined

        const newPanel = dockviewApiRef.current.addPanel({
          id: panelId,
          component: 'drawer-content',
          params: {
            component: 'drawer-content', // ✅ Aggiungi component nei params
            drawerId: drawerId,
            drawerKey: drawerKey,
            drawerTitle: comparto?.nome || 'Drawer',
            // ✅ Salva i dati per il rendering immediato della tab (anche se comparti non sono ancora caricati)
            drawerNumber: drawerNumber,
            drawerColor: comparto ? colorFor(comparto.nome) : '#f59e0b',
            // Icona ricostruita in tabHeader da drawerTitle via iconFor (allineata al cassetto)
          },
          title: comparto?.nome || 'Drawer',
          closeable: true // ✅ Abilita pulsante close sulla tab
        })
        console.log('[DOCK-V3] ➕ Pannello drawer creato:', panelId, 'Gruppo:', newPanel?.group?.id, 'Gruppo locked:', newPanel?.group?.locked)
        // ✅ Assicura che il gruppo del pannello non sia bloccato per permettere drag and drop
        if (newPanel?.group?.locked) {
          newPanel.group.locked = false
          console.log('[DOCK-V3] 🔓 Gruppo drawer sbloccato:', newPanel.group.id)
        }
      }
  }, [comparti])

  /**
   * Drop file OS sulla strip cassetti (path React).
   * Le tab Dockview usano invece bindDrawerOsFileDrop (capture nativo).
   */
  const handleDrawerTabDrop = useCallback((files: File[], drawerId: string) => {
    void uploadOsFilesToDrawer(files, drawerId).then(() => {
      const comparto = comparti.find(c => c.id === drawerId)
      if (!comparto) {
        throw new Error(`[DRAWER-TAB-DROP] Comparto non trovato per id: ${drawerId}`)
      }
      handleDrawerTabClick(comparto.chiave, comparto.id)
    })
  }, [comparti, handleDrawerTabClick])

  // Drop OS su tab cassetto: capture nativo (Dockview intercetta il bubble sulle .dv-tab)
  useEffect(() => {
    const root = dockRootRef.current
    if (!root) return
    return bindDrawerOsFileDrop(root, {
      onAfterUpload: (drawerId) => {
        const comparto = comparti.find(c => c.id === drawerId)
        if (!comparto) {
          throw new Error(`[DRAWER-OS-DROP] Comparto non trovato dopo upload: ${drawerId}`)
        }
        handleDrawerTabClick(comparto.chiave, comparto.id)
      },
    })
  }, [comparti, handleDrawerTabClick])

  // Handler per click su archive tab (sidebar)
  const handleArchiveTabClick = useCallback((component: string, tabId: string, title?: string) => {
    if (!dockviewApiRef.current) return

    const panelId = tabId
    const existingPanel = dockviewApiRef.current.getPanel(panelId)

    if (existingPanel) {
      // ✅ Verifica che setActivePanel esista prima di chiamarlo
      if (typeof dockviewApiRef.current.setActivePanel === 'function') {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else if (existingPanel.api) {
        // Fallback: usa l'API del pannello direttamente
        existingPanel.api.setActive()
      }
    } else {
      // Crea nuovo pannello
      let panelComponent = component
      let params: any = {}

      if (component === 'cliente-memoria') {
        const clienteId = tabId.replace('cliente-', '').replace('-tab', '')
        panelComponent = 'cliente-memoria'
        params = { clienteId }
        // Trova il nome del cliente
        const cliente = clienti.find(c => c.id === clienteId)
        if (cliente && !title) {
          title = `${cliente.nome} ${cliente.cognome}`
        }
      }

      const newPanel = dockviewApiRef.current.addPanel({
        id: panelId,
        component: panelComponent,
        params: {
          ...params,
          component: panelComponent // ✅ Aggiungi component nei params
        },
        title: title || component,
        closeable: true // ✅ Abilita pulsante close sulla tab
      })
      console.log('[DOCK-V3] ➕ Pannello creato:', panelId, 'Component:', panelComponent, 'Gruppo:', newPanel?.group?.id, 'Gruppo locked:', newPanel?.group?.locked)
      // ✅ Assicura che il gruppo del pannello non sia bloccato per permettere drag and drop
      if (newPanel?.group?.locked) {
        newPanel.group.locked = false
        console.log('[DOCK-V3] 🔓 Gruppo sbloccato:', newPanel.group.id)
      }
    }

    if (onLeftBorderTabChange) {
      onLeftBorderTabChange(component)
    }
  }, [onLeftBorderTabChange, clienti])

  // Expose API methods
  useImperativeHandle(ref, () => ({
    openDoc: (doc: DocTab) => {
      if (!dockviewApiRef.current) {
        throw new Error('Impossibile aprire il documento: workspace non ancora pronto')
      }

      const panelId = `doc-${doc.id}`
      const existingPanel = dockviewApiRef.current.getPanel(panelId)

      const activatePanel = (panel: NonNullable<typeof existingPanel>) => {
        if (typeof dockviewApiRef.current?.setActivePanel === 'function') {
          dockviewApiRef.current.setActivePanel(panel)
        }
        if (panel.api && typeof panel.api.setActive === 'function') {
          panel.api.setActive()
        }
      }

      if (existingPanel) {
        activatePanel(existingPanel)
        return true
      }

      const newPanel = dockviewApiRef.current.addPanel({
        id: panelId,
        component: 'doc',
        params: {
          component: 'doc',
          docId: doc.id
        },
        title: doc.title,
        closeable: true,
        // Evita pane bianco dopo drag in un nuovo gruppo (dockview onlyWhenVisible).
        renderer: 'always',
      })
      if (newPanel?.group?.locked) {
        newPanel.group.locked = false
      }
      if (newPanel) {
        activatePanel(newPanel)
      }
      return false
    },
    openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => {
      if (!dockviewApiRef.current) return

      const panelId = `tmpdoc-${meta.id}`
      const existingPanel = dockviewApiRef.current.getPanel(panelId)

      if (existingPanel) {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else {
        const newPanel = dockviewApiRef.current.addPanel({
          id: panelId,
          component: 'tmpdoc',
          params: {
            component: 'tmpdoc', // ✅ Aggiungi component nei params
            meta
          },
          title: meta.title || 'Documento temporaneo',
          closeable: true // ✅ Abilita pulsante close sulla tab
        })
        // ✅ Assicura che il gruppo del pannello non sia bloccato per permettere drag and drop
        if (newPanel?.group?.locked) {
          newPanel.group.locked = false
        }
      }
    },
    openExplorer: () => {
      handleArchiveTabClick('explorer', 'explorerTab', 'Explorer')
    },
    openPersons: () => {
      handleArchiveTabClick('persons', 'personsTab', 'Schede anagrafiche')
    },
    closePersons: () => {
      const panel = dockviewApiRef.current?.getPanel('personsTab')
      if (!panel) return
      if (typeof panel.api?.close === 'function') {
        panel.api.close()
      }
    },
    openEntities: () => {
      handleArchiveTabClick('entities', 'entitiesTab', 'Entità')
    },
    closeEntities: () => {
      const panel = dockviewApiRef.current?.getPanel('entitiesTab')
      if (!panel) return
      if (typeof panel.api?.close === 'function') {
        panel.api.close()
      }
    },
    openCliente: (clienteId?: string) => {
      // Se non specificato, usa il primo cliente
      if (!clienteId && clienti.length > 0) {
        clienteId = clienti[0].id
      }
      if (clienteId) {
        const cliente = clienti.find(c => c.id === clienteId)
        const title = cliente ? `${cliente.nome} ${cliente.cognome}` : undefined
        handleArchiveTabClick('cliente-memoria', `cliente-${clienteId}-tab`, title)
      }
    },
    openGraphBuilder: (graphId?: string) => {
      if (!dockviewApiRef.current) return
      if (graphId) {
        const existing = listGraphs().find((graph) => graph.id === graphId)
        if (!existing) {
          throw new Error(`Grafo non trovato nel catalogo: ${graphId}`)
        }
        openGraphPanel(graphId, existing.name)
        return
      }
      createGraph()
    },
    // Il catalogo è già allineato dai canvas, ma sui grafi montati si legge il
    // contenuto vivo per non perdere le modifiche ancora dentro il debounce.
    saveAllGraphs: () => listGraphs().map((stored) => {
      const live = graphBuilderRefs.current.get(stored.id)?.getContent()
      return live ? withGraphContent(stored, live) : stored
    }),
  }), [handleArchiveTabClick, clienti, createGraph, openGraphPanel, listGraphs])

  return (
    <GraphWorkspaceProvider value={graphWorkspaceValue}>
    <div
      ref={dockRootRef}
      className={`dockv3-root w-full h-full relative flex ${isDragActiveRef.current ? 'drag-active' : ''}`}
    >
      {/* Area documenti: si restringe quando il pannello cerca globale è aperto */}
      <div
        className="relative min-h-0 min-w-0 flex-1 transition-all duration-300"
        style={{
          ...(isDrawerStripPinned && isDrawerStripVisible
            ? DRAWER_STRIP_POSITION === 'top'
              ? { paddingTop: '120px' }
              : DRAWER_STRIP_POSITION === 'bottom'
              ? { paddingBottom: '120px' }
              : DRAWER_STRIP_POSITION === 'left'
              ? { paddingLeft: '120px' }
              : { paddingRight: '120px' }
            : {}
          ),
        }}
      >
        <DockviewReact
          components={components}
          defaultTabComponent={defaultTabComponent}
          onReady={onReady}
          className="dockview-theme-light h-full w-full"
        />
      </div>

      {/* Sibling flex: non overlay — stesso pattern del pannello ricerca documento */}
      {renderSearch?.()}

      {/* ✅ Due linguette separate affiancate quando nascosti (Stato 1) */}
      {drawerTabs.length > 0 && !isDrawerStripVisible && (
        <div
          className={`fixed z-50 flex items-center gap-2 ${
            DRAWER_STRIP_POSITION === 'top'
              ? 'left-1/2 transform -translate-x-1/2'
              : DRAWER_STRIP_POSITION === 'bottom'
              ? 'bottom-0 left-1/2 transform -translate-x-1/2'
              : DRAWER_STRIP_POSITION === 'left'
              ? 'left-0 top-1/2 transform -translate-y-1/2'
              : 'right-0 top-1/2 transform -translate-y-1/2'
          }`}
          style={{
            ...(DRAWER_STRIP_POSITION === 'top'
              ? { top: `${headerHeight}px` } // ✅ Posizionata subito sotto l'header
              : {}
            ),
            pointerEvents: 'auto',
          }}
        >
          {/* ✅ Linguetta 1: "Cassetti" - hover per preview, click per aprire */}
          <div
            onMouseEnter={() => {
              setIsDrawerStripVisible(true)
              if (drawerStripTimeoutRef.current) {
                clearTimeout(drawerStripTimeoutRef.current)
                drawerStripTimeoutRef.current = null
              }
            }}
            onClick={handleOpenDrawers}
            className={`px-4 py-2 cursor-pointer transition-all ${
              DRAWER_STRIP_POSITION === 'top'
                ? 'rounded-b-lg'
                : DRAWER_STRIP_POSITION === 'bottom'
                ? 'rounded-t-lg'
                : DRAWER_STRIP_POSITION === 'left'
                ? 'rounded-r-lg'
                : 'rounded-l-lg'
            }`}
            style={{
              background: 'hsl(var(--card) / 0.95)',
              border: '1px solid var(--ui-border-subtle)',
              ...(DRAWER_STRIP_POSITION === 'top'
                ? { borderTop: 'none', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }
                : DRAWER_STRIP_POSITION === 'bottom'
                ? { borderBottom: 'none', boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)' }
                : DRAWER_STRIP_POSITION === 'left'
                ? { borderLeft: 'none', boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)' }
                : { borderRight: 'none', boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)' }
              ),
            }}
          >
            <span className="text-sm font-medium text-foreground">Cassetti</span>
          </div>

          {/* ✅ Linguetta 2: PIN - solo click (no hover) per aprire e fissare */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              handleOpenAndPin()
            }}
            className={`px-3 py-2 cursor-pointer transition-all ${
              DRAWER_STRIP_POSITION === 'top'
                ? 'rounded-b-lg'
                : DRAWER_STRIP_POSITION === 'bottom'
                ? 'rounded-t-lg'
                : DRAWER_STRIP_POSITION === 'left'
                ? 'rounded-r-lg'
                : 'rounded-l-lg'
            }`}
            style={{
              background: 'hsl(var(--card) / 0.95)',
              border: '1px solid var(--ui-border-subtle)',
              ...(DRAWER_STRIP_POSITION === 'top'
                ? { borderTop: 'none', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }
                : DRAWER_STRIP_POSITION === 'bottom'
                ? { borderBottom: 'none', boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)' }
                : DRAWER_STRIP_POSITION === 'left'
                ? { borderLeft: 'none', boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)' }
                : { borderRight: 'none', boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)' }
              ),
            }}
            title="Fissa cassetti"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V8.26a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 5.24v5.52M15 10.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V8.26a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 5.24v5.52"/>
            </svg>
          </div>
        </div>
      )}

      {/* Drawer Tab Strip - Stati 2 e 3 */}
      {drawerTabs.length > 0 && isDrawerStripVisible && (
        <div
          className={`fixed z-50 transition-transform duration-300 ${
            DRAWER_STRIP_POSITION === 'top' || DRAWER_STRIP_POSITION === 'bottom'
              ? 'left-0 right-0'
              : 'top-0 bottom-0'
          } ${
            isDrawerStripVisible
              ? DRAWER_STRIP_POSITION === 'top'
                ? 'translate-y-0'
                : DRAWER_STRIP_POSITION === 'bottom'
                ? 'translate-y-0'
                : DRAWER_STRIP_POSITION === 'left'
                ? 'translate-x-0'
                : 'translate-x-0'
              : DRAWER_STRIP_POSITION === 'top'
                ? '-translate-y-full'
                : DRAWER_STRIP_POSITION === 'bottom'
                ? 'translate-y-full'
                : DRAWER_STRIP_POSITION === 'left'
                ? '-translate-x-full'
                : 'translate-x-full'
          }`}
          data-drawer-strip="true"
          style={{
            ...(DRAWER_STRIP_POSITION === 'top'
              ? { top: `${headerHeight}px`, paddingBottom: '76px' }
              : DRAWER_STRIP_POSITION === 'bottom'
              ? { bottom: '0px', paddingTop: '76px' }
              : DRAWER_STRIP_POSITION === 'left'
              ? { left: '0px', paddingRight: '76px' }
              : { right: '0px', paddingLeft: '76px' }
            ),
            pointerEvents: 'auto',
          }}
          onMouseEnter={handleDrawerStripMouseEnter}
          onMouseLeave={handleDrawerStripMouseLeave}
        >
            {/* ✅ Pulsante PIN posizionato in base all'orientamento */}
            <div
              className="absolute z-10"
              style={{
                ...(DRAWER_STRIP_POSITION === 'top'
                  ? {
                      bottom: '0',
                      right: '0',
                      transform: 'translateY(100%)',
                      marginBottom: '4px',
                      marginRight: '4px'
                    }
                  : DRAWER_STRIP_POSITION === 'bottom'
                  ? {
                      top: '0',
                      right: '0',
                      transform: 'translateY(-100%)',
                      marginTop: '4px',
                      marginRight: '4px'
                    }
                  : DRAWER_STRIP_POSITION === 'left'
                  ? {
                      top: '0',
                      right: '0',
                      transform: 'translateX(100%)',
                      marginTop: '4px',
                      marginRight: '4px'
                    }
                  : {
                      top: '0',
                      left: '0',
                      transform: 'translateX(-100%)',
                      marginTop: '4px',
                      marginLeft: '4px'
                    }
                ),
              }}
            >
              <button
                onClick={handleTogglePin}
                className="p-2 rounded-lg bg-background/90 hover:bg-background border border-border shadow-md transition-all"
                title={isDrawerStripPinned ? 'Sfissa cassetti' : 'Fissa cassetti'}
              >
                {isDrawerStripPinned ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-blue-600">
                    <path d="M16 12V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 1.1.9 2 2 2s2-.9 2-2V4h1c.55 0 1-.45 1-1s-.45-1-1-1h-1v8c0 2.21-1.79 4-4 4s-4-1.79-4-4V4h-1c-.55 0-1 .45-1 1s.45 1 1 1h1v8c0 1.1.9 2 2 2s2-.9 2-2z"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
                    <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V8.26a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 5.24v5.52M15 10.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V8.26a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 5.24v5.52"/>
                  </svg>
                )}
              </button>
            </div>

          {/* ✅ Wrapper interno per contenere i cassetti con margine negativo per compensare il padding */}
          <div style={{
            ...(DRAWER_STRIP_POSITION === 'top'
              ? { marginBottom: '-76px' }
              : DRAWER_STRIP_POSITION === 'bottom'
              ? { marginTop: '-76px' }
              : DRAWER_STRIP_POSITION === 'left'
              ? { marginRight: '-76px' }
              : { marginLeft: '-76px' }
            ),
          }}>
            <DrawerTabStrip
              items={drawerTabs}
              selectedId={selectedDrawerId}
              onSelect={(id) => {
                setSelectedDrawerId(id)
                const comparto = comparti.find(c => c.id === id)
                if (comparto) {
                  handleDrawerTabClick(comparto.chiave, comparto.id)
                }
              }}
              onDrop={handleDrawerTabDrop}
              orientation={DRAWER_STRIP_POSITION === 'top' || DRAWER_STRIP_POSITION === 'bottom' ? 'horizontal' : 'vertical'}
              position={DRAWER_STRIP_POSITION}
            />
          </div>
        </div>
      )}
    </div>
    </GraphWorkspaceProvider>
  )
}

export const DockWorkspaceV3 = forwardRef<DockWorkspaceV3Handle, Props>(DockWorkspaceV3Component)

