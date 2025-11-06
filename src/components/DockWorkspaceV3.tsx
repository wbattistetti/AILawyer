import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
import { DrawerTabStrip, DrawerTabItem } from '../features/drawers/DrawerTabStrip'
import { SidebarArchivi } from './SidebarArchivi'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText, FolderOpen, Search, User, CreditCard, Calendar, Network, Mail, Image } from 'lucide-react'
import type { Comparto } from '@/types'
import { api } from '@/lib/api'
import type { DrawerType } from '../features/drawers/types'
import './DockWorkspaceV3.css'

type DocTab = { id: string; title: string }

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
  registerToggle: (id: string, fn: () => void) => void
  setFullscreenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>
  forceRerender: () => void
  forceTabUpdate: (panelId: string) => void
}> = ({ children, component, panelId, registerToggle, setFullscreenStates, forceRerender, forceTabUpdate }) => {
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

  useEffect(() => {
    registerToggle(panelId, () => {
      setIsFullscreen(prev => !prev)
    })
  }, [panelId, registerToggle])

  if (!supportsFullscreen) {
    return <>{children}</>
  }

  return (
    <div className="w-full h-full relative">
      {children}
      <button
        className="absolute top-2 right-2 z-50 p-1 rounded bg-orange-500 text-white hover:bg-orange-600"
        onClick={() => setIsFullscreen(prev => !prev)}
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
    api.get<Comparto[]>(`/pratiche/${praticaId}/comparti`).then(res => {
      setComparti(res.data || [])
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

    const clienteTabs = clienti.map(cliente => ({
      type: 'tab',
      name: `${cliente.nome} ${cliente.cognome}`,
      component: 'cliente-memoria',
      id: `cliente-${cliente.id}-tab`
    }))

    const clienteTabsSorted = [...clienteTabs].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim()
      const nameB = (b.name || '').toLowerCase().trim()
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
    })

    const staticTabsSorted = [...staticTabs].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim()
      const nameB = (b.name || '').toLowerCase().trim()
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
    })

    return [...clienteTabsSorted, ...staticTabsSorted]
  }, [clienti])

  // Prepara le tab per DrawerTabStrip
  const drawerTabs = useMemo<DrawerTabItem[]>(() => {
    return comparti.map(comparto => ({
      id: comparto.id,
      label: comparto.nome,
      icon: comparto.icona || '📁',
      key: comparto.chiave as DrawerType
    }))
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
            registerToggle={registerToggle}
            setFullscreenStates={setFullscreenStates}
            forceRerender={forceRerender}
            forceTabUpdate={forceTabUpdate}
          >
            {renderExplorer ? renderExplorer() : <div>Explorer non disponibile</div>}
          </PanelWithFullscreenToggle>
        )
      },
      'graph': (props: IDockviewPanelProps) => {
        return (
          <PanelWithFullscreenToggle
            component="graph"
            panelId={props.api.id}
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
        return (
          <div className="w-full h-full overflow-auto bg-white">
            <DrawerViewer compartoId={drawerId} />
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
      dockviewApiRef.current.addPanel({
        id: panelId,
        component: 'drawer-content',
        params: {
          drawerId: drawerId,
          drawerKey: drawerKey,
          drawerTitle: comparto?.nome || 'Drawer'
        },
        title: comparto?.nome || 'Drawer'
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
        params,
        title: archiveTabs.find(t => t.id === tabId)?.name || component
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
          params: { docId: doc.id },
          title: doc.title
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
          params: { meta },
          title: meta.title
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
          selectedTabId={selectedArchiveTabId}
          onTabClick={(tab) => {
            setSelectedArchiveTabId(tab.id)
            handleArchiveTabClick(tab.component, tab.id)
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
        />
      )}

      {/* Main Dockview Area */}
      <div className="w-full h-full" style={{ marginLeft: isArchiveSidebarOpen ? '200px' : '0', transition: 'margin-left 0.3s' }}>
        <DockviewReact
          components={components}
          onReady={onReady}
          className="dockview-theme-light"
        />
      </div>

      {/* Drawer Tab Strip (bottom) */}
      {drawerTabs.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ marginLeft: isArchiveSidebarOpen ? '200px' : '0', transition: 'margin-left 0.3s' }}
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
            tabs={drawerTabs}
            onTabClick={(tab) => {
              const comparto = comparti.find(c => c.id === tab.id)
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

