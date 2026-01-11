import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps, IDockviewPanelHeaderProps, DockviewDefaultTab } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
import { DrawerTabStrip, DrawerTabItem } from '../features/drawers/DrawerTabStrip'
import { colorFor, iconFor } from '../features/drawers/drawerPalette'
import { SidebarArchivi } from './SidebarArchivi'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText, FolderOpen, Search, User, CreditCard, Calendar, Network, Mail, Image } from 'lucide-react'
import type { Comparto } from '@/types'
import { api } from '@/lib/api'
import type { DrawerType } from '../features/drawers/types'
import './DockWorkspaceV3.css'

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
  'cliente-memoria': {
    icon: Users,
    colorBase: '#94a3b8', // slate-400 spento
    colorActive: '#64748b' // slate-500 vivace
  }
}

// Props interface (manteniamo la stessa di V2 per compatibilità)
export type Props = {
  renderPersons?: () => React.ReactNode
  renderContacts?: () => React.ReactNode
  renderIds?: () => React.ReactNode
  renderDoc?: (docId: string) => React.ReactNode
  storageKey?: string
  renderEvents?: () => React.ReactNode
  renderExplorer?: () => React.ReactNode
  renderSearch?: () => React.ReactNode
  onLeftBorderTabChange?: (component: string) => void
  praticaId?: string
  clienti?: Array<{ id: string; nome: string; cognome: string }>
  renderClienteMemoria?: (clienteId: string) => React.ReactNode
  headerHeight?: number
}

export type DockWorkspaceV3Handle = {
  openDoc: (doc: DocTab) => void
  openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => void
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
    renderContacts,
    renderIds,
    renderDoc,
    storageKey = 'ws_dock_v3',
    renderEvents,
    renderExplorer,
    onLeftBorderTabChange,
    praticaId,
    clienti = [],
    renderClienteMemoria,
    headerHeight = 0
  } = props

  const dockviewApiRef = useRef<any>(null)
  const fullscreenTogglesRef = useRef<Map<string, () => void>>(new Map())
  const [fullscreenStates, setFullscreenStates] = useState<Map<string, boolean>>(new Map())
  const [fullscreenTrigger, setFullscreenTrigger] = useState(0)

  // State per i cassetti (comparti)
  const [comparti, setComparti] = useState<Comparto[]>([])
  const [selectedDrawerId, setSelectedDrawerId] = useState<string | undefined>(undefined)
  const [isDrawerStripVisible, setIsDrawerStripVisible] = useState(false)
  const [isDrawerStripPinned, setIsDrawerStripPinned] = useState(false) // ✅ PIN per fissare i cassetti
  const [drawerPanelsUpdateTrigger, setDrawerPanelsUpdateTrigger] = useState(0) // ✅ Trigger per aggiornare drawerTabs quando i pannelli cambiano
  const [documentsUpdateTrigger, setDocumentsUpdateTrigger] = useState(0) // ✅ Trigger per aggiornare drawerTabs quando i documenti cambiano

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

  // State per la sidebar archivi
  const [isArchiveSidebarOpen, setIsArchiveSidebarOpen] = useState(false)
  const [selectedArchiveTabId, setSelectedArchiveTabId] = useState<string | null>(null)
  const archiveSidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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
      drawerStripTimeoutRef.current = setTimeout(() => {
        setIsDrawerStripVisible(false)
      }, 300)
    }
  }, [isDrawerStripPinned])

  // ✅ Handler per toggle PIN
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

  // ✅ Ref per gestire il drag attivo (per evitare re-render continui)
  const isDragActiveRef = useRef(false)

  // ✅ State per forzare re-render quando cambia drag mode
  const [dragModeTrigger, setDragModeTrigger] = useState(0)

  // ✅ Funzione per abilitare drag mode (disabilita pointer-events sul contenuto)
  const enableDragMode = useCallback(() => {
    if (!isDragActiveRef.current) {
      console.log('[DOCK-V3] 📦 Abilito drag mode - disabilito pointer-events sul contenuto')
      isDragActiveRef.current = true
      setDragModeTrigger(prev => prev + 1) // ✅ Forza re-render solo una volta
    }
  }, [])

  // ✅ Funzione per disabilitare drag mode (riabilita pointer-events sul contenuto)
  const disableDragMode = useCallback(() => {
    if (isDragActiveRef.current) {
      console.log('[DOCK-V3] 📦 Disabilito drag mode - riabilito pointer-events sul contenuto')
      isDragActiveRef.current = false
      setDragModeTrigger(prev => prev + 1) // ✅ Forza re-render solo una volta
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

  // Prepara le tab per SidebarArchivi (stesso calcolo di V2)
  const archiveTabs = useMemo(() => {
    const staticTabs = [
      { type: 'tab', name: 'Explorer', component: 'explorer', id: 'explorerTab' },
      { type: 'tab', name: 'Anagrafiche', component: 'persons', id: 'personsTab' },
      { type: 'tab', name: 'Contatti', component: 'contacts', id: 'contactsTab' },
      { type: 'tab', name: 'Identificativi', component: 'ids', id: 'idsTab' },
      { type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' },
      { type: 'tab', name: 'Grafo', component: 'graph', id: 'graphTab' }
    ]

    // Helper per determinare genere dal nome italiano (desinenze tipiche)
    const getGenderFromName = (nome: string): 'M' | 'F' | null => {
      if (!nome || nome.trim().length === 0) return null

      const nomeLower = nome.toLowerCase().trim()

      // Nomi femminili comuni italiani
      const knownFemale = new Set([
        'maria', 'giulia', 'anna', 'chiara', 'silvia', 'francesca', 'valentina',
        'federica', 'alessia', 'roberta', 'luisa', 'sara', 'martina', 'elena',
        'laura', 'cristina', 'paola', 'elisa', 'simona', 'monica', 'stefania'
      ])

      // Nomi maschili comuni che finiscono in 'a' (eccezioni)
      const knownMale = new Set([
        'luca', 'andrea', 'nicola', 'elias', 'matteo', 'gianluca', 'francesco',
        'diego', 'emanuele', 'michele', 'gabriele', 'daniele', 'raffaele'
      ])

      // Controlla lista nomi noti
      if (knownFemale.has(nomeLower)) return 'F'
      if (knownMale.has(nomeLower)) return 'M'

      // Desinenze tipicamente femminili italiane
      const femaleEndings = ['ia', 'ea', 'ina', 'etta', 'ella', 'essa', 'ona', 'isa']
      // Desinenze tipicamente maschili italiane
      const maleEndings = ['o', 'io', 'eo', 'ino', 'etto', 'ello', 'one', 'e', 'i']

      // Controlla desinenze femminili (più specifiche)
      for (const ending of femaleEndings) {
        if (nomeLower.endsWith(ending)) {
          return 'F'
        }
      }

      // Controlla desinenze maschili
      for (const ending of maleEndings) {
        if (nomeLower.endsWith(ending)) {
          return 'M'
        }
      }

      // Se finisce in 'a' e non è nelle eccezioni → femmina
      if (nomeLower.endsWith('a') && nomeLower.length > 2) {
        return 'F'
      }

      // Default: maschio (per nomi di genere indefinito o non riconosciuto)
      return 'M'
    }

    const clienteTabs = clienti.map(cliente => {
      const gender = getGenderFromName(cliente.nome)
      return {
        type: 'tab',
        name: `${cliente.nome} ${cliente.cognome}`,
        component: 'cliente-memoria',
        id: `cliente-${cliente.id}-tab`,
        gender
      }
    })

    // ✅ Clienti in cima, poi staticTabs ordinate alfabeticamente
    const allTabs = [...clienteTabs, ...staticTabs.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim()
      const nameB = (b.name || '').toLowerCase().trim()
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
    })]

    const tabs = allTabs.map(tab => {
      const config = TAB_CONFIGS[tab.component]
      if (!config) return null

      // Per clienti, usa volto stilizzato basato su genere dal nome (solo viso con occhi e bocca)
      let icon = React.createElement(config.icon)
      if (tab.component === 'cliente-memoria' && 'gender' in tab) {
        const gender = (tab as any).gender
        // Volto stilizzato: solo cerchio viso con occhi e bocca (NO spalle/corpo)
        if (gender === 'M') {
          // Maschio: volto stilizzato maschile
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="10" r="1.5" fill="currentColor" />
              <circle cx="15" cy="10" r="1.5" fill="currentColor" />
              <path d="M9 15c1 1.5 3 1.5 4 0" strokeWidth="2" />
            </svg>
          )
        } else if (gender === 'F') {
          // Femmina: volto stilizzato femminile (bocca sorridente)
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="10" r="1.5" fill="currentColor" />
              <circle cx="15" cy="10" r="1.5" fill="currentColor" />
              <path d="M8 14c1 1.5 3 1.5 4 1.5s3 0 4-1.5" strokeWidth="1.5" />
            </svg>
          )
        } else {
          // Genere indefinito: usa maschio come default
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="10" r="1.5" fill="currentColor" />
              <circle cx="15" cy="10" r="1.5" fill="currentColor" />
              <path d="M9 15c1 1.5 3 1.5 4 0" strokeWidth="2" />
            </svg>
          )
        }
      }

      return {
        id: tab.id,
        component: tab.component,
        name: tab.name,
        icon,
        colorBase: config.colorBase,
        colorActive: config.colorActive
      }
    }).filter(Boolean) as Array<{
      id: string
      component: string
      name: string
      icon: React.ReactNode
      colorBase: string
      colorActive: string
    }>

    return tabs
  }, [clienti])

  // Prepara le tab per DrawerTabStrip
  const drawerTabs = useMemo<DrawerTabItem[]>(() => {
    // ✅ Ottieni i documenti da window.__archiveData per contare i documenti per comparto
    const archiveData = (window as any).__archiveData
    const documenti: Array<{ compartoId?: string }> = archiveData?.documenti || []

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
      const drawerColor = colorFor(comparto.chiave as DrawerType)

      // ✅ Conta i documenti per questo comparto
      const documentCount = documenti.filter(doc => doc.compartoId === comparto.id).length

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
    console.log('[DOCK-V3] DrawerTabs computed:', tabs, 'from comparti:', comparti)
    return tabs
  }, [comparti, drawerPanelsUpdateTrigger, documentsUpdateTrigger]) // ✅ Aggiungi trigger per forzare re-calcolo quando i pannelli o i documenti cambiano

  // ✅ Wrapper per il contenuto dei pannelli: inietta overlay durante il drag
  const PanelContentWrapper = ({ children }: { children: React.ReactNode }) => {
    // ✅ Usa dragModeTrigger per forzare re-render quando cambia
    const _ = dragModeTrigger // ✅ Leggi per forzare dipendenza e re-render
    const isDragActive = isDragActiveRef.current
    return (
      <div className="relative w-full h-full">
        {children}
        {isDragActive && (
          <div
            className="absolute inset-0 z-50"
            style={{
              // ✅ Cambia a 'none' per NON intercettare eventi - lascia che Dockview gestisca tutto
              pointerEvents: 'none',
              background: 'transparent'
            }}
            // ✅ RIMOSSI onDrop e onDragOver - non devono intercettare nulla
            // L'overlay serve solo come placeholder visivo, non per intercettare eventi
          />
        )}
      </div>
    )
  }

  // Factory per i componenti Dockview
  const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = useMemo(() => {
    const registerToggle = (id: string, fn: () => void) => {
      fullscreenTogglesRef.current.set(id, fn)
    }

    const forceRerender = () => {
      setFullscreenTrigger(prev => prev + 1)
    }

    const forceTabUpdate = (panelId: string) => {
      // Dockview gestisce automaticamente gli aggiornamenti
    }

    return {
      'explorer': (props: IDockviewPanelProps) => {
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
              <div className="w-full h-full overflow-hidden bg-white">
                {renderExplorer ? renderExplorer() : <div>Explorer non disponibile</div>}
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
              <div className="w-full h-full overflow-hidden bg-white">
                <CaseOverviewDiagram praticaId={praticaId || ''} />
              </div>
            </PanelContentWrapper>
          </PanelWithFullscreenToggle>
        )
      },
      'persons': (props: IDockviewPanelProps) => {
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderPersons ? renderPersons() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'contacts': (props: IDockviewPanelProps) => {
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderContacts ? renderContacts() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'ids': (props: IDockviewPanelProps) => {
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderIds ? renderIds() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'events': (props: IDockviewPanelProps) => {
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderEvents ? renderEvents() : null}
            </div>
          </PanelContentWrapper>
        )
      },
      'cliente-memoria': (props: IDockviewPanelProps<{ clienteId?: string }>) => {
        const clienteId = props.params?.clienteId || props.api.id.replace('cliente-', '').replace('-tab', '').split('-')[0]
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderClienteMemoria && clienteId ? renderClienteMemoria(clienteId) : <div>Cliente non trovato</div>}
            </div>
          </PanelContentWrapper>
        )
      },
      'drawer-content': (props: IDockviewPanelProps<{ drawerId?: string; drawerKey?: string; drawerTitle?: string }>) => {
        const drawerId = props.params?.drawerId || props.api.id.replace('drawer-', '')
        const drawerTitle = props.params?.drawerTitle || props.api.title || 'Cassetto'
        // ✅ Trova il comparto per ottenere i dati completi
        const comparto = comparti.find(c => c.id === drawerId)
        console.log('[DOCK-V3] Rendering drawer-content', {
          panelId: props.api.id,
          paramsDrawerId: props.params?.drawerId,
          extractedDrawerId: drawerId,
          drawerTitle,
          compartoFound: !!comparto,
          compartoId: comparto?.id,
          compartiTotali: comparti.length,
          compartiIds: comparti.map(c => c.id)
        })
        return (
          <PanelContentWrapper>
            <div
              className="w-full h-full overflow-auto bg-white"
              onDragOver={(e) => {
                // ✅ Se è un file Explorer, permettere il drop anche qui (fallback)
                if (e.dataTransfer.types.includes('application/x-explorer-file')) {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDrop={(e) => {
                // ✅ Se è un file Explorer, NON intercettare qui - lascia che arrivi a DocumentCollection
                if (e.dataTransfer.types.includes('application/x-explorer-file')) {
                  // Non fare preventDefault qui - lascia propagare a DocumentCollection
                  return
                }
              }}
            >
              <DrawerViewer
                id={drawerId} // ✅ Questo ID viene passato come compartoId a DocumentCollection
                title={drawerTitle}
                type={comparto?.chiave as DrawerType}
              />
            </div>
          </PanelContentWrapper>
        )
      },
      'doc': (props: IDockviewPanelProps<{ docId?: string }>) => {
        const docId = props.params?.docId || props.api.id.replace('doc-', '')
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white">
              {renderDoc ? renderDoc(docId) : <div>Documento non disponibile</div>}
            </div>
          </PanelContentWrapper>
        )
      },
      'tmpdoc': (props: IDockviewPanelProps<{ meta?: any }>) => {
        const meta = props.params?.meta || {}
        return (
          <PanelContentWrapper>
            <div className="w-full h-full overflow-auto bg-white p-4">
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
  }, [renderExplorer, renderPersons, renderContacts, renderIds, renderEvents, renderClienteMemoria, renderDoc, praticaId, fullscreenTrigger, dragModeTrigger])

  // ✅ Componente tab personalizzato con icone e colori (stesso aspetto di V2)
  const defaultTabComponent = useCallback((props: IDockviewPanelHeaderProps) => {
    // Debug: verifica struttura props
    console.log('[TAB-COMPONENT] Props:', {
      id: props.api.id,
      title: props.api.title,
      group: props.api.group?.id,
      model: props.api.group?.model
    })

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

    console.log('[TAB-COMPONENT] Component found:', component, 'Panel:', panel)

    // ✅ Verifica se il pannello è closeable (dal panel object o default true)
    const isCloseable = panel?.closeable ?? true

    const isActive = props.api.group?.model?.activePanel?.id === tabId

    // ✅ Tab drawer-content - layout verticale come nell'immagine (numero in alto, icona e testo sotto)
    if (component === 'drawer-content') {
      const drawerId = panel?.params?.drawerId || panel?.params?.drawerKey || tabId.replace('drawer-', '')

      // ✅ Usa prima i dati salvati nei params (disponibili immediatamente anche se comparti non sono ancora caricati)
      let drawerNumber = panel?.params?.drawerNumber
      let drawerColor = panel?.params?.drawerColor || '#f59e0b'
      let drawerIcon = panel?.params?.drawerIcon || '📁'

      // ✅ Se i comparti sono ora disponibili, aggiorna con i dati più recenti
      const comparto = comparti.find(c => c.id === drawerId)
      if (comparto) {
        drawerNumber = comparti.findIndex(c => c.id === drawerId) + 1
        drawerColor = colorFor(comparto.chiave as DrawerType)
        drawerIcon = comparto.icona || '📁'
      }

      // ✅ Layout orizzontale come in V2: numero e icona affiancati, poi testo
      const tabParts: React.ReactNode[] = []

      // Numero
      if (drawerNumber !== undefined) {
        tabParts.push(
          <span key="number" style={{
            marginRight: '4px',
            fontWeight: 600,
            color: drawerColor,
            fontSize: '13px'
          }}>
            {drawerNumber}
          </span>
        )
      }

      // Icona
      if (drawerIcon) {
        if (React.isValidElement(drawerIcon)) {
          tabParts.push(
            <span key="icon" style={{
              marginRight: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              color: drawerColor
            }}>
              {React.cloneElement(drawerIcon as any, { size: 14 })}
            </span>
          )
        } else if (typeof drawerIcon === 'string') {
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
        }
      }

      // ✅ Renderizza con layout orizzontale (numero + icona + testo) come in V2
      return (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          width: '100%'
        }}>
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
                fontSize: '16px',
                lineHeight: 1,
                color: '#666',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb'
                e.currentTarget.style.color = '#000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
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
                fontSize: '16px',
                lineHeight: 1,
                color: '#666',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb'
                e.currentTarget.style.color = '#000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </div>
      )
    }

    // ✅ Tab documenti normali
    if (component === 'doc') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <FileText size={18} style={{ color: '#64748b', opacity: isActive ? 1 : 0.4 }} />
          <span style={{ opacity: isActive ? 1 : 0.4, flex: 1 }}>{props.api.title}</span>
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
                e.currentTarget.style.background = '#e5e7eb'
                e.currentTarget.style.color = '#000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
        </div>
      )
    }

    // ✅ Tab con configurazione (explorer, graph, persons, etc.)
    const config = TAB_CONFIGS[component]
    if (config) {
      const Icon = config.icon
      const color = isActive ? config.colorActive : config.colorBase
      const opacity = isActive ? 1 : 0.4

      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: color,
          opacity: opacity,
          transition: 'opacity 0.3s ease, color 0.3s ease',
          width: '100%'
        }}>
          <Icon
            size={18}
            strokeWidth={2.5}
            fill="none"
            style={{
              color: color,
              stroke: color,
              opacity: opacity,
              transition: 'opacity 0.3s ease, color 0.3s ease, stroke 0.3s ease'
            }}
          />
          <span style={{
            fontWeight: isActive ? 700 : 400,
            transition: 'font-weight 0.3s ease',
            flex: 1
          }}>
            {props.api.title}
          </span>
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
                e.currentTarget.style.background = '#e5e7eb'
                e.currentTarget.style.color = '#000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
              }}
              title="Chiudi"
            >
              ×
            </button>
          )}
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
              e.currentTarget.style.background = '#e5e7eb'
              e.currentTarget.style.color = '#000'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#666'
            }}
            title="Chiudi"
          >
            ×
          </button>
        )}
      </div>
    )
  }, [drawerTabs, comparti, dockviewApiRef])

  // Handler per quando Dockview è pronto
  const onReady = useCallback((event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api

    // Carica layout salvato
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const layout = JSON.parse(saved)
        event.api.fromJSON(layout)
      }
    } catch (err) {
      console.error('[DOCK-V3] Errore caricamento layout:', err)
    }

    // ✅ Funzione helper per sbloccare tutti i gruppi
    const unlockAllGroups = () => {
      const groups = event.api.groups
      console.log('[DOCK-V3] 🔓 Sblocco gruppi. Totale gruppi:', groups.length)
      groups.forEach((group, index) => {
        const wasLocked = group.locked
        if (group.locked) {
          group.locked = false
          console.log(`[DOCK-V3] 🔓 Gruppo ${index} (${group.id}) sbloccato. Era locked:`, wasLocked)
        } else {
          console.log(`[DOCK-V3] ✅ Gruppo ${index} (${group.id}) già sbloccato`)
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
      setDrawerPanelsUpdateTrigger(prev => prev + 1) // ✅ Aggiorna trigger quando viene aggiunto un pannello
    })

    // ✅ Listener per quando viene rimosso un pannello
    const disposablePanelsRemove = event.api.onDidRemovePanel(() => {
      setDrawerPanelsUpdateTrigger(prev => prev + 1) // ✅ Aggiorna trigger quando viene rimosso un pannello
    })

    // ✅ Verifica metodi disponibili sull'API per debug
    const apiMethods = Object.keys(event.api).filter(key => key.startsWith('on'))
    console.log('[DOCK-V3] 🔍 API methods disponibili:', {
      hasOnWillDragPanel: typeof event.api.onWillDragPanel === 'function',
      hasOnWillDrop: typeof event.api.onWillDrop === 'function',
      hasOnDidMovePanel: typeof event.api.onDidMovePanel === 'function',
      hasOnDidActivePanelChange: typeof event.api.onDidActivePanelChange === 'function',
      apiKeys: apiMethods
    })

    // ✅ Log completo di tutti i metodi on* disponibili
    console.log('[DOCK-V3] 🔍 Tutti i metodi on*:', apiMethods)

    // ✅ Traccia la posizione dei pannelli prima del drag per confrontare dopo
    // ✅ Usa un oggetto ref-like per isDragging (non possiamo usare useRef dentro un callback)
    const dragState = { isDragging: false }
    let panelPositionsBeforeDrag = new Map<string, string>()

    // ✅ Listener GLOBALE per drop - SEMPRE attivo per intercettare TUTTI i drop
    const globalDropHandler = (e: DragEvent) => {
      // ✅ Se è un file Explorer, NON intercettare - lascia che arrivi a DocumentCollection
      if (e.dataTransfer?.types.includes('application/x-explorer-file')) {
        console.log('[DOCK-V3] 🌐 GLOBAL DROP - File Explorer rilevato, lascio propagare a DocumentCollection')
        return // Non fare nulla, lascia propagare
      }

      // ✅ Log SEMPRE per vedere se il drop viene chiamato (solo per drag Dockview)
      console.log('[DOCK-V3] 🌐 GLOBAL DROP - Target:', e.target, 'Default prevented:', e.defaultPrevented)
      console.log('[DOCK-V3] 🌐 GLOBAL DROP - dropEffect:', e.dataTransfer?.dropEffect)
      console.log('[DOCK-V3] 🌐 GLOBAL DROP - isDragging:', dragState.isDragging)

      // ✅ Se è un drag di Dockview, verifica se il target è un'area valida
      if (dragState.isDragging) {
        const target = e.target as HTMLElement

        // ✅ Verifica se il target è dentro Dockview (cerca elementi con classi Dockview)
        const dockviewContainer = target.closest('.dockview-react')
        const isDockviewArea = dockviewContainer !== null

        // ✅ Verifica se il target è un elemento interno del pannello (non un'area di drop valida)
        const isInternalElement = target.closest('[data-component]') !== null &&
                                  !target.closest('.dv-tabs-and-actions-container') &&
                                  !target.closest('.dv-group-view')

        console.log('[DOCK-V3] 🌐 GLOBAL DROP - isDockviewArea:', isDockviewArea, 'isInternalElement:', isInternalElement)
        console.log('[DOCK-V3] 🌐 GLOBAL DROP - Target classes:', target.className)
        console.log('[DOCK-V3] 🌐 GLOBAL DROP - Target data-component:', target.getAttribute('data-component'))

        // ✅ Se è un elemento interno, Dockview non gestisce il drop
        // Il problema è che pointer-events: none non blocca gli eventi di drag and drop
        // Quindi dobbiamo assicurarci che il drop avvenga su un'area valida
        // Per ora, non facciamo nulla - Dockview ignorerà il drop su elementi interni
        // e il pannello rimarrà nella posizione originale
        if (isInternalElement) {
          console.log('[DOCK-V3] ⚠️ GLOBAL DROP - Drop su elemento interno. Dockview non gestisce il drop su elementi interni.')
          console.log('[DOCK-V3] ⚠️ GLOBAL DROP - Il pannello rimarrà nella posizione originale.')
          // ✅ NON fare preventDefault - lasciamo che Dockview gestisca comunque
          // Anche se Dockview non gestisce il drop su elementi interni, potrebbe comunque
          // gestirlo se l'evento raggiunge un'area valida durante la propagazione
        }
      }
    }

    // ✅ Listener GLOBALE per dragover - SEMPRE attivo
    const globalDragOverHandler = (e: DragEvent) => {
      // ✅ Se è un file Explorer, NON intercettare - lascia che arrivi a DocumentCollection
      if (e.dataTransfer?.types.includes('application/x-explorer-file')) {
        return // Non fare nulla, lascia propagare
      }

      // ✅ Se è un drag di Dockview, NON mostrare overlay - Dockview gestisce tutto
      if (dragState.isDragging) {
        // ✅ NON abilitare drag mode per drag di pannelli Dockview
        // L'overlay serve solo per drag di elementi DENTRO i pannelli (es. documenti), non per drag dei pannelli stessi

        const target = e.target as HTMLElement

        // ✅ Verifica se il target è dentro Dockview
        const isDockviewArea = target.closest('.dockview-react') ||
                                target.closest('.dv-group-view') ||
                                target.closest('.dv-tabs-and-actions-container') ||
                                target.closest('[class*="dockview"]')

        // ✅ Se è un'area Dockview valida, imposta dropEffect
        if (isDockviewArea && e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move'
        } else if (e.dataTransfer) {
          // ✅ Anche se non è un'area Dockview, prova a permettere il drop
          // Dockview potrebbe gestirlo comunque se è un'area valida internamente
          e.dataTransfer.dropEffect = 'move'
        }
        // ✅ NON fare preventDefault qui - Dockview lo gestisce
        return // ✅ Esci subito per non interferire
      }
    }

    // ✅ Listener GLOBALE per dragend - SEMPRE attivo
    const globalDragEndHandler = (e: DragEvent) => {
      console.log('[DOCK-V3] 🏁 GLOBAL DRAG END - dropEffect:', e.dataTransfer?.dropEffect)
      console.log('[DOCK-V3] 🏁 GLOBAL DRAG END - isDragging:', dragState.isDragging)

      if (dragState.isDragging) {
        console.log('[DOCK-V3] 🏁 GLOBAL DRAG END - Drag di Dockview terminato')
        dragState.isDragging = false
        disableDragMode() // ✅ Disabilita drag mode quando il drag finisce
      }
    }

    // ✅ Aggiungi listener globali PRIMA di tutto, sempre attivi
    document.addEventListener('drop', globalDropHandler, { capture: true, passive: false })
    document.addEventListener('dragover', globalDragOverHandler, { capture: true, passive: false })
    document.addEventListener('dragend', globalDragEndHandler, { capture: true })

    // ✅ Cleanup per listener globali
    const cleanupGlobalListeners = () => {
      document.removeEventListener('drop', globalDropHandler, { capture: true })
      document.removeEventListener('dragover', globalDragOverHandler, { capture: true })
      document.removeEventListener('dragend', globalDragEndHandler, { capture: true })
    }

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
        disposableDidMove = event.api.onDidMovePanel((event: any) => {
          console.log('[DOCK-V3] ✅ PANNELLO SPOSTATO - Pannello:', event.panel?.id, 'Da gruppo:', event.from?.group?.id, 'A gruppo:', event.to?.group?.id)
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

    // ✅ Listener alternativo: monitora tutti i cambiamenti di layout (potrebbe catturare gli spostamenti)
    let layoutChangeCount = 0
    const disposableLayoutChange = event.api.onDidLayoutChange(() => {
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

    // Salva layout quando cambia
    const disposableLayout = event.api.onDidLayoutChange(() => {
      try {
        const layout = event.api.toJSON()
        localStorage.setItem(storageKey, JSON.stringify(layout))
      } catch (err) {
        console.error('[DOCK-V3] Errore salvataggio layout:', err)
      }
    })

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      cleanupGlobalListeners() // ✅ Cleanup listener globali
      disposableGroups.dispose()
      disposablePanels.dispose()
      if (disposablePanelsRemove) disposablePanelsRemove.dispose()
      if (disposableWillDrag) disposableWillDrag.dispose()
      if (disposableWillDrop) disposableWillDrop.dispose()
      if (disposableDidMove) disposableDidMove.dispose()
      disposableLayoutChange.dispose()
      disposableLayout.dispose()
    }
  }, [storageKey, enableDragMode, disableDragMode])

  // Handler per click su drawer tab
  const handleDrawerTabClick = useCallback((drawerKey: string, drawerId: string) => {
    if (!dockviewApiRef.current) return

    const panelId = `drawer-${drawerId}`
    const existingPanel = dockviewApiRef.current.getPanel(panelId)

    if (existingPanel) {
      dockviewApiRef.current.setActivePanel(existingPanel)
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
            drawerColor: comparto ? colorFor(comparto.chiave as DrawerType) : '#f59e0b',
            drawerIcon: comparto?.icona || '📁'
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

  // Handler per click su archive tab (sidebar)
  const handleArchiveTabClick = useCallback((component: string, tabId: string) => {
    if (!dockviewApiRef.current) return

    const panelId = tabId
    const existingPanel = dockviewApiRef.current.getPanel(panelId)

    if (existingPanel) {
      dockviewApiRef.current.setActivePanel(existingPanel)
    } else {
      // Crea nuovo pannello nella zona left
      let panelComponent = component
      let params: any = {}

      if (component === 'cliente-memoria') {
        const clienteId = tabId.replace('cliente-', '').replace('-tab', '')
        panelComponent = 'cliente-memoria'
        params = { clienteId }
      }

      const newPanel = dockviewApiRef.current.addPanel({
        id: panelId,
        component: panelComponent,
        params: {
          ...params,
          component: panelComponent // ✅ Aggiungi component nei params
        },
        title: archiveTabs.find(t => t.id === tabId)?.name || component,
        closeable: true // ✅ Abilita pulsante close sulla tab
      })
      console.log('[DOCK-V3] ➕ Pannello archivio creato:', panelId, 'Component:', panelComponent, 'Gruppo:', newPanel?.group?.id, 'Gruppo locked:', newPanel?.group?.locked)
      // ✅ Assicura che il gruppo del pannello non sia bloccato per permettere drag and drop
      if (newPanel?.group?.locked) {
        newPanel.group.locked = false
        console.log('[DOCK-V3] 🔓 Gruppo archivio sbloccato:', newPanel.group.id)
      }
    }

    if (onLeftBorderTabChange) {
      onLeftBorderTabChange(component)
    }
  }, [archiveTabs, onLeftBorderTabChange])

  // Expose API methods
  useImperativeHandle(ref, () => ({
    openDoc: (doc: DocTab) => {
      if (!dockviewApiRef.current) return

      const panelId = `doc-${doc.id}`
      const existingPanel = dockviewApiRef.current.getPanel(panelId)

      if (existingPanel) {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else {
        const newPanel = dockviewApiRef.current.addPanel({
          id: panelId,
          component: 'doc',
          params: {
            component: 'doc', // ✅ Aggiungi component nei params
            docId: doc.id
          },
          title: doc.title,
          closeable: true // ✅ Abilita pulsante close sulla tab
        })
        // ✅ Assicura che il gruppo del pannello non sia bloccato per permettere drag and drop
        if (newPanel?.group?.locked) {
          newPanel.group.locked = false
        }
      }
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
    }
  }), [])

  return (
    <div className={`dockv3-root w-full h-full relative ${isDragActiveRef.current ? 'drag-active' : ''}`}>
      {/* Sidebar Archivi (left) */}
      {archiveTabs.length > 0 && (
        <SidebarArchivi
          tabs={archiveTabs}
          isOpen={isArchiveSidebarOpen}
          selectedId={selectedArchiveTabId}
          onSelect={(component, id) => {
            setSelectedArchiveTabId(id)
            handleArchiveTabClick(component, id)
          }}
          onToggle={() => {
            setIsArchiveSidebarOpen(prev => !prev)
            if (archiveSidebarTimeoutRef.current) {
              clearTimeout(archiveSidebarTimeoutRef.current)
              archiveSidebarTimeoutRef.current = null
            }
          }}
          onMouseEnter={() => {
            setIsArchiveSidebarOpen(true)
            if (archiveSidebarTimeoutRef.current) {
              clearTimeout(archiveSidebarTimeoutRef.current)
            }
          }}
          onMouseLeave={() => {
            archiveSidebarTimeoutRef.current = setTimeout(() => {
              setIsArchiveSidebarOpen(false)
            }, 300)
          }}
          headerHeight={headerHeight}
          isDrawerStripVisible={isDrawerStripVisible}
        />
      )}

      {/* Main Dockview Area */}
      <div
        className="w-full h-full relative transition-all duration-300"
        style={{
          paddingBottom: isDrawerStripPinned && isDrawerStripVisible ? '120px' : '0px' // ✅ Spinge su il contenuto quando fissati
        }}
      >
        <DockviewReact
          components={components}
          defaultTabComponent={defaultTabComponent}
          onReady={onReady}
          className="dockview-theme-light"
        />
      </div>

      {/* ✅ Linguetta "Cassetti" quando nascosti (Stato 1) */}
      {drawerTabs.length > 0 && !isDrawerStripVisible && (
        <div
          className="fixed bottom-0 left-1/2 transform -translate-x-1/2 z-50"
          style={{
            pointerEvents: 'auto',
          }}
          onMouseEnter={() => {
            setIsDrawerStripVisible(true)
            if (drawerStripTimeoutRef.current) {
              clearTimeout(drawerStripTimeoutRef.current)
              drawerStripTimeoutRef.current = null
            }
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-t-lg cursor-pointer transition-all"
            style={{
              background: 'rgba(241, 245, 249, 0.95)',
              border: '1px solid #cbd5e1',
              borderBottom: 'none',
              boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="text-sm font-medium text-gray-700">Cassetti</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleTogglePin()
              }}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
              title={isDrawerStripPinned ? 'Sfissa cassetti' : 'Fissa cassetti'}
            >
              {isDrawerStripPinned ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 12V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 2.21-1.79 4-4 4s-4-1.79-4-4v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 1.1.9 2 2 2s2-.9 2-2V4h2v8c0 1.1.9 2 2 2s2-.9 2-2V4h1c.55 0 1-.45 1-1s-.45-1-1-1h-1v8c0 2.21-1.79 4-4 4s-4-1.79-4-4V4h-1c-.55 0-1 .45-1 1s.45 1 1 1h1v8c0 1.1.9 2 2 2s2-.9 2-2z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V8.26a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 5.24v5.52M15 10.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V8.26a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 5.24v5.52"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Drawer Tab Strip (bottom) - Stati 2 e 3 */}
      {drawerTabs.length > 0 && isDrawerStripVisible && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${
            isDrawerStripVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
          onMouseEnter={handleDrawerStripMouseEnter}
          onMouseLeave={handleDrawerStripMouseLeave}
        >
          {/* ✅ Pulsante PIN in alto a destra sopra i cassetti (sempre visibile quando i cassetti sono aperti) */}
          <div
            className="absolute top-0 right-0 z-10"
            style={{
              transform: 'translateY(-100%)',
              marginTop: '4px',
              marginRight: '4px'
            }}
          >
            <button
              onClick={handleTogglePin}
              className="p-2 rounded-lg bg-white/90 hover:bg-white border border-gray-300 shadow-md transition-all"
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
          />
        </div>
      )}
    </div>
  )
}

export const DockWorkspaceV3 = forwardRef<DockWorkspaceV3Handle, Props>(DockWorkspaceV3Component)

