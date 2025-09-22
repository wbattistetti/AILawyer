import React, { useMemo, useRef, useEffect, useState } from 'react'
import type { CaseGraph } from '../types/graph'
import { computeBlockStatus } from '../utils/blockStatus'
// import { layoutRadial } from '../utils/layoutRadial'
import { NodeBlock } from './NodeBlock'
import ReactFlow, { Background, MiniMap, Controls, Node as RFNode, Edge as RFEdge, useNodesState, useEdgesState } from 'reactflow'
import RightEditorPanel from './RightEditorPanel'
import StarEdge from './EdgeLink'

export function GraphCanvas({ graph }: { graph: CaseGraph }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 })
  const [editingNode, setEditingNode] = useState<any | null>(null)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const statuses = useMemo(() => computeBlockStatus(graph, []), [graph])

  // Star layout: center node 'soggetto' at center; others on a circle
  const positions = useMemo(() => {
    const centerId = graph.nodes.find(n => n.id === 'soggetto')?.id || graph.nodes[0]?.id
    const cx = size.width / 2
    const cy = size.height / 2
    const others = graph.nodes.filter(n => n.id !== centerId)
    const r = Math.max(120, Math.min(size.width, size.height) * 0.35)
    const pos: Record<string, { x: number; y: number }> = {}
    // center
    if (centerId) pos[centerId] = { x: cx, y: cy }
    // ring
    others.forEach((n, i) => {
      const ang = (2 * Math.PI * i) / Math.max(1, others.length)
      pos[n.id] = { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) }
    })
    return pos
  }, [graph, size])

  const colorFor = (label?: string) => {
    const s = (label || '').toLowerCase()
    // people-related
    if (s.includes('avvocati') || s.includes('elenco nomi') || s.includes('anagrafe ent')) return '#3b82f6' // blue
    // events-related
    if (s.includes('atti ed eventi') || s.includes('incontri') || s.includes('intercett')) return '#ec4899' // pink
    // documents: verbali
    if (s.includes('verbale')) return '#f59e0b' // amber
    // defense acts
    if (s.includes('difens')) return '#10b981' // emerald
    return '#64748b' // slate
  }

  const initialNodes: RFNode[] = useMemo(() => graph.nodes.map(n => {
    const p = positions[n.id] || { x: Math.random()*size.width, y: Math.random()*size.height }
    const col = colorFor(n.label)
    const badge = statuses[n.id]?.count || 0
    return {
      id: n.id,
      position: { x: p.x - 80, y: p.y - 40 },
      data: { node: n, color: col, count: badge, active: badge > 0 },
      type: 'custom',
      draggable: true
    }
  }), [graph, positions, statuses, size])

  const initialEdges: RFEdge[] = useMemo(() => {
    const centerId = graph.nodes.find(n => n.id === 'soggetto')?.id || graph.nodes[0]?.id
    const edges: RFEdge[] = []
    if (centerId) {
      for (const n of graph.nodes) {
        if (n.id === centerId) continue
        // from visual center of the central node → visual center of destination, but arrow will visually stop at border
        edges.push({ id: `star-${n.id}`, source: centerId, target: n.id, type: 'star', sourceHandle: 'center', targetHandle: 'center', markerEnd: { type: 'arrowclosed' as const, width: 20, height: 20 } })
      }
    }
    return edges
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges) }, [initialNodes, initialEdges, setNodes, setEdges])

  // Stable renderer and nodeTypes to avoid React Flow warnings (error#002)
  const NodeRenderer = useMemo(() => {
    return ({ data }: any) => (
      <NodeBlock node={data.node} color={data.color} count={data.count} />
    )
  }, [])
  const nodeTypes = useMemo(() => ({ custom: NodeRenderer }), [NodeRenderer])
  const edgeTypes = useMemo(() => ({ star: StarEdge }), [])
  const defaultEdgeOptions = useMemo(() => ({ animated: false as const, type: 'straight' as const }), [])

  return (
    <div ref={hostRef} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={(_, n) => setEditingNode((n as any).data.node)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        selectionOnDrag={false}
        zoomOnScroll={true}
      >
        <Background gap={16} color="#f1f5f9" />
        <MiniMap pannable zoomable />
        <Controls showInteractive={true} />
      </ReactFlow>
      <RightEditorPanel node={editingNode} onClose={() => setEditingNode(null)} />
    </div>
  )
}


