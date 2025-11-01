import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Layout, Model, TabNode, IJsonModel, Actions } from 'flexlayout-react'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
// baselineGraph removed - no longer needed
import 'flexlayout-react/style/light.css'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText, FolderOpen, Archive, Search, User, CreditCard, Calendar, Network } from 'lucide-react'
// import type { Comparto } from '@/types' // Removed unused import
import './DockWorkspaceV2.css'

type DocTab = { id: string; title: string }

// ✅ STEP 4: Componente wrapper per pannelli con fullscreen toggle
const PanelWithFullscreenToggle: React.FC<{
  children: React.ReactNode
  component: string
  tabId: string
  registerToggle: (id: string, fn: () => void) => void
  setFullscreenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>
  forceRerender: () => void
  forceTabUpdate: (tabId: string) => void
}> = ({ children, component, tabId, registerToggle, setFullscreenStates, forceRerender, forceTabUpdate }) => {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Pannelli che supportano fullscreen toggle
  const supportsFullscreen = ['explorer', 'graph'].includes(component)

  // console.log('[FULLSCREEN-TOGGLE] Rendering component:', component, 'supportsFullscreen:', supportsFullscreen)

  if (!supportsFullscreen) {
    // console.log('[FULLSCREEN-TOGGLE] ❌ Component does not support fullscreen')
    return <>{children}</>
  }

  // console.log('[FULLSCREEN-TOGGLE] ✅ Rendering fullscreen button for component:', component)

  // ✅ Sincronizza lo stato fullscreen con lo state globale per aggiornare l'icona del pulsante
  useEffect(() => {
    setFullscreenStates(prev => {
      const newMap = new Map(prev)
      newMap.set(tabId, isFullscreen)
      return newMap
    })
    // console.log('[FULLSCREEN-TOGGLE] State updated for tabId:', tabId, 'isFullscreen:', isFullscreen)
    // Forza re-render del layout per aggiornare l'icona del pulsante
    forceRerender()
    // Forza aggiornamento della tab specifica
    forceTabUpdate(tabId)
  }, [isFullscreen, tabId, setFullscreenStates, forceRerender, forceTabUpdate])

  // Registra un toggle imperativo per il bottone nell'header
  useEffect(() => {
    const toggle = () => {
      // console.log('[FULLSCREEN-TOGGLE] Toggle called for tabId:', tabId, 'current state:', isFullscreen)
      setIsFullscreen((prev) => !prev)
    }
    registerToggle(tabId, toggle)
    return () => registerToggle(tabId, () => { })
  }, [registerToggle, tabId, isFullscreen])

  return (
    <div className="relative w-full h-full">
      {/* Contenuto del pannello */}
      <div className={isFullscreen ? 'fixed inset-0 z-40 bg-white' : 'w-full h-full'}>
        {children}
      </div>
    </div>
  )
}

// ✅ STEP 2: Tipi di comportamento per i pannelli
type PanelBehavior = 'fullscreen' | 'dockable' | 'document' | 'overlay'

// ✅ STEP 4: Mappatura comportamenti per componente (tutti dockable con fullscreen toggle)
const PANEL_BEHAVIORS: Record<string, PanelBehavior> = {
  // Pannelli dockable con fullscreen toggle (Explorer, Grafo)
  'explorer': 'dockable',
  'graph': 'dockable',

  // Pannelli dockable normali (trascinabili e ridimensionabili nel canvas)
  'archive': 'dockable',
  'persons': 'dockable',
  'contacts': 'dockable',
  'ids': 'dockable',
  'events': 'dockable',

  // ✅ Tab cliente memoria sono dockable
  'cliente-memoria': 'dockable',

  // Documenti (si aprono come tab nel canvas)
  'doc': 'document',
  'tmpdoc': 'document',

  // Overlay (si aprono sopra il contenuto)
  'drawer': 'overlay'
}

// ✅ Mappatura colori e icone per ogni tipo di tab
type TabConfig = {
  icon: React.ComponentType<any> // Lucide icons possono avere props aggiuntive come strokeWidth, fill, style
  colorBase: string // Colore base (usato quando tab è chiusa - spento)
  colorActive: string // Colore attivo (usato quando tab è aperta - vivace)
}

const TAB_CONFIGS: Record<string, TabConfig> = {
  'explorer': {
    icon: FolderOpen,
    colorBase: '#93c5fd', // blue-300 spento
    colorActive: '#3b82f6' // blue-500 vivace
  },
  'archive': {
    icon: Archive,
    colorBase: '#a78bfa', // violet-300 spento
    colorActive: '#8b5cf6' // violet-500 vivace
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

type Props = {
  // docs: DocTab[] // Removed unused prop
  renderArchive: () => React.ReactNode
  renderPersons?: () => React.ReactNode
  renderContacts?: () => React.ReactNode
  renderIds?: () => React.ReactNode
  renderDoc: (docId: string) => React.ReactNode
  storageKey?: string
  renderEvents?: () => React.ReactNode
  renderExplorer?: () => React.ReactNode
  // isExplorerFullscreen removed - now handled by PanelWithFullscreenToggle
  onLeftBorderTabChange?: (component: string) => void
  praticaId?: string // Aggiungi questa prop
  // Props per tab cliente
  clienti?: Array<{ id: string; nome: string; cognome: string }>
  renderClienteMemoria?: (clienteId: string) => React.ReactNode
}

export type DockWorkspaceV2Handle = {
  openDoc: (doc: DocTab) => void
  openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => void
  switchToArchive: () => void
}

function DockWorkspaceV2Component(props: Props, ref: React.Ref<DockWorkspaceV2Handle>) {
  const {
    // docs, // Removed unused prop
    renderArchive,
    renderPersons,
    renderContacts,
    renderIds,
    renderDoc,
    storageKey = 'ws_dock_v2',
    renderEvents,
    renderExplorer,
    onLeftBorderTabChange,
    praticaId,
    clienti = [],
    renderClienteMemoria
  } = props
  const LayoutAny = Layout as any
  const layoutRootRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<Model | null>(null)
  const fullscreenTogglesRef = useRef<Map<string, () => void>>(new Map())

  // ✅ Traccia i pannelli dockable attivi per evidenziare le tab nella sidebar quando aperte
  const dockablePanelsRef = useRef<Map<string, { component: string; title: string; originalTabId: string; clienteId?: string }>>(new Map())

  // ✅ Ref per forzare re-render quando cambia lo stato delle tab aperte
  const [tabsOpenState, setTabsOpenState] = useState(0)

  // ✅ Ref per salvare l'ordine originale delle tab (salvato una volta, mai ricalcolato)
  const originalTabsOrderRef = useRef<string[]>([])

  // ✅ Funzione helper per estrarre ID cliente da tabId sidebar
  const extractClienteIdFromSidebarTab = useCallback((tabId: string): string | null => {
    const match = tabId.match(/^cliente-([^-]+)-tab$/)
    return match ? match[1] : null
  }, [])

  // ✅ State globale per tracciare lo stato fullscreen di ogni componente (reattivo)
  const [fullscreenStates, setFullscreenStates] = useState<Map<string, boolean>>(new Map())
  // ✅ State per forzare re-render quando cambia lo stato fullscreen
  const [fullscreenTrigger, setFullscreenTrigger] = useState(0)

  const registerToggle = useCallback((id: string, fn: () => void) => {
    if (!id) return
    const map = fullscreenTogglesRef.current
    if (fn && fn.name !== '') map.set(id, fn)
    else map.delete(id)
  }, [])

  // ✅ Imperative handle per esporre metodi al parent
  useImperativeHandle(ref, () => ({
    openDoc: (doc: DocTab) => {
      // console.log('[IMPERATIVE] openDoc called:', doc)
      // Implementazione per aprire documento
    },
    openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => {
      console.log('[IMPERATIVE] openTmpDoc called:', meta)
      // Implementazione per aprire documento temporaneo
    },
    switchToArchive: () => {
      console.log('[IMPERATIVE] switchToArchive called')
      // Implementazione per passare all'archivio
    }
  }), [])

  // ✅ Funzione per forzare aggiornamento tab specifica
  const forceTabUpdate = useCallback((tabId: string) => {
    if (!modelRef.current) return
    const node = modelRef.current.getNodeById(tabId)
    if (node) {
      console.log('[FORCE-TAB-UPDATE] Updating tab:', tabId)
      modelRef.current.doAction(
        Actions.updateNodeAttributes(tabId, { name: node.getName() })
      )
    }
  }, [])

  // ✅ Funzione per forzare re-render quando cambia lo stato fullscreen
  const forceRerender = useCallback(() => {
    console.log('[FORCE-RERENDER] Triggering re-render for fullscreen state change')
    setFullscreenTrigger(prev => prev + 1)
  }, [])

  const initial: IJsonModel = useMemo(() => {
    // ✅ STEP 1: Reset layout per canvas vuoto - rimuovi layout persistito vecchio
    try {
      localStorage.removeItem(storageKey)
    } catch { }
    return getDefaultModelJson()
  }, [storageKey, clienti])

  const [model, setModel] = useState(() => Model.fromJson(initial))
  modelRef.current = model

  useEffect(() => {
    const json = model.toJson()
    try {
      localStorage.setItem(storageKey, JSON.stringify(json))
    } catch { }
  }, [model, storageKey])

  // Listener per aprire un cassetto in una nuova tab
  useEffect(() => {
    function onOpenDrawer(e: any) {
      const { drawerId, title, type } = (e?.detail || {}) as { drawerId: string; title?: string; type?: string }
      if (!drawerId) return
      const json = modelRef.current.toJson() as any
      let center = findById(json.layout, 'centerTabset')
      // Ensure a right side drawer panel
      let right = (json.layout.children || []).find((c: any) => c.id === 'rightTabset')
      if (!right) {
        json.layout.children = json.layout.children || []
        json.layout.children.push({ type: 'tabset', id: 'rightTabset', enableTabStrip: true, weight: 26, children: [] })
      }
      right = (json.layout.children || []).find((c: any) => c.id === 'rightTabset')
      if (!center) {
        if (json.layout?.type !== 'row' || !Array.isArray(json.layout.children)) {
          json.layout = getDefaultModelJson().layout
        } else {
          json.layout.children.push({ type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [] })
        }
        center = findById(json.layout, 'centerTabset')
      }
      // evita duplicati sullo stesso id
      let exists = false
      modelRef.current.visitNodes((n) => {
        if (n.getType() === 'tab') {
          const cfg = (n as any).getConfig?.() || {}
          if ((n as any).getComponent?.() === 'drawer' && cfg.drawerId === drawerId) exists = true
        }
      })
      if (!exists) {
        right.children = right.children || []
        right.children.push({ type: 'tab', name: title || 'Cassetto', component: 'drawer', config: { drawerId, drawerTitle: title, drawerType: type } })
        right.selected = (right.children || []).length - 1
      }
      const next = Model.fromJson(json)
      setModel(next)
    }
    window.addEventListener('app:open-drawer' as any, onOpenDrawer as any)
    return () => window.removeEventListener('app:open-drawer' as any, onOpenDrawer as any)
  }, [])

  // ✅ STEP 1: Apri doc come tab orizzontale nel canvas principale
  const openDoc = (doc: DocTab) => {
    console.log('[OPEN-DOC] Opening document:', doc)

    // Assicura struttura base
    ensureBaseStructure()

    // Evita duplicati
    let exists = false
    modelRef.current.visitNodes((n) => {
      if (n.getType() === 'tab') {
        const cfg = (n as TabNode).getConfig() as any
        const name = (n as TabNode).getName()
        if (cfg?.docId === doc.id || name === doc.title) exists = true
      }
    })

    if (exists) {
      console.log('[OPEN-DOC] Document already exists, skipping')
      return // Documento già aperto
    }

    const json = modelRef.current.toJson() as any

    // ✅ PRIMA: Cerca se esiste già un tabset con archive docked
    const findArchiveTabset = (node: any): any => {
      if (node.type === 'tabset' && Array.isArray(node.children)) {
        const hasArchive = node.children.some((child: any) => child.component === 'archive')
        if (hasArchive) {
          console.log('[OPEN-DOC] Trovato tabset con archive docked:', node.id, 'children count:', node.children.length)
          return node
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const result = findArchiveTabset(child)
          if (result) return result
        }
      }
      return null
    }

    let targetTabset = findArchiveTabset(json.layout)

    if (targetTabset) {
      console.log('[OPEN-DOC] Trovato tabset con archive - aggiungo documento allo stesso tabset', {
        tabsetId: targetTabset.id,
        currentChildren: targetTabset.children?.length || 0
      })
    } else {
      console.log('[OPEN-DOC] Nessun tabset con archive trovato, cerco docTabset')
      // ✅ Se non esiste archive tabset, cerca docTabset esistente
      targetTabset = findById(json.layout, 'docTabset')
      console.log('[OPEN-DOC] Existing docTabset:', targetTabset ? 'found' : 'not found')

      if (!targetTabset) {
        console.log('[OPEN-DOC] Creating new docTabset')
        // ✅ Sostituisci il placeholder con il tabset per documenti
        const placeholderIndex = json.layout.children.findIndex((child: any) => child.id === 'placeholder')
        if (placeholderIndex >= 0) {
          // Sostituisci il placeholder
          json.layout.children[placeholderIndex] = {
            type: 'tabset',
            id: 'docTabset',
            enableTabStrip: true,
            weight: 100,
            children: []
          }
        } else {
          // Fallback: aggiungi alla fine
          json.layout.children.push({
            type: 'tabset',
            id: 'docTabset',
            enableTabStrip: true,
            weight: 100,
            children: []
          })
        }
        targetTabset = findById(json.layout, 'docTabset')
      }
    }

    // Aggiungi il documento al tabset trovato (o creato)
    targetTabset.children = targetTabset.children || []
    targetTabset.children.push({
      type: 'tab',
      name: doc.title,
      component: 'doc',
      config: { docId: doc.id }
    })
    targetTabset.selected = targetTabset.children.length - 1

    console.log('[OPEN-DOC] Final targetTabset children count:', targetTabset.children.length)

    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  // ✅ STEP 1: Apri tmpdoc come tab orizzontale nel canvas principale
  const openTmpDoc = (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => {
    ensureBaseStructure()
    const json = modelRef.current.toJson() as any

    // ✅ STEP 1: Crea dinamicamente il tabset per documenti temporanei nel canvas principale
    let docTabset = findById(json.layout, 'docTabset')
    if (!docTabset) {
      // ✅ Sostituisci il placeholder con il tabset per documenti
      const placeholderIndex = json.layout.children.findIndex((child: any) => child.id === 'placeholder')
      if (placeholderIndex >= 0) {
        // Sostituisci il placeholder
        json.layout.children[placeholderIndex] = {
          type: 'tabset',
          id: 'docTabset',
          enableTabStrip: true,
          weight: 100,
          children: []
        }
      } else {
        // Fallback: aggiungi alla fine
        json.layout.children.push({
          type: 'tabset',
          id: 'docTabset',
          enableTabStrip: true,
          weight: 100,
          children: []
        })
      }
      docTabset = findById(json.layout, 'docTabset')
    }

    // Aggiungi il documento temporaneo
    docTabset.children = docTabset.children || []
    docTabset.children.push({
      type: 'tab',
      name: meta.title || 'Estratto',
      component: 'tmpdoc',
      config: { meta }
    })
    docTabset.selected = docTabset.children.length - 1

    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  const switchToArchive = () => {
    if (!modelRef.current) return

    const json = modelRef.current.toJson() as any

    // ✅ Prima: verifica se esiste già un pannello archive docked nel canvas principale
    const findArchiveTabs = (node: any): Array<{ tabset: any; index: number }> => {
      const results: Array<{ tabset: any; index: number }> = []
      if (node.type === 'tabset' && Array.isArray(node.children)) {
        node.children.forEach((child: any, index: number) => {
          if (child.component === 'archive') {
            results.push({ tabset: node, index })
          }
        })
      }
      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          results.push(...findArchiveTabs(child))
        })
      }
      return results
    }

    const archiveTabs = findArchiveTabs(json.layout)

    // Se esiste già un pannello archive docked, aprilo invece di aprire la sidebar
    if (archiveTabs.length > 0) {
      // Trovato pannello archive docked esistente, apro quello
      const firstArchive = archiveTabs[0]
      firstArchive.tabset.selected = firstArchive.index
      const nextModel = Model.fromJson(json)
      modelRef.current = nextModel
      setModel(nextModel)
      return
    }

    // ✅ Se NON esiste un pannello docked, simula il click sulla tab archivio nella sidebar
    // Questo creerà il pannello docked come se avessi cliccato manualmente
    const leftBorder = (json.borders || []).find((b: any) => b.location === 'left')
    if (!leftBorder) return

    const archiveIndex = leftBorder.children?.findIndex((t: any) => t.component === 'archive')
    if (archiveIndex !== undefined && archiveIndex >= 0) {
      console.log('📂 [switchToArchive] Nessun pannello docked esistente - simulo click sulla tab archivio nella sidebar')

      // Simula il click sulla tab archivio nella sidebar per creare il pannello docked
      const archiveTabId = leftBorder.children[archiveIndex].id
      if (archiveTabId) {
        // Trova il TabNode corrispondente
        const archiveTabNode = modelRef.current.getNodeById(archiveTabId) as TabNode | null
        if (archiveTabNode && archiveTabNode.getType() === 'tab') {
          const component = (archiveTabNode as any).getComponent()
          const behavior = PANEL_BEHAVIORS[component]

          if (behavior === 'dockable' && component === 'archive') {
            const title = ((archiveTabNode as any).getName && (archiveTabNode as any).getName()) || component
            const sidebarTabId = archiveTabId

            // ✅ SOLUZIONE PULITA: Rimuovi la tab dalla sidebar direttamente
            leftBorder.children = leftBorder.children.filter((tab: any) => tab.id !== sidebarTabId)
            leftBorder.selected = -1

            const correctedModel = Model.fromJson(json)
            modelRef.current = correctedModel
            setModel(correctedModel)

            // Crea il pannello dockable immediatamente
            requestAnimationFrame(() => {
              createDockablePanel(component, title, 'left')
            })

            return
          }
        }
      }

      // Fallback: se non riesce a simulare il click, apri solo la sidebar
      leftBorder.selected = archiveIndex
      const nextModel = Model.fromJson(json)
      modelRef.current = nextModel
      setModel(nextModel)
      onLeftBorderTabChange?.('archive')
    }
  }

  useImperativeHandle(ref, () => ({ openDoc, openTmpDoc, switchToArchive }))

  // Helper robusto per applicare/ritirare il fullscreen
  // Al mount: sincronizza lo stato in base alla tab selezionata nel left border
  useEffect(() => {
    if (!onLeftBorderTabChange) return
    const left = modelRef.current.getBorderSet().getBorders()
      .find(b => (b as any).getLocation?.() === 'left' || (b as any).getId?.() === 'leftBorder')
    const sel = left?.getSelectedNode()
    const comp = sel ? (sel as any).getComponent?.() : undefined
    if (comp) onLeftBorderTabChange(comp)
    // solo una volta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ✅ STEP 5: Cambio modello semplificato
  const handleModelChange = (m: Model) => {
    modelRef.current = m
    setModel(m)
  }

  const factory = (node: TabNode) => {
    const comp = node.getComponent()
    const tabId = node.getId()

    // ✅ STEP 4: Pannelli con fullscreen toggle
    if (comp === 'explorer') {
      return (
        <PanelWithFullscreenToggle
          component={comp}
          tabId={tabId}
          registerToggle={registerToggle}
          setFullscreenStates={setFullscreenStates}
          forceRerender={forceRerender}
          forceTabUpdate={forceTabUpdate}
        >
          <div className="w-full h-full overflow-hidden bg-white">{renderExplorer ? renderExplorer() : null}</div>
        </PanelWithFullscreenToggle>
      )
    }
    if (comp === 'graph') {
      return (
        <PanelWithFullscreenToggle
          component={comp}
          tabId={tabId}
          registerToggle={registerToggle}
          setFullscreenStates={setFullscreenStates}
          forceTabUpdate={forceTabUpdate}
          forceRerender={forceRerender}
        >
          <div className="w-full h-full overflow-hidden bg-white">
            <CaseOverviewDiagram
              praticaId={praticaId || ''}
            />
          </div>
        </PanelWithFullscreenToggle>
      )
    }
    // ✅ STEP 4: Pannelli dockable normali (senza fullscreen toggle)
    if (comp === 'archive') {
      const node = modelRef.current?.getNodeById(tabId);
      const nodeJson = node ? (modelRef.current?.toJson() as any) : null;
      const archiveTabs = nodeJson?.borders?.[0]?.children?.filter((t: any) => t.component === 'archive') || [];
      // Log rimosso per ridurre rumore;
      return <div className="w-full h-full overflow-auto bg-slate-50" data-component="archive-container" data-tab-id={tabId}>{renderArchive()}</div>
    }
    if (comp === 'persons') return <div className="w-full h-full overflow-auto bg-white">{renderPersons ? renderPersons() : null}</div>
    if (comp === 'contacts') return <div className="w-full h-full overflow-auto bg-white">{renderContacts ? renderContacts() : null}</div>
    if (comp === 'ids') return <div className="w-full h-full overflow-auto bg-white">{renderIds ? renderIds() : null}</div>
    if (comp === 'events') return <div className="w-full h-full overflow-auto bg-white">{renderEvents ? renderEvents() : null}</div>

    // ✅ Tab dinamiche per clienti
    if (comp === 'cliente-memoria') {
      // Estrai l'ID del cliente dall'ID della tab
      // Supporta sia "cliente-{id}-tab" (sidebar) che "cliente-{id}-docked-..." (docked)
      let clienteId = tabId.replace('cliente-', '').replace('-tab', '')
      // Se contiene "-docked-", prendi solo la parte prima di "-docked-"
      if (clienteId.includes('-docked-')) {
        clienteId = clienteId.split('-docked-')[0]
      }
      return (
        <div className="w-full h-full overflow-hidden bg-white">
          {renderClienteMemoria ? renderClienteMemoria(clienteId) : (
            <div className="p-4 text-sm text-muted-foreground">
              Memoria difensiva per cliente {clienteId}
            </div>
          )}
        </div>
      )
    }

    if (comp === 'overview') {
      return (
        <div className="w-full h-full overflow-hidden bg-white">
          <CaseOverviewDiagram
            praticaId={praticaId || ''} // Passa praticaId
          />
        </div>
      )
    }
    if (comp === 'doc') {
      const cfg = (node.getConfig() || {}) as { docId?: string }
      return <div className="w-full h-full overflow-hidden bg-white">{cfg.docId ? renderDoc(cfg.docId) : <div className="p-4 text-sm text-muted-foreground">Apri un documento dall'Archivio</div>}</div>
    }
    if (comp === 'tmpdoc') {
      const cfg = (node.getConfig() || {}) as { meta?: { id: string; title: string; content?: string; text?: string; source?: { docId?: string; page?: number; title?: string; x0Pct?: number; x1Pct?: number; y0Pct?: number; y1Pct?: number } } }
      const content = cfg.meta?.text || cfg.meta?.content || 'Estratto in memoria (non ancora salvato)'
      const src: any = cfg.meta?.source || {}
      const docLabel = (typeof src.title === 'string' && src.title.trim()) ? src.title : (src.docId || 'Documento')
      const pageNumRaw = (src.page !== undefined && src.page !== null) ? Number(src.page) : NaN
      const pageStart = Number.isFinite(src?.range?.startPage) ? Math.max(1, Math.floor(Number(src.range.startPage))) : undefined
      const pageEnd = Number.isFinite(src?.range?.endPage) ? Math.max(1, Math.floor(Number(src.range.endPage))) : undefined
      const pageNum = Number.isFinite(pageNumRaw) ? Math.max(1, Math.floor(pageNumRaw)) : (pageStart || undefined)
      const pageLabel = pageStart && pageEnd ? (pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`) : (pageNum ?? '-')
      try { console.log('[TMPDOC][header]', { meta: cfg.meta, src, pageNumRaw, pageNum }) } catch { }
      return (
        <div className="w-full h-full overflow-auto bg-white p-4">
          <div className="text-sm mb-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-slate-100 border rounded px-2 py-0.5"><FileText size={14} className="text-slate-700" /> Documento: {docLabel}</span>
            <span className="inline-flex items-center gap-1 bg-slate-100 border rounded px-2 py-0.5">Pag: {pageLabel}</span>
            <button
              className="ml-auto md:ml-0 inline-flex items-center gap-1 rounded px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200/60"
              onClick={() => {
                try {
                  const detail: any = { docId: src.docId, title: src.title, page: pageNum }
                  const box = (src.box && typeof src.box.x0Pct === 'number') ? src.box : (typeof src.x0Pct === 'number' && typeof src.y0Pct === 'number' ? { x0Pct: src.x0Pct, x1Pct: src.x1Pct, y0Pct: src.y0Pct, y1Pct: src.y1Pct } : undefined)
                  if (box) detail.box = box
                  try { console.log('[TMPDOC][goto-source][dispatch]', detail) } catch { }
                  window.dispatchEvent(new CustomEvent('app:goto-source', { detail }))
                } catch { }
              }}
            >Mostra nel documento</button>
          </div>
          <pre className="text-sm bg-slate-50 border rounded p-3 overflow-auto whitespace-pre-wrap break-words">{content}</pre>
        </div>
      )
    }
    if (comp === 'drawer') {
      const cfg = (node.getConfig() || {}) as { drawerId?: string; drawerTitle?: string; drawerType?: string }
      return <div className="w-full h-full overflow-hidden bg-white"><DrawerViewer id={cfg.drawerId || ''} title={cfg.drawerTitle || 'Cassetto'} type={cfg.drawerType as any} /></div>
    }
    return null
  }

  // Utility: find node json by id
  function findById(node: any, id: string): any | undefined {
    if (!node) return undefined
    if (node.id === id) return node
    const kids = node.children || []
    for (const k of kids) { const f = findById(k, id); if (f) return f }
    return undefined
  }

  // ✅ STEP 1: Canvas con placeholder invisibile per evitare creazione automatica di tabsets
  function getDefaultModelJson(): IJsonModel {
    // Tab statiche esistenti
    const staticTabs = [
      { type: 'tab', name: 'Explorer', component: 'explorer', id: 'explorerTab' },
      { type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' },
      { type: 'tab', name: 'Anagrafiche', component: 'persons', id: 'personsTab' },
      { type: 'tab', name: 'Contatti', component: 'contacts', id: 'contactsTab' },
      { type: 'tab', name: 'Identificativi', component: 'ids', id: 'idsTab' },
      { type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' },
      { type: 'tab', name: 'Grafo', component: 'graph', id: 'graphTab' }
    ]

    // Tab dinamiche per clienti
    const clienteTabs = clienti.map(cliente => ({
      type: 'tab',
      name: `${cliente.nome} ${cliente.cognome}`,
      component: 'cliente-memoria',
      id: `cliente-${cliente.id}-tab`
    }))

    // ✅ PRIMA: Tab dinamiche (clienti) ordinate alfabeticamente
    const clienteTabsSorted = [...clienteTabs].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim()
      const nameB = (b.name || '').toLowerCase().trim()
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
    })

    // ✅ POI: Tab statiche ordinate alfabeticamente
    const staticTabsSorted = [...staticTabs].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim()
      const nameB = (b.name || '').toLowerCase().trim()
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
    })

    // ✅ Combina: prima clienti, poi tab statiche
    const allTabs = [...clienteTabsSorted, ...staticTabsSorted]

    return {
      global: {
        tabSetHeaderHeight: 28,
        borderBarSize: 28,
        // ✅ Configurazioni per evitare creazione automatica di tabsets
        tabSetEnableClose: false,
        tabSetEnableDrag: false,
        tabSetEnableDrop: false,
        tabSetEnableMaximize: false,
        tabSetEnableRestore: false,
        tabSetEnableSplit: false,
        tabSetEnableResize: false,
        // ✅ Disabilita completamente la creazione automatica di tabsets
        tabSetEnableTabStrip: false,
        // ✅ Impedisce a FlexLayout di creare tabsets vuoti
        tabSetAutoSelectTab: false,
        tabSetEnableDeleteWhenEmpty: true
      },
      layout: {
        type: 'row',
        children: [
          // ✅ Placeholder invisibile per evitare che FlexLayout crei tabsets automaticamente
          {
            type: 'tabset',
            id: 'placeholder',
            weight: 100,
            enableTabStrip: false, // Nascondi la barra delle tab
            enableClose: false,    // Non chiudibile
            enableDrag: false,     // Non trascinabile
            enableDrop: false,     // Non droppabile
            enableMaximize: false, // Non massimizzabile
            children: [] // Vuoto ma presente per evitare creazione automatica
          }
        ]
      },
      borders: [
        { type: 'border', location: 'left', size: 320, selected: -1, children: allTabs } as any
      ]
    } as IJsonModel
  }

  function sanitizeModelJson(raw: IJsonModel): IJsonModel {
    try {
      const json: any = JSON.parse(JSON.stringify(raw))
      json.global = json.global || {}
      json.global.tabSetEnableTabStrip = true
      json.global.tabSetHeaderHeight = json.global.tabSetHeaderHeight || 28

      // ✅ STEP 1: Force row root with placeholder canvas
      if (!json.layout || json.layout.type !== 'row' || !Array.isArray(json.layout.children)) {
        json.layout = getDefaultModelJson().layout
      }

      // ✅ STEP 1: Cerca ricorsivamente docTabset E dockableTabset esistenti (anche se annidati in row)
      const findTabsetRecursive = (node: any, id: string): any => {
        if (node.id === id) return node
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            const result = findTabsetRecursive(child, id)
            if (result) return result
          }
        }
        return null
      }

      const existingDocTabset = findTabsetRecursive(json.layout, 'docTabset')
      const existingDockableTabset = findTabsetRecursive(json.layout, 'dockableTabset')
      const hasPlaceholder = json.layout.children.some((child: any) => child.id === 'placeholder')

      if (!hasPlaceholder && !existingDocTabset && !existingDockableTabset) {
        // Solo se non c'è né placeholder né docTabset né dockableTabset, crea il placeholder
        json.layout.children = [
          {
            type: 'tabset',
            id: 'placeholder',
            weight: 100,
            enableTabStrip: false,
            enableClose: false,
            enableDrag: false,
            enableDrop: false,
            enableMaximize: false,
            children: []
          }
        ]
      }

      // ensure left border
      if (!Array.isArray((json as any).borders)) (json as any).borders = []
      let left = (json as any).borders.find((b: any) => b.location === 'left')
      if (!left) {
        (json as any).borders.push({ type: 'border', location: 'left', size: 320, selected: -1, children: [] })
        left = (json as any).borders.find((b: any) => b.location === 'left')
      }
      if (!left.id) left.id = 'leftBorder'
      if (!Array.isArray(left.children)) left.children = []

      // ✅ ALGORITMO SEMPLICE: Assicura che tutte le tab siano sempre presenti nella sidebar
      // Le tab vengono nascoste/mostrate usando tabsVisibilityRef (false = nascosta, true/undefined = visibile)
      const defaultTabs = getDefaultModelJson().borders?.[0]?.children || []

      // ✅ 1. Separa tab dinamiche (cliente-memoria) e tab statiche, ordina separatamente
      const clienteTabs = left.children.filter((t: any) => t.component === 'cliente-memoria')
      const staticTabs = left.children.filter((t: any) => t.component !== 'cliente-memoria')

      // ✅ Ordina tab dinamiche (clienti) alfabeticamente
      const clienteTabsSorted = [...clienteTabs].sort((a: any, b: any) => {
        const nameA = (a.name || '').toLowerCase().trim()
        const nameB = (b.name || '').toLowerCase().trim()
        return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
      })

      // ✅ Ordina tab statiche alfabeticamente
      const staticTabsSorted = [...staticTabs].sort((a: any, b: any) => {
        const nameA = (a.name || '').toLowerCase().trim()
        const nameB = (b.name || '').toLowerCase().trim()
        return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' })
      })

      // ✅ Combina: prima clienti, poi tab statiche
      const allTabsSorted = [...clienteTabsSorted, ...staticTabsSorted]

      // Aggiorna l'ordine originale per riflettere l'ordine: clienti prima, poi statiche
      originalTabsOrderRef.current = allTabsSorted.map((t: any) => t.id)

      // ✅ 2. Crea una mappa delle tab esistenti per lookup veloce
      const existingTabsMap = new Map(left.children.map((t: any) => [t.id, t]))

      // ✅ 3. Costruisci l'array usando SEMPRE l'ordine originale salvato
      const allTabsInOrder: any[] = []
      originalTabsOrderRef.current.forEach((tabId) => {
        const existingTab = existingTabsMap.get(tabId)
        if (existingTab) {
          // Usa la tab esistente (preserva eventuali proprietà modificate)
          allTabsInOrder.push(existingTab)
        } else {
          // Tab mancante, cerca nella lista default
          const defaultTab = defaultTabs.find((t: any) => t.id === tabId)
          if (defaultTab) {
            allTabsInOrder.push(defaultTab)
          }
        }
      })

      // ✅ 4. Aggiungi eventuali nuove tab (non nell'ordine originale) alla fine
      const orderedTabIds = new Set(originalTabsOrderRef.current)
      left.children.forEach((tab: any) => {
        if (!orderedTabIds.has(tab.id)) {
          allTabsInOrder.push(tab)
          originalTabsOrderRef.current.push(tab.id) // Aggiungi all'ordine salvato
          // Nuova tab aggiunta all'ordine
        }
      })

      // ✅ 5. Tab sempre visibili - non filtrare più
      left.children = allTabsInOrder

      // ✅ Nessuna selezione di default
      if (typeof left.selected !== 'number') left.selected = -1

      return json
    } catch {
      return getDefaultModelJson()
    }
  }

  function ensureBaseStructure() {
    const current = modelRef.current.toJson() as any
    const sanitized = sanitizeModelJson(current)

    // simple deep compare via string; safe given small size
    if (JSON.stringify(current) !== JSON.stringify(sanitized)) {
      const nextModel = Model.fromJson(sanitized)
      modelRef.current = nextModel
      setModel(nextModel)
    }
  }

  // ✅ STEP 1: Canvas vuoto - non apriamo automaticamente documenti
  // Gli utenti dovranno cliccare sui documenti per aprirli

  // ✅ STEP 3: Intercetta drag & drop per posizionamento intelligente
  const handleAction = (action: any) => {

    // ✅ STEP 6: Intercetta chiusura tab - mostra la tab nella sidebar
    if (action.type === 'FlexLayout_DeleteTab') {
      // Trova il nodo che sta per essere chiuso
      const nodeId = action.data?.node
      if (nodeId && modelRef.current) {
        const nodeToDelete = modelRef.current.getNodeById(nodeId)

        if (nodeToDelete && nodeToDelete.getType() === 'tab') {
          const component = (nodeToDelete as any).getComponent()
          const behavior = PANEL_BEHAVIORS[component]

          if (behavior === 'dockable') {
            // ✅ SOLUZIONE PULITA: Usa le info salvate in dockablePanelsRef per rimuovere hidden dalla tab nella sidebar
            const dockedPanelInfo = dockablePanelsRef.current.get(nodeId)

            if (dockedPanelInfo && modelRef.current) {
              // ✅ Rimuovi dal tracking quando il pannello viene chiuso
              dockablePanelsRef.current.delete(nodeId)

              // ✅ Forza re-render per aggiornare lo stato visivo delle tab (ritorna spenta)
              setTabsOpenState(prev => prev + 1)

              return action // ✅ Consenti la chiusura del pannello
            } else {
              // Fallback se non troviamo l'info
              dockablePanelsRef.current.delete(nodeId)
              setTabsOpenState(prev => prev + 1)
            }
          }
        }
      }

      return action // Permetti la chiusura
    }

    // ✅ STEP 5: Intercetta click su tab nella sidebar
    if (action.type === 'FlexLayout_SelectTab') {
      const tabNodeId = action.data?.tabNode

      if (!tabNodeId) {
        return action
      }

      // ✅ Ottieni il vero oggetto TabNode dal modello
      const tabNode = modelRef.current.getNodeById(tabNodeId)

      if (!tabNode) {
        return action
      }

      const component = tabNode.getComponent()
      const behavior = PANEL_BEHAVIORS[component]

      // Se è un pannello dockable, gestisci il click
      if (behavior === 'dockable') {
        const title = tabNode.getName() || component
        const tabId = tabNode.getId() // Potrebbe essere sidebar tab o docked tab

        // ✅ Verifica se questa è una tab docked già esistente
        // Se lo è, usa originalTabId dalla dockablePanelsRef
        let sidebarTabId = tabId
        const dockedPanelInfo = dockablePanelsRef.current.get(tabId)

        if (dockedPanelInfo) {
          // È una tab docked, usa l'originalTabId
          sidebarTabId = dockedPanelInfo.originalTabId
        } else {
          // È una tab nella sidebar, usa direttamente l'ID
          sidebarTabId = tabId
        }

        // ✅ Per cliente-memoria, estrai l'ID del cliente dall'ID della tab nella sidebar
        let clienteId: string | undefined
        if (component === 'cliente-memoria') {
          clienteId = extractClienteIdFromSidebarTab(sidebarTabId) || undefined
        }

        // ✅ Tab rimangono sempre visibili - non nascondiamo più le tab quando aperte
        // La tab nella sidebar rimane visibile e verrà evidenziata quando il pannello è aperto

        // ✅ Forza re-render per aggiornare lo stato visivo delle tab
        setTabsOpenState(prev => prev + 1)

        // ✅ STEP 5: POI crea il pannello dockable (con ID diverso)
        // ✅ Per archive e cliente-memoria, verifica se esiste già un pannello docked prima di crearne uno nuovo
        if (component === 'archive' || component === 'cliente-memoria') {
          const json = modelRef.current?.toJson() as any
          if (json) {
            const findExistingTabs = (node: any): boolean => {
              if (node.type === 'tabset' && Array.isArray(node.children)) {
                if (component === 'archive') {
                  const hasArchive = node.children.some((child: any) => child.component === 'archive')
                  if (hasArchive) return true
                } else if (component === 'cliente-memoria' && clienteId) {
                  // Per cliente-memoria, cerca una tab con lo stesso clienteId nell'ID
                  const hasCliente = node.children.some((child: any) =>
                    child.component === 'cliente-memoria' &&
                    child.id.includes(clienteId)
                  )
                  if (hasCliente) return true
                }
              }
              if (Array.isArray(node.children)) {
                return node.children.some(findExistingTabs)
              }
              return false
            }

            if (findExistingTabs(json.layout)) {
              console.log(`⚠️ [DockWorkspaceV2] Tab ${component} già docked, apro quella esistente invece di crearne una nuova`)
              // Seleziona la tab esistente invece di crearne una nuova
              const findAndSelectTab = (node: any): boolean => {
                if (node.type === 'tabset' && Array.isArray(node.children)) {
                  let tabIndex = -1
                  if (component === 'archive') {
                    tabIndex = node.children.findIndex((child: any) => child.component === 'archive')
                  } else if (component === 'cliente-memoria' && clienteId) {
                    tabIndex = node.children.findIndex((child: any) =>
                      child.component === 'cliente-memoria' &&
                      child.id.includes(clienteId)
                    )
                  }
                  if (tabIndex >= 0) {
                    node.selected = tabIndex
                    return true
                  }
                }
                if (Array.isArray(node.children)) {
                  return node.children.some(findAndSelectTab)
                }
                return false
              }
              findAndSelectTab(json.layout)
              const nextModel = Model.fromJson(json)
              modelRef.current = nextModel
              setModel(nextModel)
              return undefined
            }
          }
        }

        // Crea il pannello dockable immediatamente
        requestAnimationFrame(() => {
          const position = 'left'
          if (component === 'cliente-memoria' && clienteId) {
            createDockablePanel(component, title, position, clienteId)
          } else {
            createDockablePanel(component, title, position)
          }
        })

        return undefined // Blocca la selezione normale
      }
    }

    // Intercetta quando un tab viene trascinato
    if (action.type === 'FlexLayout_DragTab') {
      const { dragNode, dropInfo } = action
      const component = dragNode.getComponent()
      const behavior = PANEL_BEHAVIORS[component]

      // Se è un pannello dockable, gestisci il posizionamento
      if (behavior === 'dockable') {
        // ✅ Per archive, NON permettere mai di creare una tab docked nel canvas principale
        // Se si cerca di trascinare archive nel canvas, apri invece la sidebar
        if (component === 'archive') {
          const json = modelRef.current?.toJson() as any
          if (json) {
            // Se il drop è nel canvas principale (non nella sidebar), blocca e apri la sidebar
            if (dropInfo && dropInfo.node) {
              const targetType = dropInfo.node.getType()

              // Se il target è nel canvas principale (non è un border)
              if (targetType === 'tabset' || targetType === 'row') {
                console.log('⚠️ [DockWorkspaceV2] Tentativo di trascinare archive nel canvas principale - apro invece la sidebar')
                // Apri la sidebar invece di creare un nuovo pannello
                switchToArchive()
                return undefined // Blocca completamente la creazione della tab docked
              }
            }

            // Cerca anche se esiste già una tab archive docked
            const findArchiveTabs = (node: any): boolean => {
              if (node.type === 'tabset' && Array.isArray(node.children)) {
                const hasArchive = node.children.some((child: any) => child.component === 'archive')
                if (hasArchive) return true
              }
              if (Array.isArray(node.children)) {
                return node.children.some(findArchiveTabs)
              }
              return false
            }

            if (findArchiveTabs(json.layout)) {
              console.log('⚠️ [DockWorkspaceV2] Tab archive già docked, blocco drag per evitare duplicati')
              switchToArchive() // Apri la sidebar invece
              return undefined // Blocca la creazione di una nuova tab
            }
          }
        }

        // Permetti il drop solo nel canvas centrale (per altri componenti dockable)
        if (dropInfo && dropInfo.node && dropInfo.node.getType() === 'tabset') {
          const targetTabset = dropInfo.node
          const targetId = targetTabset.getId()

          // Se il target è nel canvas centrale, permetti il drop
          if (targetId === 'dockableTabset' || targetId === 'docTabset') {
            return action // Permetti l'azione
          }
        }

        // Se il drop è nel canvas vuoto, crea un nuovo tabset
        if (dropInfo && dropInfo.node && dropInfo.node.getType() === 'row') {
          return action // Permetti l'azione
        }

        // Blocca il drop in altre zone
        return undefined // Blocca l'azione
      }
    }

    // Per tutti gli altri tipi di azione, permetti il comportamento normale
    return action
  }

  // ✅ STEP 3: Crea pannello dockable nel canvas centrale con posizionamento intelligente
  const createDockablePanel = (component: string, title: string, preferredPosition?: 'left' | 'right' | 'top' | 'bottom', clienteId?: string) => {
    const json = modelRef.current.toJson() as any

    // Verifica se il pannello è già aperto in qualche tabset
    let existingTabset: any = null
    let existingIndex = -1

    // Cerca in tutti i tabsets esistenti
    const findExistingPanel = (node: any): boolean => {
      if (node.type === 'tabset' && Array.isArray(node.children)) {
        const index = node.children.findIndex((child: any) => child.component === component)
        if (index >= 0) {
          existingTabset = node
          existingIndex = index
          return true
        }
      }
      if (Array.isArray(node.children)) {
        return node.children.some(findExistingPanel)
      }
      return false
    }

    findExistingPanel(json.layout)

    if (existingTabset && existingIndex >= 0) {
      // Pannello già aperto, selezionalo
      existingTabset.selected = existingIndex
      const nextModel = Model.fromJson(json)
      modelRef.current = nextModel
      setModel(nextModel)
      return
    }

    // Pannello non aperto, crealo
    let targetTabset = findById(json.layout, 'dockableTabset')

    if (!targetTabset) {
      // Crea nuovo tabset per pannelli dockable
      const newTabset = {
        type: 'tabset',
        id: 'dockableTabset',
        enableTabStrip: true,
        weight: component === 'archive' ? 20 : 60, // Archivio molto più stretto per le miniature
        children: []
      }

      // ✅ Gestisci il placeholder: sostituiscilo o posiziona il nuovo tabset
      const placeholderIndex = json.layout.children.findIndex((child: any) => child.id === 'placeholder')

      if (preferredPosition === 'left' || component === 'archive') {
        // Posizione a sinistra (default) - Archivio sempre a sinistra
        if (placeholderIndex >= 0) {
          // Sostituisci il placeholder con il nuovo tabset
          json.layout.children[placeholderIndex] = newTabset
        } else {
          // Fallback: aggiungi all'inizio
          json.layout.children.unshift(newTabset)
        }
      } else if (preferredPosition === 'right' && json.layout.children.length > 0) {
        // Crea un row con il tabset a destra
        if (placeholderIndex >= 0) {
          // Sostituisci il placeholder con un row che contiene il nuovo tabset
          json.layout.children[placeholderIndex] = {
            type: 'row',
            children: [
              { type: 'tabset', id: 'leftArea', weight: 40, children: [] },
              newTabset
            ]
          }
        } else {
          // Fallback: crea un row
          json.layout.children = [
            { type: 'tabset', id: 'leftArea', weight: 40, children: [] },
            newTabset
          ]
        }
      } else {
        // Posizione di default (sinistra)
        if (placeholderIndex >= 0) {
          // Sostituisci il placeholder
          json.layout.children[placeholderIndex] = newTabset
        } else {
          // Fallback: aggiungi alla fine
          json.layout.children.push(newTabset)
        }
      }

      targetTabset = newTabset
    }

    // Aggiungi il pannello con ID unico
    targetTabset.children = targetTabset.children || []
    // Per cliente-memoria, mantieni l'ID del cliente nell'ID della tab docked
    const uniqueId = component === 'cliente-memoria' && clienteId
      ? `cliente-${clienteId}-docked-${Date.now()}`
      : `${component}Docked${Date.now()}`
    targetTabset.children.push({
      type: 'tab',
      name: title,
      component: component,
      id: uniqueId
    })
    targetTabset.selected = targetTabset.children.length - 1

    // ✅ SOLUZIONE PULITA: Traccia il pannello dockable con l'ID originale della tab nella sidebar
    let originalTabId: string
    if (component === 'cliente-memoria' && clienteId) {
      originalTabId = `cliente-${clienteId}-tab`
    } else {
      // Tab statiche: mappa componente -> ID tab sidebar
      const staticTabIds: Record<string, string> = {
        'archive': 'archiveTab',
        'persons': 'personsTab',
        'contacts': 'contactsTab',
        'ids': 'idsTab',
        'events': 'eventsTab',
        'explorer': 'explorerTab',
        'graph': 'graphTab'
      }
      originalTabId = staticTabIds[component] || `${component}Tab`
    }

    dockablePanelsRef.current.set(uniqueId, {
      component,
      title,
      originalTabId,
      clienteId: component === 'cliente-memoria' ? clienteId : undefined
    })

    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  // ✅ Helper per verificare se una tab è aperta (ha un pannello docked)
  const isTabOpen = useCallback((tabId: string): boolean => {
    // Cerca tra i pannelli docked se esiste uno con questo originalTabId
    for (const [dockedTabId, info] of dockablePanelsRef.current.entries()) {
      if (info.originalTabId === tabId) {
        // Verifica che il pannello docked esista ancora nel modello
        if (modelRef.current) {
          const dockedNode = modelRef.current.getNodeById(dockedTabId)
          if (dockedNode) {
            return true
          }
        }
      }
    }
    return false
  }, [])

  const iconFactory = (node: TabNode) => {
    const comp = node.getComponent()

    // ✅ Tab documenti temporanei
    if (comp === 'tmpdoc') {
      return <ScanText size={20} className="text-emerald-600" />
    }

    // ✅ Tab drawer
    if (comp === 'drawer') {
      const cfg = (node.getConfig() || {}) as { drawerTitle?: string }
      const t = (cfg.drawerTitle || '').toLowerCase()
      if (t.includes('verbale')) return <FileText size={24} className="text-amber-600" />
      if (t.includes('difens')) return <Gavel size={24} className="text-emerald-600" />
      if (t.includes('incontri') || t.includes('eventi')) return <Zap size={24} className="text-pink-600" />
      if (t.includes('intercett')) return <Hash size={24} className="text-pink-600" />
      if (t.includes('procura')) return <Landmark size={24} className="text-violet-600" />
      if (t.includes('ufficio pg')) return <Shield size={24} className="text-slate-700" />
      if (t.includes('contatti') || t.includes('telefon')) return <Phone size={24} className="text-blue-600" />
      if (t.includes('timeline') || t.includes('termini')) return <Clock size={24} className="text-slate-600" />
      if (t.includes('anagrafe') || t.includes('avvocati') || t.includes('elenco nomi')) return <Users size={24} className="text-blue-700" />
      if (t.includes('reati')) return <Boxes size={24} className="text-slate-700" />
      return <Boxes size={24} className="text-slate-600" />
    }

    // ✅ Tab della sidebar - usa la mappatura
    const config = TAB_CONFIGS[comp]
    if (config) {
      const tabId = node.getId()
      // ✅ Usa tabsOpenState per forzare re-render quando cambia
      const _ = tabsOpenState // Force dependency
      const isOpen = isTabOpen(tabId)
      const Icon = config.icon
      const color = isOpen ? config.colorActive : config.colorBase
      const opacity = isOpen ? 1 : 0.4 // Tab chiusa = 40% opacità, tab aperta = 100%

      return (
        <Icon
          size={18}
          className="dockv2-tab-icon"
          style={{
            color,
            opacity,
            transition: 'opacity 0.3s ease, color 0.3s ease'
          }}
        />
      )
    }

    return undefined
  }

  // ✅ Renderizza tab con colori dinamici e pulsante fullscreen quando necessario
  const onRenderTab = useCallback((node: any, renderValues: any) => {
    const comp = node.getComponent?.()
    const tabId = node.getId()

    // ✅ Verifica se la tab è nella sidebar (left border)
    const parent = node.getParent()
    const isInSidebar = parent && parent.getType() === 'tabset' && parent.getParent()?.getType() === 'border'

    if (isInSidebar) {
      // ✅ Tab nella sidebar: applica colori dinamici basati su stato aperto/chiuso
      const config = TAB_CONFIGS[comp || '']
      if (config) {
        const isOpen = isTabOpen(tabId)
        const color = isOpen ? config.colorActive : config.colorBase
        const opacity = isOpen ? 1 : 0.4
        const Icon = config.icon

        // Applica classi CSS e attributi data per controllo via CSS
        renderValues.className = (renderValues.className || '') + ' dockv2-sidebar-tab'
        if (isOpen) {
          renderValues.className += ' dockv2-sidebar-tab-open dockv2-tab-bold' // Classe specifica per grassetto
        }
        renderValues.className += ` dockv2-tab-${comp || ''}`

        // ✅ Aggiungi l'icona come leading element (prima del testo) - con outline/stroke colorato
        // IMPORTANTE: Le icone Lucide devono usare stroke invece di fill per essere colorate
        renderValues.leading = (
          <Icon
            size={18}
            className="dockv2-tab-icon"
            strokeWidth={2.5}
            fill="none"
            style={{
              color: color,
              stroke: color, // Colore delle linee (outline) - FORZA il colore
              opacity: opacity,
              transition: 'opacity 0.3s ease, color 0.3s ease, stroke 0.3s ease',
              marginRight: '6px',
              flexShrink: 0,
              display: 'inline-block',
              verticalAlign: 'middle'
            } as React.CSSProperties}
          />
        )

        const borderColor = isOpen ? color : 'transparent'

        // ✅ Applica CSS variables e stili inline SENZA sfondo colorato (trasparente)
        // IMPORTANTE: fontWeight deve essere applicato anche come CSS variable per forzare il grassetto
        renderValues.style = {
          ...(renderValues.style || {}),
          '--tab-color': color,
          '--tab-border-color': borderColor,
          '--tab-opacity': opacity.toString(),
          '--tab-font-weight': isOpen ? '700' : '400', // CSS variable per font-weight
          color: color,
          backgroundColor: 'transparent', // ✅ SFONDO TRASPARENTE invece di bgColor
          borderLeft: isOpen ? `4px solid ${color}` : '4px solid transparent', // Bordo più spesso
          fontWeight: isOpen ? '700' : '400', // Font-weight inline più forte
          opacity: opacity
        }

        // Aggiungi attributo data per CSS più specifico
        renderValues.attributes = {
          ...(renderValues.attributes || {}),
          'data-tab-open': isOpen ? 'true' : 'false',
          'data-tab-component': comp || ''
        }
      }
      return
    }

    // ✅ Pulsante fullscreen SOLO per pannelli docked (non sidebar)
    if (!['explorer', 'graph'].includes(comp)) {
      return
    }

    // ✅ Ottieni lo stato fullscreen dal state globale (reattivo)
    const isFullscreen = fullscreenStates.get(tabId) || false

    renderValues.buttons = renderValues.buttons || []
    renderValues.buttons.push(
      <button
        key="fs"
        className="dockv2-tab-fullscreen"
        title={isFullscreen ? "Riduci" : "Massimizza"}
        onClick={(e: any) => {
          e.stopPropagation()
          const toggleFn = fullscreenTogglesRef.current.get(tabId)
          if (toggleFn) {
            toggleFn()
          }
        }}
      >
        {isFullscreen ? '⛷' : '⛶'}
      </button>
    )
  }, [fullscreenTrigger, fullscreenStates, isTabOpen])

  // ✅ Rimossa: l'aggiornamento del modello viene gestito direttamente in handleAction quando necessario

  // ✅ Rimuovi tab archive duplicate nel canvas principale
  useEffect(() => {
    if (!modelRef.current) return

    const json = modelRef.current.toJson() as any
    let hasChanges = false

    // Trova tutte le tab archive docked nel canvas principale (non nella sidebar)
    const findArchiveTabs = (node: any, inBorder: boolean = false): Array<{ tabset: any; index: number; tab: any }> => {
      const results: Array<{ tabset: any; index: number; tab: any }> = []

      if (node.type === 'tabset' && !inBorder) {
        // Cerca solo nei tabsets del canvas principale (non nei border)
        node.children?.forEach((child: any, index: number) => {
          if (child.component === 'archive') {
            results.push({ tabset: node, index, tab: child })
          }
        })
      }

      if (node.type === 'border' && node.location === 'left') {
        // Skip border left - quelle sono nella sidebar
        inBorder = true
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          results.push(...findArchiveTabs(child, inBorder))
        })
      }

      return results
    }

    const archiveTabs = findArchiveTabs(json.layout)

    // Se ci sono più tab archive docked, rimuovi tutte tranne la prima
    if (archiveTabs.length > 1) {
      console.warn('⚠️ [DockWorkspaceV2] Trovate tab archive duplicate:', archiveTabs.length, 'Rimuovo duplicati...')

      // Mantieni solo la prima tab, rimuovi le altre
      for (let i = 1; i < archiveTabs.length; i++) {
        const { tabset, index } = archiveTabs[i]
        tabset.children.splice(index, 1)
        hasChanges = true

        // Se la tab rimossa era selezionata, seleziona la prima tab archive
        if (tabset.selected === index) {
          const firstArchiveTab = archiveTabs[0]
          const firstIndex = firstArchiveTab.tabset.children.findIndex((child: any) => child.component === 'archive')
          if (firstIndex >= 0) {
            firstArchiveTab.tabset.selected = firstIndex
          }
        }

        // Aggiorna gli indici delle tab successive
        for (let j = i + 1; j < archiveTabs.length; j++) {
          if (archiveTabs[j].tabset === tabset && archiveTabs[j].index > index) {
            archiveTabs[j].index--
          }
        }
      }

      if (hasChanges) {
        const nextModel = Model.fromJson(json)
        modelRef.current = nextModel
        setModel(nextModel)
        console.log('✅ [DockWorkspaceV2] Tab archive duplicate rimosse')
      }
    }
  }, [model])

  // ✅ Rimossa: non serve più nascondere/mostrare tab con CSS
  // Le tab vengono gestite direttamente nel modello JSON (rimozione/aggiunta dall'array)

  // ✅ Forza grassetto sul testo delle tab aperte usando DOM manipulation
  useEffect(() => {
    const forceBoldOnOpenTabs = () => {
      if (!layoutRootRef.current) return

      // Trova tutte le tab nella sidebar sinistra che sono aperte
      const openTabs = layoutRootRef.current.querySelectorAll(
        '.flexlayout__border_left .flexlayout__tab.dockv2-sidebar-tab.dockv2-sidebar-tab-open'
      )

      openTabs.forEach((tab) => {
        // Forza font-weight su tutti gli elementi di testo dentro la tab
        const textElements = tab.querySelectorAll('span, div, label, p, button, a')
        textElements.forEach((el) => {
          if (el instanceof HTMLElement && !el.classList.contains('dockv2-tab-icon')) {
            el.style.fontWeight = '700'
          }
        })
        // Forza anche sul tab stesso
        if (tab instanceof HTMLElement) {
          tab.style.fontWeight = '700'
        }
      })
    }

    // Esegui immediatamente e dopo un breve delay per catturare elementi renderizzati dopo
    forceBoldOnOpenTabs()
    const timeout = setTimeout(forceBoldOnOpenTabs, 100)
    const interval = setInterval(forceBoldOnOpenTabs, 500) // Refresh ogni 500ms

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [tabsOpenState, model]) // Re-esegui quando cambia lo stato delle tab

  return (
    <div
      ref={layoutRootRef}
      className="dockv2-root"
      style={{ height: '100%', width: '100%', boxSizing: 'border-box', position: 'relative' }}
    >
      <LayoutAny
        key={`layout-${tabsOpenState}`}
        model={model}
        factory={factory}
        iconFactory={iconFactory}
        realtimeResize
        onModelChange={handleModelChange}
        onAction={handleAction}
        onRenderTab={onRenderTab}

      // ✅ STEP 4: Fullscreen gestito dal componente PanelWithFullscreenToggle
      />

      {/* CSS gestito da DockWorkspaceV2.css */}
    </div>
  )
}

export const DockWorkspaceV2 = forwardRef<DockWorkspaceV2Handle, Props>(DockWorkspaceV2Component)
