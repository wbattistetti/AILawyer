import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Layout, Model, TabNode, IJsonModel } from 'flexlayout-react'
import { CaseOverviewDiagram } from '../features/case-overview/components/CaseOverviewDiagram'
import { DrawerViewer } from '../features/drawers/DrawerViewer'
import { baselineGraph } from '../features/case-overview/stories/_mocks'
import 'flexlayout-react/style/light.css'
import { Users, FileText, Zap, Gavel, Landmark, Boxes, Phone, Shield, Clock, Hash, ScanText } from 'lucide-react'
import './DockWorkspaceV2.css'

type DocTab = { id: string; title: string }

type Props = {
  docs: DocTab[]
  renderArchive: () => React.ReactNode
  renderSearch?: () => React.ReactNode
  renderPersons?: () => React.ReactNode
  renderContacts?: () => React.ReactNode
  renderIds?: () => React.ReactNode
  renderDoc: (docId: string) => React.ReactNode
  storageKey?: string
  renderEvents?: () => React.ReactNode
  renderExplorer?: () => React.ReactNode
  isExplorerFullscreen?: boolean
  onLeftBorderTabChange?: (component: string) => void
}

export type DockWorkspaceV2Handle = {
  openDoc: (doc: DocTab) => void
  openTmpDoc: (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => void
}

export const DockWorkspaceV2 = forwardRef<DockWorkspaceV2Handle, Props>(function DockWorkspaceV2({ docs, renderArchive, renderSearch, renderPersons, renderContacts, renderIds, renderDoc, storageKey = 'ws_dock_v2', renderEvents, renderExplorer, isExplorerFullscreen = false, onLeftBorderTabChange }, ref) {
  const LayoutAny = Layout as any
  const layoutRootRef = useRef<HTMLDivElement>(null)
  
  const initial: IJsonModel = useMemo(() => {
    // Start from a known good layout to avoid corrupted persisted models
    return getDefaultModelJson()
  }, [storageKey])

  const [model, setModel] = useState(() => Model.fromJson(initial))
  const modelRef = useRef(model)
  modelRef.current = model

  useEffect(() => {
    const json = model.toJson()
    try { localStorage.setItem(storageKey, JSON.stringify(json)) } catch {}
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

  // Apri doc nel tabset centrale
  const openDoc = (doc: DocTab) => {
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
    const json = modelRef.current.toJson() as any
    let center = findById(json.layout, 'centerTabset')
    if (!center) {
      // ricrea centerTabset se manca
      if (json.layout?.type !== 'row' || !Array.isArray(json.layout.children)) {
        json.layout = getDefaultModelJson().layout
      } else {
        json.layout.children.push({ type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [] })
      }
      center = findById(json.layout, 'centerTabset')
    }
    if (!exists) {
      center.children = center.children || []
      center.children.push({ type: 'tab', name: doc.title, component: 'doc', config: { docId: doc.id } })
      center.selected = center.children.length - 1
    }
    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  const openTmpDoc = (meta: { id: string; title: string; content?: string; text?: string; source?: any }) => {
    ensureBaseStructure()
    const json = modelRef.current.toJson() as any
    let center = findById(json.layout, 'centerTabset')
    if (!center) {
      if (json.layout?.type !== 'row' || !Array.isArray(json.layout.children)) {
        json.layout = getDefaultModelJson().layout
      } else {
        json.layout.children.push({ type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [] })
      }
      center = findById(json.layout, 'centerTabset')
    }
    center.children = center.children || []
    center.children.push({ type: 'tab', name: meta.title || 'Estratto', component: 'tmpdoc', config: { meta } })
    center.selected = center.children.length - 1
    const nextModel = Model.fromJson(json)
    modelRef.current = nextModel
    setModel(nextModel)
  }

  useImperativeHandle(ref, () => ({ openDoc, openTmpDoc }))

  // Helper robusto per applicare/ritirare il fullscreen
  const applyExplorerFullscreen = useCallback((on: boolean) => {
    const m = modelRef.current
    if (!m) return

    // Trova border sinistro (usa id se lo hai messo nel JSON, altrimenti fallback su location)
    const leftBorder = m.getBorderSet().getBorders()
      .find(b => (b as any).getId?.() === 'leftBorder' || (b as any).getLocation?.() === 'left')
    const borderId = (leftBorder as any)?.getId?.()
    if (!borderId) return

    // Calcolo size target del border (pixel)
    const containerWidth = layoutRootRef.current?.clientWidth ?? 1600
    const targetSize = on ? Math.max(800, containerWidth) : 320

    // 1) Allarga/restringe il border sinistro
    m.doAction({
      type: 'FlexLayout_SetBorderSize',
      borderId,
      size: targetSize
    } as any)

    // 2) Schiaccia/ristabilisce il center tabset
    m.doAction({
      type: 'FlexLayout_UpdateNodeAttributes',
      node: 'centerTabset',
      attributes: { weight: on ? 0.0001 : 80 }
    } as any)
  }, [])

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

  // Quando il parent cambia il flag, applichiamo le azioni in ordine
  useEffect(() => {
    applyExplorerFullscreen(isExplorerFullscreen)
  }, [isExplorerFullscreen, applyExplorerFullscreen])

  // Cambio modello (selezione tab compresa) -> notifica quale tab è attiva
  const handleModelChange = (m: Model) => {
    setModel(m)
    if (!onLeftBorderTabChange) return
    const left = m.getBorderSet().getBorders()
      .find(b => (b as any).getLocation?.() === 'left' || (b as any).getId?.() === 'leftBorder')
    const sel = left?.getSelectedNode()
    const comp = sel ? (sel as any).getComponent?.() : undefined
    if (comp) onLeftBorderTabChange(comp)
  }

  const factory = (node: TabNode) => {
    const comp = node.getComponent()
    if (comp === 'explorer') {
      return <div className="w-full h-full overflow-hidden bg-white">{renderExplorer ? renderExplorer() : null}</div>
    }
    if (comp === 'archive') return <div className="w-full h-full overflow-auto bg-slate-50">{renderArchive()}</div>
    if (comp === 'search') return <div className="w-full h-full overflow-auto bg-white">{renderSearch ? renderSearch() : null}</div>
    if (comp === 'persons') return <div className="w-full h-full overflow-auto bg-white">{renderPersons ? renderPersons() : null}</div>
    if (comp === 'contacts') return <div className="w-full h-full overflow-auto bg-white">{renderContacts ? renderContacts() : null}</div>
    if (comp === 'ids') return <div className="w-full h-full overflow-auto bg-white">{renderIds ? renderIds() : null}</div>
    if (comp === 'events') return <div className="w-full h-full overflow-auto bg-white">{renderEvents ? renderEvents() : null}</div>
    if (comp === 'overview') {
      return <div className="w-full h-full overflow-hidden bg-white"><CaseOverviewDiagram graph={baselineGraph as any} peopleIndex={{}} /></div>
    }
    if (comp === 'doc') {
      const cfg = (node.getConfig() || {}) as { docId?: string }
      return <div className="w-full h-full overflow-hidden border-l bg-white">{cfg.docId ? renderDoc(cfg.docId) : <div className="p-4 text-sm text-muted-foreground">(Tavolo) Apri un documento dall'Archivio</div>}</div>
    }
    if (comp === 'tmpdoc') {
      const cfg = (node.getConfig() || {}) as { meta?: { id: string; title: string; content?: string; text?: string; source?: { docId?: string; page?: number; title?: string; x0Pct?:number;x1Pct?:number;y0Pct?:number;y1Pct?:number } } }
      const content = cfg.meta?.text || cfg.meta?.content || 'Estratto in memoria (non ancora salvato)'
      const src: any = cfg.meta?.source || {}
      const docLabel = (typeof src.title === 'string' && src.title.trim()) ? src.title : (src.docId || 'Documento')
      const pageNumRaw = (src.page !== undefined && src.page !== null) ? Number(src.page) : NaN
      const pageStart = Number.isFinite(src?.range?.startPage) ? Math.max(1, Math.floor(Number(src.range.startPage))) : undefined
      const pageEnd = Number.isFinite(src?.range?.endPage) ? Math.max(1, Math.floor(Number(src.range.endPage))) : undefined
      const pageNum = Number.isFinite(pageNumRaw) ? Math.max(1, Math.floor(pageNumRaw)) : (pageStart || undefined)
      const pageLabel = pageStart && pageEnd ? (pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`) : (pageNum ?? '-')
      try { console.log('[TMPDOC][header]', { meta: cfg.meta, src, pageNumRaw, pageNum }) } catch {}
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
                  const box = (src.box && typeof src.box.x0Pct==='number') ? src.box : (typeof src.x0Pct === 'number' && typeof src.y0Pct === 'number' ? { x0Pct: src.x0Pct, x1Pct: src.x1Pct, y0Pct: src.y0Pct, y1Pct: src.y1Pct } : undefined)
                  if (box) detail.box = box
                  try { console.log('[TMPDOC][goto-source][dispatch]', detail) } catch {}
                  window.dispatchEvent(new CustomEvent('app:goto-source', { detail }))
                } catch {}
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

  // Assicura che il modello abbia: border sinistro con Archivio e layout centrale con centerTabset
  function getDefaultModelJson(): IJsonModel {
    return {
      global: {
        tabSetEnableTabStrip: true,
        tabSetHeaderHeight: 28,
        borderBarSize: 28,
      },
      layout: {
        type: 'row',
        children: [ { type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [ { type: 'tab', name: 'Overview', component: 'overview', id: 'overviewTab' } ] } ]
      },
      borders: [
        { type: 'border', location: 'left', size: 320, selected: 0, children: [ { type: 'tab', name: 'Explorer', component: 'explorer', id: 'explorerTab' }, { type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' }, { type: 'tab', name: 'Search', component: 'search', id: 'searchTab' }, { type: 'tab', name: 'Schede Anagrafiche', component: 'persons', id: 'personsTab' }, { type: 'tab', name: 'Contatti', component: 'contacts', id: 'contactsTab' }, { type: 'tab', name: 'Identificativi', component: 'ids', id: 'idsTab' }, { type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' } ] } as any
      ]
    } as IJsonModel
  }

  function sanitizeModelJson(raw: IJsonModel): IJsonModel {
    try {
      const json: any = JSON.parse(JSON.stringify(raw))
      json.global = json.global || {}
      json.global.tabSetEnableTabStrip = true
      json.global.tabSetHeaderHeight = json.global.tabSetHeaderHeight || 28

      // force row root
      if (!json.layout || json.layout.type !== 'row' || !Array.isArray(json.layout.children)) {
        json.layout = getDefaultModelJson().layout
      }

      // ensure center
      let center = findById(json.layout, 'centerTabset')
      if (!center || center.type !== 'tabset') {
        json.layout.children = [ { type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [] } ]
        center = findById(json.layout, 'centerTabset')
      }
      center.enableTabStrip = true

      // ensure left border Archivio/Search
      if (!Array.isArray((json as any).borders)) (json as any).borders = []
      let left = (json as any).borders.find((b: any) => b.location === 'left')
      if (!left) {
        (json as any).borders.push({ type: 'border', location: 'left', size: 320, selected: 0, children: [] })
        left = (json as any).borders.find((b: any) => b.location === 'left')
      }
      // Assicura che l'ID sia presente (per compatibilità con il nostro codice)
      if (!left.id) left.id = 'leftBorder'
      if (!Array.isArray(left.children)) left.children = []
      const hasArchive = left.children.some((t: any) => t.component === 'archive')
      const hasSearch = left.children.some((t: any) => t.component === 'search')
      const hasPersons = left.children.some((t: any) => t.component === 'persons')
      const hasEvents = left.children.some((t: any) => t.component === 'events')
      if (!hasArchive) left.children.push({ type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' })
      if (!hasSearch) left.children.push({ type: 'tab', name: 'Search', component: 'search', id: 'searchTab' })
      if (!hasPersons) left.children.push({ type: 'tab', name: 'Schede Anagrafiche', component: 'persons', id: 'personsTab' })
      if (!hasEvents) left.children.push({ type: 'tab', name: 'Eventi', component: 'events', id: 'eventsTab' })
      if (typeof left.selected !== 'number') left.selected = 0

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

  // Se docs passato è non vuoto e non ci sono tab → aggiungo le prime tab
  useEffect(() => {
    let tabCount = 0
    modelRef.current.visitNodes(n => { if (n.getType() === 'tab' && (n as TabNode).getComponent() === 'doc') tabCount++ })
    if (tabCount === 0 && docs.length > 0) {
      openDoc(docs[0])
    }
  }, [docs])

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

  return (
    <div 
      ref={layoutRootRef}
      className={`dockv2-root ${isExplorerFullscreen ? 'is-explorer-fs' : ''}`}
      style={{ height: '100%', width: '100%', boxSizing: 'border-box', position: 'relative' }}
    >
      <LayoutAny
        model={model}
        factory={factory}
        iconFactory={iconFactory}
        realtimeResize
        onModelChange={handleModelChange}
        
        // Nascondi il centerTabset quando Explorer è fullscreen
        onRenderTabSet={(tabset: any, renderValues: any) => {
          if (tabset.getId?.() === 'centerTabset' && isExplorerFullscreen) {
            renderValues.style = { ...(renderValues.style ?? {}), display: 'none', width: 0, minWidth: 0 }
          }
        }}

        // Allarga visivamente il border sinistro quando in fullscreen
        onRenderBorder={(border: any, renderValues: any) => {
          if ((border.getId?.() === 'leftBorder' || border.getLocation?.() === 'left') && isExplorerFullscreen) {
            renderValues.style = { ...(renderValues.style ?? {}), width: '100%' }
          }
        }}

        // Classe per debug
        className={isExplorerFullscreen ? 'flexlayout--explorer-fs' : undefined}
      />

      {/* CSS minimo, stabile (niente selettori fragili) */}
      <style>
        {`
          .dockv2-root.is-explorer-fs .flexlayout__row {
            width: 100% !important;
          }
          /* Il border sinistro ha classe nota in FlexLayout */
          .dockv2-root.is-explorer-fs .flexlayout__border_left {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            left: 0 !important;
            flex: 1 1 auto !important;
          }
        `}
      </style>
    </div>
  )
})


