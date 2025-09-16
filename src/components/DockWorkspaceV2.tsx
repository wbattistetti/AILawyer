import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Layout, Model, TabNode, IJsonModel } from 'flexlayout-react'
import 'flexlayout-react/style/light.css'
import './DockWorkspaceV2.css'

type DocTab = { id: string; title: string }

type Props = {
  docs: DocTab[]
  renderArchive: () => React.ReactNode
  renderDoc: (docId: string) => React.ReactNode
  storageKey?: string
}

export type DockWorkspaceV2Handle = {
  openDoc: (doc: DocTab) => void
}

export const DockWorkspaceV2 = forwardRef<DockWorkspaceV2Handle, Props>(function DockWorkspaceV2({ docs, renderArchive, renderDoc, storageKey = 'ws_dock_v2' }, ref) {
  const LayoutAny = Layout as any
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

  useImperativeHandle(ref, () => ({ openDoc }))

  const factory = (node: TabNode) => {
    const comp = node.getComponent()
    if (comp === 'archive') return <div className="w-full h-full overflow-auto bg-slate-50">{renderArchive()}</div>
    if (comp === 'doc') {
      const cfg = (node.getConfig() || {}) as { docId?: string }
      return <div className="w-full h-full overflow-hidden border-l bg-white">{cfg.docId ? renderDoc(cfg.docId) : <div className="p-4 text-sm text-muted-foreground">(Tavolo) Apri un documento dall'Archivio</div>}</div>
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
        children: [ { type: 'tabset', id: 'centerTabset', enableTabStrip: true, weight: 80, children: [] } ]
      },
      borders: [
        { type: 'border', location: 'left', size: 300, selected: 0, children: [ { type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' } ] }
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

      // ensure left border Archivio
      if (!Array.isArray((json as any).borders)) (json as any).borders = []
      let left = (json as any).borders.find((b: any) => b.location === 'left')
      if (!left) {
        (json as any).borders.push({ type: 'border', location: 'left', size: 300, selected: 0, children: [] })
        left = (json as any).borders.find((b: any) => b.location === 'left')
      }
      if (!Array.isArray(left.children) || left.children.length === 0 || left.children.every((t: any) => t.component !== 'archive')) {
        left.children = [ { type: 'tab', name: 'Archivio', component: 'archive', id: 'archiveTab' } ]
        left.selected = 0
      }

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

  return (
    <div className="dockv2-root" style={{ height: '100%', width: '100%', boxSizing: 'border-box' }}>
      <LayoutAny
        model={model}
        factory={factory}
        realtimeResize
        onModelChange={(m: Model) => setModel(m)}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
})


