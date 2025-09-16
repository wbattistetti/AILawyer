import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Layout, Actions, Model, TabNode, IJsonModel, DockLocation } from 'flexlayout-react'
import { Circle, CircleDot } from 'lucide-react'
import 'flexlayout-react/style/light.css'
import './DockWorkspace.css'

type DocTab = { id: string; title: string }

type Props = {
  docs: DocTab[]
  renderDoc: (docId: string) => JSX.Element | null
  storageKey?: string
  useExternalStrip?: boolean
}

export type DockWorkspaceHandle = {
  selectDoc: (docId: string) => void
  closeDoc: (docId: string) => void
  startDragNewView: (docId: string, title: string) => void
  maximizeDoc: (docId: string) => void
}

export const DockWorkspace = forwardRef<DockWorkspaceHandle, Props>(function DockWorkspace({ docs, renderDoc, storageKey = 'ws_dock_layout', useExternalStrip = false }, ref) {
  const sanitizeLayout = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'tabset') {
      node.enableTabStrip = true
    }
    if (Array.isArray(node.children)) node.children.forEach(sanitizeLayout)
  }
  const initialJson: IJsonModel = useMemo(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Use native strip: enable tab headers and keep top border
        parsed.global = {
          ...(parsed.global || {}),
          tabSetEnableTabStrip: true,
          tabSetHeaderHeight: 28,
          borderBarSize: 24
        }
        // Ensure a TOP border exists
        if (!Array.isArray(parsed.borders)) parsed.borders = []
        const hasTop = parsed.borders.some((b: any) => (b.location || b._location) === 'top')
        if (!hasTop) parsed.borders.push({ type: 'border', location: 'top', children: [] })
        sanitizeLayout(parsed.layout)
        return parsed
      } catch {}
    }
    return {
      global: {
        tabSetEnableTabStrip: true,
        tabSetHeaderHeight: 28,
        borderBarSize: 24
      },
      layout: {
        type: 'row',
        children: [
          {
            type: 'tabset',
            children: []
          }
        ]
      },
      borders: [
        {
          type: 'border',
          location: 'top',
          children: []
        }
      ]
    } as IJsonModel
  }, [storageKey])

  const [model, setModel] = useState(() => Model.fromJson(initialJson))
  const modelRef = useRef(model)
  modelRef.current = model
  const layoutRef = useRef<any>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState<number>(0)

  // Persist layout on every change
  useEffect(() => {
    const json = model.toJson()
    try { localStorage.setItem(storageKey, JSON.stringify(json)) } catch {}
    // derive selected doc id safely
    let sel: string | null = null
    const anyModel: any = model
    anyModel.visitNodes((n: any) => {
      if (n.getType && n.getType() === 'tabset') {
        const sn = n.getSelectedNode ? n.getSelectedNode() : null
        const cfg = sn?.getConfig ? sn.getConfig() : undefined
        if (!sel && cfg?.docId) sel = cfg.docId as string
      }
    })
    setSelectedDocId(sel)
  }, [model, storageKey])

  // Ensure tabs for provided docs exist (prefer top border as global strip)
  useEffect(() => {
    // If the current model has no tabs at all, bootstrap a new model containing all docs
    let tabCount = 0
    modelRef.current.visitNodes((n) => { if (n.getType() === 'tab') tabCount++ })
    if (tabCount === 0 && docs.length > 0) {
      const json: IJsonModel = modelRef.current.toJson() as any
      const top = (json.borders || []).find((b:any)=>b.location==='top')
      if (top) {
        top.children = docs.map(d => ({ type: 'tab', name: d.title, component: 'doc', config: { docId: d.id } }))
      }
      setModel(Model.fromJson(json))
      return
    }
    const existing = new Set<string>()
    modelRef.current.visitNodes((n) => {
      if (n.getType() === 'tab') {
        const cfg = (n as TabNode).getConfig() as any
        if (cfg?.docId) existing.add(cfg.docId as string)
      }
    })
    const missing = docs.filter(d => !existing.has(d.id))
    if (missing.length) {
      // Add missing tabs to TOP border
      const borders: any = (modelRef.current as any).getBorderSet?.().getBorders?.() || []
      const topBorder = borders.find((b: any) => (b.getLocation?.() || b._location) === 'top' || (b.getLocation?.() === DockLocation.TOP))
      const toId = topBorder ? topBorder.getId() : modelRef.current.getRoot().getId()
      missing.forEach(d => {
        const action = Actions.addNode(
          { type: 'tab', name: d.title, component: 'doc', config: { docId: d.id } },
          toId,
          DockLocation.TOP,
          -1
        )
        modelRef.current.doAction(action)
      })
      // Seleziona la prima tab appena aggiunta
      const json = modelRef.current.toJson() as any
      const borderTop = (json.borders || []).find((b:any)=>b.location==='top')
      const firstId = borderTop?.children?.[borderTop.children.length-1]?.id
      if (firstId) {
        try { modelRef.current.doAction(Actions.selectTab(firstId)) } catch {}
      }
      setModel(Model.fromJson(modelRef.current.toJson()))
    }
  }, [docs])

  // Measure global sticky header height and expose as CSS variable for proper offset
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('.border-b.bg-white.sticky.top-0') as HTMLElement | null
      const h = header ? Math.ceil(header.getBoundingClientRect().height) : 0
      setHeaderHeight(h)
      document.documentElement.style.setProperty('--app-header-h', `${h}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const factory = (node: TabNode) => {
    const cfg = (node.getConfig() || {}) as { docId?: string }
    const docId = cfg.docId
    if (!docId) return null
    return renderDoc(docId) as JSX.Element
  }

  // selection/close handled by internal tab strip

  const selectDoc = (docId: string) => {
    let tabId: string | null = null
    modelRef.current.visitNodes((n) => {
      if (n.getType() === 'tab') {
        const cfg = (n as TabNode).getConfig() as any
        if (cfg?.docId === docId) tabId = n.getId()
      }
    })
    if (tabId) modelRef.current.doAction(Actions.selectTab(tabId))
    setModel(Model.fromJson(modelRef.current.toJson()))
  }

  const closeDoc = (docId: string) => {
    const toDelete: string[] = []
    modelRef.current.visitNodes((n) => {
      if (n.getType() === 'tab') {
        const cfg = (n as TabNode).getConfig() as any
        if (cfg?.docId === docId) toDelete.push(n.getId())
      }
    })
    toDelete.forEach(id => modelRef.current.doAction(Actions.deleteTab(id)))
    setModel(Model.fromJson(modelRef.current.toJson()))
  }

  const startDragNewView = (docId: string, title: string) => {
    if (!layoutRef.current) return
    const json = { type: 'tab', name: title, component: 'doc', config: { docId } }
    layoutRef.current.addTabWithDragAndDrop(title, json, () => {})
  }

  const maximizeDoc = (docId: string) => {
    const tabs = docs.map(d => ({ type: 'tab', name: d.title, component: 'doc', config: { docId: d.id } })) as any
    const selectedIndex = Math.max(0, docs.findIndex(d => d.id === docId))
    const json: IJsonModel = {
      global: { tabSetEnableTabStrip: true, tabSetHeaderHeight: 28, borderBarSize: 24 },
      layout: {
        type: 'row',
        children: [
          {
            type: 'tabset',
            children: tabs,
            selected: selectedIndex
          } as any
        ]
      }
    }
    const m = Model.fromJson(json)
    setModel(m)
    // ensure selected after mount
    setTimeout(() => selectDoc(docId), 0)
  }

  useImperativeHandle(ref, () => ({ selectDoc, closeDoc, startDragNewView, maximizeDoc }))

  return (
    <div className="dock-root" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {!useExternalStrip && (
        <div ref={stripRef} className="dock-strip flex items-center justify-start gap-2 overflow-x-auto px-2">
          {docs.map(d => (
            <div key={d.id} className={`dock-tab flex items-center gap-2 px-3 py-1 rounded cursor-pointer whitespace-nowrap ${selectedDocId===d.id?'bg-muted font-medium':'hover:bg-muted'}`}
                 onClick={() => selectDoc(d.id)}
                 onMouseDown={(e) => { if (e.button===0) startDragNewView(d.id, d.title); e.preventDefault() }}
                 onDoubleClick={() => maximizeDoc(d.id)}>
              {selectedDocId===d.id ? <CircleDot size={14} /> : <Circle size={14} className="opacity-60" />}
              <span className="max-w-[14rem] truncate" contentEditable={false} draggable={false} style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', MozUserSelect: 'none' }}>{d.title}</span>
              <button className="text-xs opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); closeDoc(d.id) }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="dock-body">
        <Layout
          ref={layoutRef}
          model={model}
          factory={factory}
          realtimeResize
          onModelChange={(m) => setModel(m)}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  )
})


