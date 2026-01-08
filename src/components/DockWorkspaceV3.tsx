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

  // State per la sidebar archivi
  const [isArchiveSidebarOpen, setIsArchiveSidebarOpen] = useState(false)
  const [selectedArchiveTabId, setSelectedArchiveTabId] = useState<string | null>(null)
  const archiveSidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const drawerStripTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
    const tabs = comparti.map(comparto => {
      const IconComponent = iconFor(comparto.nome)
      const drawerColor = colorFor(comparto.chiave as DrawerType)
      // ✅ NON passare il colore qui - sarà gestito da DrawerTabStrip
      return {
        id: comparto.id,
        label: comparto.nome,
        icon: <IconComponent size={24} />, // ✅ Icona senza colore, sarà colorata da DrawerTabStrip
        color: drawerColor,
        type: comparto.chiave as DrawerType
      }
    })
    console.log('[DOCK-V3] DrawerTabs computed:', tabs, 'from comparti:', comparti)
    return tabs
  }, [comparti])

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
            <div className="w-full h-full overflow-hidden bg-white">
              {renderExplorer ? renderExplorer() : <div>Explorer non disponibile</div>}
            </div>
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
            <div className="w-full h-full overflow-hidden bg-white">
              <CaseOverviewDiagram praticaId={praticaId || ''} />
            </div>
          </PanelWithFullscreenToggle>
        )
      },
      'persons': (props: IDockviewPanelProps) => {
        return <div className="w-full h-full overflow-auto bg-white">{renderPersons ? renderPersons() : null}</div>
      },
      'contacts': (props: IDockviewPanelProps) => {
        return <div className="w-full h-full overflow-auto bg-white">{renderContacts ? renderContacts() : null}</div>
      },
      'ids': (props: IDockviewPanelProps) => {
        return <div className="w-full h-full overflow-auto bg-white">{renderIds ? renderIds() : null}</div>
      },
      'events': (props: IDockviewPanelProps) => {
        return <div className="w-full h-full overflow-auto bg-white">{renderEvents ? renderEvents() : null}</div>
      },
      'cliente-memoria': (props: IDockviewPanelProps<{ clienteId?: string }>) => {
        const clienteId = props.params?.clienteId || props.api.id.replace('cliente-', '').replace('-tab', '').split('-')[0]
        return (
          <div className="w-full h-full overflow-auto bg-white">
            {renderClienteMemoria && clienteId ? renderClienteMemoria(clienteId) : <div>Cliente non trovato</div>}
          </div>
        )
      },
      'drawer-content': (props: IDockviewPanelProps<{ drawerId?: string; drawerKey?: string; drawerTitle?: string }>) => {
        const drawerId = props.params?.drawerId || props.api.id.replace('drawer-', '')
        const drawerTitle = props.params?.drawerTitle || props.api.title || 'Cassetto'
        // ✅ Trova il comparto per ottenere i dati completi
        const comparto = comparti.find(c => c.id === drawerId)
        return (
          <div className="w-full h-full overflow-auto bg-white">
            <DrawerViewer
              id={drawerId}
              title={drawerTitle}
              type={comparto?.chiave as DrawerType}
            />
          </div>
        )
      },
      'doc': (props: IDockviewPanelProps<{ docId?: string }>) => {
        const docId = props.params?.docId || props.api.id.replace('doc-', '')
        return (
          <div className="w-full h-full overflow-auto bg-white">
            {renderDoc ? renderDoc(docId) : <div>Documento non disponibile</div>}
          </div>
        )
      },
      'tmpdoc': (props: IDockviewPanelProps<{ meta?: any }>) => {
        const meta = props.params?.meta || {}
        return (
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
        )
      }
    }
  }, [renderExplorer, renderPersons, renderContacts, renderIds, renderEvents, renderClienteMemoria, renderDoc, praticaId, fullscreenTrigger])

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

    // Salva layout quando cambia
    const disposable = event.api.onDidLayoutChange(() => {
      try {
        const layout = event.api.toJSON()
        localStorage.setItem(storageKey, JSON.stringify(layout))
      } catch (err) {
        console.error('[DOCK-V3] Errore salvataggio layout:', err)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [storageKey])

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

        dockviewApiRef.current.addPanel({
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

      dockviewApiRef.current.addPanel({
        id: panelId,
        component: panelComponent,
        params: {
          ...params,
          component: panelComponent // ✅ Aggiungi component nei params
        },
        title: archiveTabs.find(t => t.id === tabId)?.name || component,
        closeable: true // ✅ Abilita pulsante close sulla tab
      })
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
        dockviewApiRef.current.addPanel({
          id: panelId,
          component: 'doc',
          params: {
            component: 'doc', // ✅ Aggiungi component nei params
            docId: doc.id
          },
          title: doc.title,
          closeable: true // ✅ Abilita pulsante close sulla tab
        })
      }
    },
    openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => {
      if (!dockviewApiRef.current) return

      const panelId = `tmpdoc-${meta.id}`
      const existingPanel = dockviewApiRef.current.getPanel(panelId)

      if (existingPanel) {
        dockviewApiRef.current.setActivePanel(existingPanel)
      } else {
        dockviewApiRef.current.addPanel({
          id: panelId,
          component: 'tmpdoc',
          params: {
            component: 'tmpdoc', // ✅ Aggiungi component nei params
            meta
          },
          title: meta.title || 'Documento temporaneo',
          closeable: true // ✅ Abilita pulsante close sulla tab
        })
      }
    }
  }), [])

  return (
    <div className="dockv3-root w-full h-full relative">
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
      <div className="w-full h-full">
        <DockviewReact
          components={components}
          defaultTabComponent={defaultTabComponent}
          onReady={onReady}
          className="dockview-theme-light"
        />
      </div>

      {/* Drawer Tab Strip (bottom) */}
      {drawerTabs.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50"
          onMouseEnter={() => {
            setIsDrawerStripVisible(true)
            if (drawerStripTimeoutRef.current) {
              clearTimeout(drawerStripTimeoutRef.current)
            }
          }}
          onMouseLeave={() => {
            drawerStripTimeoutRef.current = setTimeout(() => {
              setIsDrawerStripVisible(false)
            }, 300)
          }}
        >
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

