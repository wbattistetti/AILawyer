import React, { useCallback, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, useEdgesState, useNodesState, Connection, Edge, Node, OnConnect, MarkerType, addEdge } from 'reactflow'
import 'reactflow/dist/style.css'
import { ToolPalette } from './ToolPalette'
import { BuilderEdge, BuilderNode, BuilderNodeData, RelationKind } from './types'
import EdgeWithTooltip from './EdgeWithTooltip'
import RelationPicker, { getRelationOptions, labelFor } from './RelationPicker'
import { mockPeople, mockCompanies, mockPlaces, mockVehicles } from './mockData'
import NodeView from './NodeView'

export default function GraphBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdge>([])
  const [relPicker, setRelPicker] = useState<{ x:number; y:number; source: Node; target: Node; edgeId?: string } | null>(null)
  const connectEndRef = useRef<{ x:number; y:number } | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  const nodeTypes = useMemo(() => ({ builder: NodeView as any }), [])
  const edgeTypes = useMemo(() => ({ tooltip: EdgeWithTooltip }), [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-node-kind') as BuilderNodeData['kind']
    if (!kind) return
    const rf = (window as any).__rfInstance as any
    let pos = { x: e.clientX, y: e.clientY }
    if (rf?.screenToFlowPosition) {
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      pos = { x: p.x, y: p.y }
    } else {
      const bounds = hostRef.current?.getBoundingClientRect()
      pos = { x: e.clientX - (bounds?.left||0), y: e.clientY - (bounds?.top||0) }
    }
    const id = `n${Date.now()}${Math.floor(Math.random()*1000)}`
    const label = defaultLabelFor(kind)
    const data: BuilderNodeData = { kind, label, nodeId: id }
    // Con nodeOrigin={[0.5,0.5]} la position è il centro del nodo
    const node: BuilderNode = { id, type: 'builder', position: { x: pos.x, y: pos.y }, dragHandle: '.drag-region', data: { ...data, onDelete: () => setNodes(nds => nds.filter(n => n.id !== id)) } }
    setNodes(nds => nds.concat(node))
    // Mock prompt to assign entity
    assignMockRefFor(node)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])

  const onConnect: OnConnect = useCallback((params: Connection) => {
    const source = nodes.find(n => n.id === params.source)
    const target = nodes.find(n => n.id === params.target)
    if (!source || !target || source.id === target.id) return
    const exists = edges.some(e => (e.source === source.id && e.target === target.id) || (e.source === target.id && e.target === source.id))
    if (exists) return
    // 1) create edge immediately
    const newId = `e${source.id}-${target.id}-${Date.now()}`
    setEdges(eds => addEdge({ ...params, id: newId, type: 'tooltip', markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' } }, eds as any) as any)
    // 2) open picker near release point (fallback to midpoint)
    const pane = hostRef.current?.querySelector('.react-flow__pane') as HTMLElement | null
    const pr = pane?.getBoundingClientRect()
    const end = connectEndRef.current
    const px = end && pr ? (end.x - pr.left) : (source.position.x + target.position.x)/2
    const py = end && pr ? (end.y - pr.top) : (source.position.y + target.position.y)/2
    setRelPicker({ x: px, y: py, source: source as any, target: target as any, edgeId: newId })
  }, [nodes, edges])

  const handlePick = (rel: RelationKind) => {
    if (!relPicker) return
    const source = relPicker.source as BuilderNode
    const target = relPicker.target as BuilderNode
    const tooltip = buildTooltip(source, rel, target)
    const dashed = rel === 'socio_occulto' || rel === 'interessi'
    if (relPicker.edgeId) {
      // update existing temporary edge only
      setEdges(eds => eds.map(e => e.id === relPicker.edgeId ? ({
        ...e,
        data: { ...(e.data as any), relation: rel, tooltip, dashed },
      }) as any : e))
    } else {
      const edge: BuilderEdge = {
        id: `e${source.id}-${target.id}-${Date.now()}`,
        source: source.id,
        target: target.id,
        type: 'tooltip',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' },
        data: { relation: rel, tooltip, dashed },
      }
      setEdges(eds => eds.concat(edge))
    }
    setRelPicker(null)
  }

  // Open relation picker when clicking the pencil on an edge caption
  React.useEffect(() => {
    const onEdit = (e: any) => {
      const d = e?.detail || {}
      const source = nodes.find(n => n.id === d.sourceId) as BuilderNode | undefined
      const target = nodes.find(n => n.id === d.targetId) as BuilderNode | undefined
      if (!source || !target) return
      setRelPicker({ x: d.x, y: d.y, source: source as any, target: target as any, edgeId: d.edgeId })
    }
    window.addEventListener('gb:edit-edge', onEdit as any)
    return () => window.removeEventListener('gb:edit-edge', onEdit as any)
  }, [nodes])

  // Center nodes after first render with measured size
  React.useEffect(() => {
    const onCenter = (e: any) => {
      const { id, width, height, center } = e?.detail || {}
      if (!id || !width || !height || !center) return
      setNodes(nds => nds.map(n => n.id === id ? ({ ...n, position: { x: center.x - width/2, y: center.y - height/2 }, data: { ...(n.data as any), centerAt: undefined } }) as any : n))
    }
    window.addEventListener('gb:center-node', onCenter as any)
    return () => window.removeEventListener('gb:center-node', onCenter as any)
  }, [])

  // Rename node handler (inline only)
  React.useEffect(() => {
    const onRename = (e: any) => {
      const { id, newLabel, fullText } = e?.detail || {}
      if (!id) return
      if (typeof fullText === 'string') {
        const [nameLine, ...rest] = fullText.split('\n')
        const block = rest.join('\n')
        setNodes(nds => nds.map(n => n.id === id ? ({ ...n, data: { ...(n.data as any), label: nameLine, labelBlock: block } }) as any : n))
        return
      }
      if (typeof newLabel === 'string') {
        setNodes(nds => nds.map(n => n.id === id ? ({ ...n, data: { ...(n.data as any), label: newLabel } }) as any : n))
      }
    }
    window.addEventListener('gb:rename-node', onRename as any)
    return () => window.removeEventListener('gb:rename-node', onRename as any)
  }, [])

  // Delete edge handler
  React.useEffect(() => {
    const onDel = (e: any) => {
      const { id } = e?.detail || {}
      if (!id) return
      setEdges(eds => eds.filter(e => e.id !== id) as any)
      // chiudi relation picker se riferito a edge rimosso
      setRelPicker(r => (r && r.edgeId && r.edgeId === id) ? null : r)
    }
    window.addEventListener('gb:delete-edge', onDel as any)
    const onEdgeStyle = (ev: any) => {
      const { id, data } = ev?.detail || {}
      if (!id || !data) return
      setEdges(eds => eds.map(e => {
        if (e.id !== id) return e as any
        const nextMarker = { ...(e.markerEnd as any), type: MarkerType.ArrowClosed, color: (data.strokeColor ?? (e as any).data?.strokeColor ?? '#0f172a') }
        return ({ ...e, markerEnd: nextMarker, data: { ...(e.data as any), ...data } }) as any
      }))
    }
    window.addEventListener('gb:edge-style', onEdgeStyle as any)
    return () => { window.removeEventListener('gb:delete-edge', onDel as any); window.removeEventListener('gb:edge-style', onEdgeStyle as any) }
  }, [])

  // Style preview/apply for nodes
  React.useEffect(() => {
    const onPrev = (e: any) => {
      const { id, style } = e?.detail || {}
      if (!id) return
      setNodes(nds => nds.map(n => n.id === id ? ({ ...n, data: { ...(n.data as any), style } }) as any : n))
    }
    const onApply = (e: any) => {
      const { id, style } = e?.detail || {}
      if (!id) return
      setNodes(nds => nds.map(n => n.id === id ? ({ ...n, data: { ...(n.data as any), style } }) as any : n))
    }
    const onCommit = (_e: any) => { /* noop per ora: già applicato live */ }
    window.addEventListener('gb:style-preview', onPrev as any)
    window.addEventListener('gb:style-apply', onApply as any)
    window.addEventListener('gb:style-commit', onCommit as any)
    return () => {
      window.removeEventListener('gb:style-preview', onPrev as any)
      window.removeEventListener('gb:style-apply', onApply as any)
      window.removeEventListener('gb:style-commit', onCommit as any)
    }
  }, [])

  return (
    <div className="w-full h-full flex">
      <ToolPalette />
      <div ref={hostRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges as unknown as Edge[]}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={() => { try { window.dispatchEvent(new CustomEvent('gb:connecting', { detail: { on: true } })) } catch {} }}
          onPaneClick={() => { try { window.dispatchEvent(new CustomEvent('gb:hide-resize')) } catch {}; setRelPicker(null) }}
          onConnectEnd={(e) => {
            try { window.dispatchEvent(new CustomEvent('gb:connecting', { detail: { on: false } })) } catch {}
            const anyE: any = e
            const cx = anyE?.clientX ?? anyE?.changedTouches?.[0]?.clientX
            const cy = anyE?.clientY ?? anyE?.changedTouches?.[0]?.clientY
            if (typeof cx === 'number' && typeof cy === 'number') connectEndRef.current = { x: cx, y: cy }
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={false}
          proOptions={{ hideAttribution: true }}
          onInit={(inst:any) => { (window as any).__rfInstance = inst }}
          nodeOrigin={[0.5, 0.5]}
          onNodesDelete={(nds)=>{ 
            // chiudi eventuale relation picker se i nodi associati non esistono più
            if (relPicker) {
              const still = nodes.some(n => n.id === relPicker.source.id) && nodes.some(n => n.id === relPicker.target.id)
              if (!still) setRelPicker(null)
            }
          }}
          defaultEdgeOptions={{ type: 'straight', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1, stroke: '#0f172a' } }}
          connectionLineType="straight"
          connectionLineStyle={{ strokeWidth: 1, stroke: '#0f172a' }}
          connectionMode="loose"
          nodesDraggable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          isValidConnection={(conn)=>{
            // allow on any target node area; prevent self connection and duplicates
            if (!conn.source || !conn.target || conn.source === conn.target) return false
            const exists = edges.some(e => (e.source === conn.source && e.target === conn.target) || (e.source === conn.target && e.target === conn.source))
            return !exists
          }}
        >
          <Background gap={16} color="#eef2f7" />
          <MiniMap />
          <Controls />
        </ReactFlow>
        {relPicker && (
          <div style={{ position:'absolute', left: relPicker.x, top: relPicker.y, zIndex: 50 }}>
            <RelationPicker
              sourceName={(relPicker.source.data as any)?.label || relPicker.source.id}
              targetName={(relPicker.target.data as any)?.label || relPicker.target.id}
              sourceKind={(relPicker.source.data as any).kind}
              targetKind={(relPicker.target.data as any).kind}
              options={getRelationOptions((relPicker.source.data as any).kind, (relPicker.target.data as any).kind)}
              onPick={(rel)=>{
                handlePick(rel)
                // update temp edge data
                if (relPicker.edgeId) setEdges(eds => eds.map(e => e.id === relPicker.edgeId ? ({ ...e, data: { ...(e.data||{}), relation: rel, tooltip: buildTooltip(relPicker.source as any, rel, relPicker.target as any) } as any }) : e))
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function defaultLabelFor(kind: BuilderNodeData['kind']): string {
  switch (kind) {
    case 'male': return 'Uomo'
    case 'female': return 'Donna'
    case 'company': return 'Impresa'
    case 'meeting': return 'Incontro'
    case 'bar': return 'Bar'
    case 'restaurant': return 'Ristorante'
    case 'vehicle': return 'Veicolo'
    case 'motorcycle': return 'Moto'
    case 'other_investigation': return 'Altra indagine\nDel:'
    default: return 'Nodo'
  }
}

function assignMockRefFor(node: BuilderNode) {
  const kind = node.data.kind
  if (kind === 'male' || kind === 'female') {
    const pool = mockPeople.filter(p => (kind === 'male' ? p.sex === 'M' : p.sex === 'F'))
    const pick = pool[Math.floor(Math.random()*pool.length)]
    node.data.refId = pick?.id; node.data.label = pick?.name || node.data.label; node.data.details = { dob: pick?.dob, hasPs: !!pick?.hasPs }
  } else if (kind === 'company') {
    const pick = mockCompanies[Math.floor(Math.random()*mockCompanies.length)]
    node.data.refId = pick?.id; node.data.label = pick?.name || node.data.label
  } else if (kind === 'bar' || kind === 'restaurant') {
    const pool = kind === 'bar' ? mockPlaces.bar : mockPlaces.restaurant
    const pick = pool[Math.floor(Math.random()*pool.length)]
    node.data.refId = pick?.id; node.data.label = pick?.name || node.data.label
  } else if (kind === 'vehicle' || kind === 'motorcycle') {
    const pick = mockVehicles[Math.floor(Math.random()*mockVehicles.length)]
    node.data.refId = pick?.id; node.data.label = pick?.name || node.data.label
  }
}

function buildTooltip(source: BuilderNode, rel: RelationKind, target: BuilderNode): string {
  const s = (source.data.label || source.id)
  const t = (target.data.label || target.id)
  const text = labelFor(rel)
  // Map directional for readability
  // Esempio: "Marco Padre di Antonio", "Marco Rappresentante legale di ENOTECA TELARO"
  return `${s} ${text} ${rel.includes('di') ? '' : 'di'} ${t}`.replace(/\s+/g,' ').trim()
}


