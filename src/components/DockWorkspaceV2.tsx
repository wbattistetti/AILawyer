import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Layout, Model, TabNode, IJsonModel, Actions } from 'flexlayout-react'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { CabinetView } from '../features/case-overview/components/CabinetView'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
// baselineGraph removed - no longer needed
import 'flexlayout-react/style/light.css'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText } from 'lucide-react'
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
  const supportsFullscreen = ['explorer', 'graph', 'cabinet'].includes(component)

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
  // Pannelli dockable con fullscreen toggle (Explorer, Grafo, Armadio)
  'explorer': 'dockable',
  'graph': 'dockable',
  'cabinet': 'dockable',

  // Pannelli dockable normali (trascinabili e ridimensionabili nel canvas)
  'archive': 'dockable',
  'search': 'dockable',
  'persons': 'dockable',
  'contacts': 'dockable',
  'ids': 'dockable',
  'events': 'dockable',

  // Documenti (si aprono come tab nel canvas)
  'doc': 'document',
  'tmpdoc': 'document',

  // Overlay (si aprono sopra il contenuto)
  'drawer': 'overlay'
}

type Props = {
  // docs: DocTab[] // Removed unused prop
  renderArchive: () => React.ReactNode
  renderSearch?: () => React.ReactNode
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
    renderSearch,
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

  // ✅ Traccia i pannelli dockable attivi per nascondere/mostrare le tab nella sidebar
  const dockablePanelsRef = useRef<Map<string, { component: string; title: string; originalTabId: string }>>(new Map())
  // ✅ Traccia quali componenti sono attualmente docked per nascondere le relative tab nella sidebar
  const dockedComponentsRef = useRef<Set<string>>(new Set())
  // ✅ State per forzare re-render quando cambiano i componenti docked
  const [dockedComponents, setDockedComponents] = useState<Set<string>>(new Set())
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

    // ✅ STEP 1: Crea dinamicamente il tabset per documenti nel canvas principale
    let docTabset = findById(json.layout, 'docTabset')
    console.log('[OPEN-DOC] Existing docTabset:', docTabset)

    if (!docTabset) {
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
      docTabset = findById(json.layout, 'docTabset')
    } else {
      console.log('[OPEN-DOC] Using existing docTabset with', docTabset.children?.length || 0, 'children')
    }

    // Aggiungi il documento
    docTabset.children = docTabset.children || []
    docTabset.children.push({
      type: 'tab',
      name: doc.title,
      component: 'doc',
      config: { docId: doc.id }
    })
    docTabset.selected = docTabset.children.length - 1

    console.log('[OPEN-DOC] Final docTabset children count:', docTabset.children.length)

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
    const json = modelRef.current.toJson() as any
    const leftBorder = (json.borders || []).find((b: any) => b.location === 'left')
    if (!leftBorder) return

    // Trova index del tab archive
    const archiveIndex = leftBorder.children?.findIndex((t: any) => t.component === 'archive')
    if (archiveIndex !== undefined && archiveIndex >= 0) {
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
    if (comp === 'cabinet') {
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
            <CabinetView
              graph={{ nodes: [], edges: [] } as any}
              onOpen={() => { }}
              praticaId={praticaId || ''}
            />
          </div>
        </PanelWithFullscreenToggle>
      )
    }

    // ✅ STEP 4: Pannelli dockable normali (senza fullscreen toggle)
    if (comp === 'archive') return <div className="w-full h-full overflow-auto bg-slate-50">{renderArchive()}</div>
    if (comp === 'search') return <div className="w-full h-full overflow-auto bg-white">{renderSearch ? renderSearch() : null}</div>
    if (comp === 'persons') return <div className="w-full h-full overflow-auto bg-white">{renderPersons ? renderPersons() : null}</div>
    if (comp === 'contacts') return <div className="w-full h-full overflow-auto bg-white">{renderContacts ? renderContacts() : null}</div>
    if (comp === 'ids') return <div className="w-full h-full overflow-auto bg-white">{renderIds ? renderIds() : null}</div>
    if (comp === 'events') return <div className="w-full h-full overflow-auto bg-white">{renderEvents ? renderEvents() : null}</div>

    // ✅ Tab dinamiche per clienti
    if (comp === 'cliente-memoria') {
      const clienteId = tabId.replace('cliente-', '').replace('-tab', '')
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
      { type: 'tab', name: 'Search', component: 'search', id: 'searchTab' },
      { type: 'tab', name: 'Schede Anagrafiche', component: 'persons', id: 'personsTab' },
      { type: 'tab', name: 'Contatti', component: 'contacts', id: 'contactsTab' },
      { type: 'tab', name: 'Identificativi', component: 'ids', id: 'idsTab' },
      { type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' },
      { type: 'tab', name: 'Grafo', component: 'graph', id: 'graphTab' },
      { type: 'tab', name: 'Armadio', component: 'cabinet', id: 'cabinetTab' }
    ]

    // Tab dinamiche per clienti
    const clienteTabs = clienti.map(cliente => ({
      type: 'tab',
      name: `${cliente.nome} ${cliente.cognome}`,
      component: 'cliente-memoria',
      id: `cliente-${cliente.id}-tab`
    }))

    // Combina tab statiche e dinamiche
    const allTabs = [...staticTabs, ...clienteTabs]

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

      // ✅ STEP 1: Preserva il docTabset esistente se presente
      const existingDocTabset = json.layout.children.find((child: any) => child.id === 'docTabset')
      const hasPlaceholder = json.layout.children.some((child: any) => child.id === 'placeholder')

      if (!hasPlaceholder && !existingDocTabset) {
        // Solo se non c'è né placeholder né docTabset, crea il placeholder
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

      // ensure left border Archivio/Search
      if (!Array.isArray((json as any).borders)) (json as any).borders = []
      let left = (json as any).borders.find((b: any) => b.location === 'left')
      if (!left) {
        (json as any).borders.push({ type: 'border', location: 'left', size: 320, selected: -1, children: [] })
        left = (json as any).borders.find((b: any) => b.location === 'left')
      }
      // Assicura che l'ID sia presente (per compatibilità con il nostro codice)
      if (!left.id) left.id = 'leftBorder'
      if (!Array.isArray(left.children)) left.children = []
      const hasArchive = left.children.some((t: any) => t.component === 'archive')
      const hasSearch = left.children.some((t: any) => t.component === 'search')
      const hasPersons = left.children.some((t: any) => t.component === 'persons')
      const hasEvents = left.children.some((t: any) => t.component === 'events')

      // ✅ Solo aggiungi le tab se non sono già docked
      if (!hasArchive && !dockedComponentsRef.current.has('archive')) {
        left.children.push({ type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' })
      }
      if (!hasSearch && !dockedComponentsRef.current.has('search')) {
        left.children.push({ type: 'tab', name: 'Search', component: 'search', id: 'searchTab' })
      }
      if (!hasPersons && !dockedComponentsRef.current.has('persons')) {
        left.children.push({ type: 'tab', name: 'Schede Anagrafiche', component: 'persons', id: 'personsTab' })
      }
      if (!hasEvents && !dockedComponentsRef.current.has('events')) {
        left.children.push({ type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' })
      }
      // ✅ STEP 1: Nessuna selezione di default - canvas completamente vuoto
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
    console.log('[ACTION] Action received:', action.type, action)

    // ✅ STEP 6: Intercetta chiusura tab - mostra la tab nella sidebar
    if (action.type === 'FlexLayout_DeleteTab') {
      console.log('[DELETE-TAB] DeleteTab action detected!')
      console.log('[DELETE-TAB] Action data:', action.data)

      // Trova il nodo che sta per essere chiuso
      const nodeId = action.data?.node
      if (nodeId) {
        const nodeToDelete = modelRef.current.getNodeById(nodeId)

        if (nodeToDelete && nodeToDelete.getType() === 'tab') {
          const component = nodeToDelete.getComponent()
          const behavior = PANEL_BEHAVIORS[component]

          if (behavior === 'dockable') {
            // ✅ Rimuovi dalla lista dei componenti docked per mostrare la tab
            dockedComponentsRef.current.delete(component)
            setDockedComponents(new Set(dockedComponentsRef.current))
            console.log('[DELETE-TAB] Component undocked:', component, 'Docked components:', Array.from(dockedComponentsRef.current))

            // Rimuovi dal tracking
            dockablePanelsRef.current.delete(nodeId)
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

        // ✅ STEP 5: PRIMA rimuovi la tab dalla sidebar
        const json = modelRef.current.toJson() as any
        const leftBorder = json.borders?.find((b: any) => b.location === 'left')
        if (leftBorder) {
          // ✅ NON rimuovere la tab, ma segnala che il componente è docked
          dockedComponentsRef.current.add(component)
          setDockedComponents(new Set(dockedComponentsRef.current))

          // Mantieni la sidebar non selezionata (strip-only)
          leftBorder.selected = -1

          const correctedModel = Model.fromJson(json)
          setModel(correctedModel)
        }

        // ✅ STEP 5: POI crea il pannello dockable (con ID diverso)
        setTimeout(() => {
          // Archivio si apre sempre a sinistra con larghezza fissa per miniature
          const position = component === 'archive' ? 'left' : 'left'
          createDockablePanel(component, title, position)
        }, 100)

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
        // Permetti il drop solo nel canvas centrale
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
  const createDockablePanel = (component: string, title: string, preferredPosition?: 'left' | 'right' | 'top' | 'bottom') => {
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
    const uniqueId = `${component}Docked${Date.now()}`
    targetTabset.children.push({
      type: 'tab',
      name: title,
      component: component,
      id: uniqueId
    })
    targetTabset.selected = targetTabset.children.length - 1

    // ✅ Traccia il pannello dockable per il ripristino alla sidebar
    const originalTabId = `${component}Tab`
    dockablePanelsRef.current.set(uniqueId, {
      component,
      title,
      originalTabId
    })

    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  const iconFactory = (node: TabNode) => {
    const comp = node.getComponent()
    if (comp === 'tmpdoc') {
      return <ScanText size={20} className="text-emerald-600" />
    }
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
    return undefined
  }

  // ✅ Inserisce il pulsante fullscreen nell'header della Tab SOLO per pannelli docked (non sidebar)
  const onRenderTab = useCallback((node: any, renderValues: any) => {

    const comp = node.getComponent?.()
    if (!['explorer', 'graph', 'cabinet'].includes(comp)) {
      return
    }

    // ✅ PROBLEMA 1 FIX: Solo per pannelli docked, non per sidebar
    // Verifica se il tab è in un tabset del canvas (non in border)
    const parent = node.getParent()
    if (!parent || parent.getType() !== 'tabset') {
      return
    }

    // Se il parent è un border (sidebar), non aggiungere il pulsante
    const parentParent = parent.getParent()
    if (parentParent && parentParent.getType() === 'border') {
      return
    }

    // ✅ Ottieni lo stato fullscreen dal state globale (reattivo)
    const isFullscreen = fullscreenStates.get(node.getId()) || false

    renderValues.buttons = renderValues.buttons || []
    renderValues.buttons.push(
      <button
        key="fs"
        className="dockv2-tab-fullscreen"
        title={isFullscreen ? "Riduci" : "Massimizza"}
        onClick={(e: any) => {
          e.stopPropagation()
          const toggleFn = fullscreenTogglesRef.current.get(node.getId())
          if (toggleFn) {
            toggleFn()
          }
        }}
      >
        {isFullscreen ? '⛷' : '⛶'}
      </button>
    )
  }, [fullscreenTrigger, fullscreenStates])

  // ✅ Nascondi/mostra le tab nella sidebar usando CSS dinamico
  useEffect(() => {
    const dockedArray = Array.from(dockedComponents)
    console.log('[CSS-EFFECT] Docked components:', dockedArray)

    // Mappa componenti ai nomi delle tab
    const componentToTabName: Record<string, string> = {
      'explorer': 'Explorer',
      'archive': 'Archivio',
      'search': 'Search',
      'persons': 'Schede Anagrafiche',
      'contacts': 'Contatti',
      'ids': 'Identificativi',
      'events': 'Eventi',
      'graph': 'Grafo',
      'cabinet': 'Armadio'
    }

    // Funzione per nascondere/mostrare le tab
    const updateTabVisibility = () => {

      // Cerca le tab individuali nella sidebar
      const tabContainer = document.querySelector('.dockv2-root .flexlayout__border_left .flexlayout__border_inner_tab_container')
      if (!tabContainer) {
        return
      }

      // Cerca tutti gli elementi figli che potrebbero essere tab individuali
      const possibleTabs = tabContainer.querySelectorAll('*')

      // Filtra solo quelli che contengono testo delle tab
      const tabNames = ['Explorer', 'Archivio', 'Search', 'Schede Anagrafiche', 'Contatti', 'Identificativi', 'Eventi', 'Grafo', 'Armadio']
      const individualTabs: Element[] = []

      possibleTabs.forEach(element => {
        const text = element.textContent?.trim()
        if (text && tabNames.some(name => text.includes(name))) {
          individualTabs.push(element)
        }
      })

      if (individualTabs.length === 0) {
        // Se non trova tab individuali, prova a nascondere parti del container
        return
      }


      // Debug: mostra tutti gli elementi con X nella sidebar
      const allElements = tabContainer.querySelectorAll('*')
      allElements.forEach((element) => {
        const text = element.textContent?.trim()
        if (text === '×' || text === '✕' || text === 'X' || element.innerHTML.includes('×') || element.innerHTML.includes('✕') || element.innerHTML.includes('close')) {
        }
      })

      // Nascondi le tab docked
      dockedArray.forEach(component => {
        const tabName = componentToTabName[component]
        if (tabName) {
          let found = false
          individualTabs.forEach(tab => {
            if (tab.textContent?.trim().includes(tabName)) {
              tab.classList.add('dockv2-hidden-tab')
              found = true
            }
          })
          if (!found) {
          }
        }
      })

      // Mostra le tab non più docked
      Object.entries(componentToTabName).forEach(([component, tabName]) => {
        if (!dockedComponents.has(component)) {
          individualTabs.forEach(tab => {
            if (tab.textContent?.trim().includes(tabName)) {
              tab.classList.remove('dockv2-hidden-tab')
            }
          })
        }
      })
    }

    // Esegui immediatamente e anche dopo un delay per FlexLayout
    updateTabVisibility()
    setTimeout(updateTabVisibility, 100)
    setTimeout(updateTabVisibility, 500)
  }, [dockedComponents])

  return (
    <div
      ref={layoutRootRef}
      className="dockv2-root"
      style={{ height: '100%', width: '100%', boxSizing: 'border-box', position: 'relative' }}
    >
      <LayoutAny
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
