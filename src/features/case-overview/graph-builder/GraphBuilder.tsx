import React, { useCallback, useMemo, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useEdgesState, useNodesState, Connection, Edge, Node, OnConnect, MarkerType, addEdge, type Viewport } from 'reactflow'
import 'reactflow/dist/style.css'
import { getEntityDraft, subscribeEntityDraft } from '../../generic-entities/entity-draft-store'
import { getPersonDraft, subscribePersonDraft } from '../../entities/person-draft-store'
import { getEntityLabel } from '../../entity-visual-catalog'
import { api } from '../../../lib/api'
import { ToolPalette } from './ToolPalette'
import { BuilderEdge, BuilderEdgeData, BuilderNode, BuilderNodeData, NodeKind, RelationKind } from './types'
import EdgeWithTooltip from './EdgeWithTooltip'
import RelationPicker, { getRelationOptions, type RelationPick } from './RelationPicker'
import EntityPicker from './EntityPicker'
import DestinationCategoryPicker, { type DestinationCategoryPick } from './DestinationCategoryPicker'
import {
  buildGraphEntityCatalog,
  filterCatalogByPaletteKind,
  requiresEntitySelection,
  type GraphEntityOption,
} from './graph-entity-catalog'
import { formatRelationPhrase } from './relation-phrase'
import NodeView from './NodeView'
import {
  deserializeGraph,
  graphContentSignature,
  serializeGraphContent,
  type GraphContent,
  type SavedGraph,
} from './graphSerialization'

/** Attesa dopo l'ultima modifica prima di propagare il contenuto al catalogo. */
const CONTENT_SYNC_DEBOUNCE_MS = 400

const EMPTY_GRAPH_CONTENT: GraphContent = { viewport: undefined, nodes: [], edges: [] }

export type GraphBuilderProps = {
  praticaId?: string
  /** Assente per il canvas di sola consultazione: senza id non si persiste. */
  graphId?: string
  /** Contenuto iniziale, letto solo alla costruzione: montare con `key={graphId}`. */
  savedGraph?: SavedGraph | null
  /** Notifica il catalogo quando nodi/edge cambiano: è lì che il grafo vive. */
  onGraphContentChange?: (graphId: string, content: GraphContent) => void
}

export type GraphBuilderHandle = {
  /** Contenuto corrente del canvas, senza attendere il debounce. */
  getContent: () => GraphContent | null
}

const GraphBuilderInner = forwardRef<GraphBuilderHandle, GraphBuilderProps>(({ praticaId, graphId, savedGraph, onGraphContentChange }, ref) => {
  const setNodesRef = useRef<((updater: (nodes: BuilderNode[]) => BuilderNode[]) => void) | null>(null)
  const removeNodeById = useCallback((nodeId: string) => {
    setNodesRef.current?.(nds => nds.filter(n => n.id !== nodeId))
  }, [])
  // Idratazione alla costruzione: il canvas nasce già con il contenuto del
  // catalogo, quindi nessun aggiornamento successivo può azzerarlo.
  const initialGraph = useMemo(
    () => deserializeGraph(savedGraph ?? EMPTY_GRAPH_CONTENT, removeNodeById),
    // Volutamente calcolato una sola volta: l'istanza è legata a un graphId fisso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNodeData>(initialGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdgeData>(initialGraph.edges)
  setNodesRef.current = setNodes
  const [relPicker, setRelPicker] = useState<{ x:number; y:number; source: Node; target: Node; edgeId?: string } | null>(null)
  const [entityPicker, setEntityPicker] = useState<{
    x: number
    y: number
    pendingNodeId: string
    paletteKind: NodeKind
    options: GraphEntityOption[]
  } | null>(null)
  const [destinationPicker, setDestinationPicker] = useState<{
    x: number
    y: number
    sourceId: string
    pendingNodeId: string
    edgeId: string
  } | null>(null)
  const destinationPickerRef = useRef(destinationPicker)
  destinationPickerRef.current = destinationPicker
  const [entityCatalog, setEntityCatalog] = useState<GraphEntityOption[]>([])
  const connectEndRef = useRef<{ x:number; y:number } | null>(null)
  const connectSourceRef = useRef<string | null>(null)
  const connectionSucceededRef = useRef(false)
  /** Skip the pane click that follows mouseup after dropping a link on empty canvas. */
  const suppressPaneClickRef = useRef(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef<any>(null)
  /** Viewport salvato, applicato appena ReactFlow è pronto (`onInit`). */
  const pendingViewportRef = useRef<Viewport | null>(initialGraph.viewport ?? null)
  /** Ultimo contenuto propagato al catalogo, per non ripubblicare lo stesso stato. */
  const publishedSignatureRef = useRef<string>(
    graphContentSignature(serializeGraphContent(initialGraph.nodes, initialGraph.edges, initialGraph.viewport)),
  )
  const liveGraphRef = useRef<{ nodes: BuilderNode[]; edges: BuilderEdge[] }>({
    nodes: initialGraph.nodes,
    edges: initialGraph.edges,
  })
  const contentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshEntityCatalog = useCallback(async () => {
    if (!praticaId) {
      setEntityCatalog([])
      return
    }
    let persons = getPersonDraft(praticaId)?.persons ?? []
    let entities = getEntityDraft(praticaId)?.entities ?? []
    if (persons.length === 0 || entities.length === 0) {
      const [remotePersons, remoteEntities] = await Promise.all([
        persons.length === 0 ? api.getPracticePersons(praticaId).catch(() => ({ persons: [] })) : Promise.resolve(null),
        entities.length === 0 ? api.getPracticeEntities(praticaId).catch(() => ({ entities: [] })) : Promise.resolve(null),
      ])
      if (remotePersons) persons = remotePersons.persons
      if (remoteEntities) entities = remoteEntities.entities
    }
    setEntityCatalog(buildGraphEntityCatalog(persons, entities))
  }, [praticaId])

  useEffect(() => {
    void refreshEntityCatalog()
  }, [refreshEntityCatalog])

  useEffect(() => {
    if (!praticaId) return
    const sync = () => { void refreshEntityCatalog() }
    const unsubPersons = subscribePersonDraft(sync)
    const unsubEntities = subscribeEntityDraft(sync)
    return () => {
      unsubPersons()
      unsubEntities()
    }
  }, [praticaId, refreshEntityCatalog])
  
  /** Snapshot corrente del canvas, allineato alla forma persistita. */
  const readContent = useCallback((): GraphContent => serializeGraphContent(
    liveGraphRef.current.nodes,
    liveGraphRef.current.edges,
    reactFlowInstanceRef.current?.getViewport() ?? pendingViewportRef.current ?? undefined,
  ), [])

  /** Propaga il contenuto al catalogo, se davvero cambiato rispetto all'ultimo invio. */
  const publishContent = useCallback(() => {
    if (!graphId || !onGraphContentChange) return
    const content = readContent()
    const signature = graphContentSignature(content)
    if (signature === publishedSignatureRef.current) return
    publishedSignatureRef.current = signature
    onGraphContentChange(graphId, content)
  }, [graphId, onGraphContentChange, readContent])

  const publishContentRef = useRef(publishContent)
  useEffect(() => {
    publishContentRef.current = publishContent
  }, [publishContent])

  // Debounce delle modifiche: durante il trascinamento si pubblica una volta sola.
  useEffect(() => {
    liveGraphRef.current = { nodes, edges }
    if (contentSyncTimerRef.current) clearTimeout(contentSyncTimerRef.current)
    contentSyncTimerRef.current = setTimeout(() => {
      contentSyncTimerRef.current = null
      publishContentRef.current()
    }, CONTENT_SYNC_DEBOUNCE_MS)
  }, [nodes, edges])

  // Alla chiusura della tab il canvas viene smontato: l'ultimo stato deve
  // arrivare al catalogo prima che lo state locale sparisca.
  useEffect(() => () => {
    if (contentSyncTimerRef.current) clearTimeout(contentSyncTimerRef.current)
    publishContentRef.current()
  }, [])

  useImperativeHandle(ref, () => ({
    getContent: () => (graphId ? readContent() : null),
  }), [graphId, readContent])

  const nodeTypes = useMemo(() => ({ builder: NodeView as any }), [])
  const edgeTypes = useMemo(() => ({ tooltip: EdgeWithTooltip }), [])
  const existingEntityRefIds = useMemo(
    () => new Set(nodes.flatMap(node => node.data.refId ? [node.data.refId] : [])),
    [nodes],
  )

  const associateNodeWithOption = useCallback((
    nodeId: string,
    option: GraphEntityOption,
  ) => {
    const labelBlock = buildLabelBlock(option)
    setNodes(currentNodes => currentNodes.map(node => node.id === nodeId ? {
      ...node,
      data: {
        ...node.data,
        kind: option.kind,
        label: option.label,
        labelBlock,
        refId: option.id,
        details: option.details,
      },
    } : node))
  }, [setNodes])

  const createBlankNode = useCallback((
    kind: NodeKind,
    flowPos: { x: number; y: number },
    startEditing = true,
    labelOverride?: string,
  ): string => {
    const id = `n${Date.now()}${Math.floor(Math.random()*1000)}`
    const data: BuilderNodeData = {
      kind,
      label: labelOverride ?? defaultLabelFor(kind),
      nodeId: id,
      startEditing,
    }
    const node: BuilderNode = {
      id,
      type: 'builder',
      position: { x: flowPos.x, y: flowPos.y },
      dragHandle: '.drag-region',
      data: {
        ...data,
        onDelete: () => setNodes(nds => nds.filter(n => n.id !== id)),
      },
    }
    setNodes(nds => nds.concat(node))
    return id
  }, [setNodes])

  const cancelDestinationPicker = useCallback(() => {
    const current = destinationPickerRef.current
    setDestinationPicker(null)
    if (!current) return
    setNodes(nds => nds.filter(n => n.id !== current.pendingNodeId))
    setEdges(eds => eds.filter(e => e.id !== current.edgeId) as any)
  }, [setNodes, setEdges])

  const openRelationPickerForEdge = useCallback((
    sourceId: string,
    targetId: string,
    edgeId: string,
    pickerX: number,
    pickerY: number,
    targetOverride?: Partial<BuilderNodeData>,
  ) => {
    const source = nodes.find(n => n.id === sourceId)
    const target = nodes.find(n => n.id === targetId)
    if (!source || !target) return
    const nextTarget = targetOverride
      ? { ...target, data: { ...target.data, ...targetOverride } }
      : target
    setRelPicker({
      x: pickerX,
      y: pickerY,
      source: source as any,
      target: nextTarget as any,
      edgeId,
    })
  }, [nodes])

  const applyDestinationPick = useCallback((pick: DestinationCategoryPick) => {
    if (!destinationPicker) return
    const { pendingNodeId, sourceId, edgeId, x, y } = destinationPicker

    if (pick.type === 'blank') {
      const label = defaultLabelFor(pick.kind)
      setNodes(nds => nds.map(n => n.id === pendingNodeId ? {
        ...n,
        data: {
          ...n.data,
          kind: pick.kind,
          label,
          startEditing: true,
          refId: undefined,
          labelBlock: undefined,
          details: undefined,
        },
      } : n))
      setDestinationPicker(null)
      openRelationPickerForEdge(sourceId, pendingNodeId, edgeId, x, y, {
        kind: pick.kind,
        label,
        startEditing: true,
      })
      return
    }

    const labelBlock = buildLabelBlock(pick.option)
    associateNodeWithOption(pendingNodeId, pick.option)
    setDestinationPicker(null)
    openRelationPickerForEdge(sourceId, pendingNodeId, edgeId, x, y, {
      kind: pick.option.kind,
      label: pick.option.label,
      labelBlock: labelBlock ?? undefined,
      refId: pick.option.id,
      details: pick.option.details,
    })
  }, [destinationPicker, associateNodeWithOption, openRelationPickerForEdge, setNodes])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-node-kind') as NodeKind
    if (!kind) return
    const rf = (window as any).__rfInstance as any
    let flowPos = { x: e.clientX, y: e.clientY }
    if (rf?.screenToFlowPosition) {
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      flowPos = { x: p.x, y: p.y }
    } else {
      const bounds = hostRef.current?.getBoundingClientRect()
      flowPos = { x: e.clientX - (bounds?.left||0), y: e.clientY - (bounds?.top||0) }
    }
    const pane = hostRef.current?.querySelector('.react-flow__pane') as HTMLElement | null
    const pr = pane?.getBoundingClientRect()
    const pickerX = pr ? e.clientX - pr.left : flowPos.x
    const pickerY = pr ? e.clientY - pr.top : flowPos.y

    if (!requiresEntitySelection(kind)) {
      createBlankNode(kind, flowPos)
      return
    }

    setRelPicker(null)
    const pendingNodeId = createBlankNode(kind, flowPos, false)
    setEntityPicker({
      x: pickerX,
      y: pickerY,
      pendingNodeId,
      paletteKind: kind,
      options: filterCatalogByPaletteKind(entityCatalog, kind),
    })
  }, [createBlankNode, entityCatalog])

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])

  const onConnect: OnConnect = useCallback((params: Connection) => {
    const source = nodes.find(n => n.id === params.source)
    const target = nodes.find(n => n.id === params.target)
    if (!source || !target || source.id === target.id) return
    const exists = edges.some(e => (e.source === source.id && e.target === target.id) || (e.source === target.id && e.target === source.id))
    if (exists) return
    connectionSucceededRef.current = true
    // 1) create edge immediately
    const newId = `e${source.id}-${target.id}-${Date.now()}`
    setEdges(eds => addEdge({ ...params, id: newId, type: 'tooltip', markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' } }, eds as any) as any)
    // 2) open picker near release point (fallback to midpoint)
    const pane = hostRef.current?.querySelector('.react-flow__pane') as HTMLElement | null
    const pr = pane?.getBoundingClientRect()
    const end = connectEndRef.current
    const px = end && pr ? (end.x - pr.left) : (source.position.x + target.position.x)/2
    const py = end && pr ? (end.y - pr.top) : (source.position.y + target.position.y)/2
    setDestinationPicker(null)
    setEntityPicker(null)
    setRelPicker({ x: px, y: py, source: source as any, target: target as any, edgeId: newId })
  }, [nodes, edges])

  const handleConnectEnd = useCallback((e: MouseEvent | TouchEvent) => {
    try { window.dispatchEvent(new CustomEvent('gb:connecting', { detail: { on: false } })) } catch {}
    const anyE: any = e
    const cx = anyE?.clientX ?? anyE?.changedTouches?.[0]?.clientX
    const cy = anyE?.clientY ?? anyE?.changedTouches?.[0]?.clientY
    if (typeof cx === 'number' && typeof cy === 'number') connectEndRef.current = { x: cx, y: cy }

    const sourceId = connectSourceRef.current
    const eventTarget = e.target as Element | null
    const droppedOnNode = Boolean(eventTarget?.closest?.('.react-flow__node'))
    const likelyEmptyDrop = Boolean(sourceId) && !droppedOnNode
    // Arm before the trailing pane click; disarm below if we do not create a destination.
    if (likelyEmptyDrop) suppressPaneClickRef.current = true

    // Defer so onConnect can mark success before we decide to spawn a blank target.
    queueMicrotask(() => {
      const succeeded = connectionSucceededRef.current
      connectionSucceededRef.current = false
      connectSourceRef.current = null
      if (succeeded || !sourceId || droppedOnNode) {
        if (likelyEmptyDrop) suppressPaneClickRef.current = false
        return
      }
      if (typeof cx !== 'number' || typeof cy !== 'number') {
        suppressPaneClickRef.current = false
        return
      }

      const rf = reactFlowInstanceRef.current ?? (window as any).__rfInstance
      let flowPos = { x: cx, y: cy }
      if (rf?.screenToFlowPosition) {
        const p = rf.screenToFlowPosition({ x: cx, y: cy })
        flowPos = { x: p.x, y: p.y }
      } else {
        const bounds = hostRef.current?.getBoundingClientRect()
        flowPos = { x: cx - (bounds?.left || 0), y: cy - (bounds?.top || 0) }
      }

      const pane = hostRef.current?.querySelector('.react-flow__pane') as HTMLElement | null
      const pr = pane?.getBoundingClientRect()
      const pickerX = pr ? cx - pr.left : flowPos.x
      const pickerY = pr ? cy - pr.top : flowPos.y

      setRelPicker(null)
      setEntityPicker(null)
      const pendingNodeId = createBlankNode('person', flowPos, false, '…')
      const edgeId = `e${sourceId}-${pendingNodeId}-${Date.now()}`
      setEdges(eds => addEdge({
        id: edgeId,
        source: sourceId,
        target: pendingNodeId,
        type: 'tooltip',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' },
      }, eds as any) as any)
      setDestinationPicker({
        x: pickerX,
        y: pickerY,
        sourceId,
        pendingNodeId,
        edgeId,
      })
    })
  }, [createBlankNode, setEdges])

  const handlePick = (pick: RelationPick) => {
    if (!relPicker) return
    const source = relPicker.source as BuilderNode
    const target = relPicker.target as BuilderNode
    const relation = pick.type === 'catalog' ? pick.relation : 'custom'
    const customMiddle = pick.type === 'custom' ? pick.middle : undefined
    const customCaption = pick.type === 'custom' ? pick.caption : undefined
    const tooltip = buildTooltip(source, relation, target, customMiddle)
    const dashed = relation === 'socio_occulto' || relation === 'interessi' || relation === 'stessa_entita'
    const edgeData = {
      relation,
      tooltip,
      dashed,
      customMiddle,
      customCaption,
    }
    if (relPicker.edgeId) {
      setEdges(eds => eds.map(e => e.id === relPicker.edgeId ? ({
        ...e,
        data: { ...(e.data as any), ...edgeData },
      }) as any : e))
    } else {
      const edge: BuilderEdge = {
        id: `e${source.id}-${target.id}-${Date.now()}`,
        source: source.id,
        target: target.id,
        type: 'tooltip',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f172a' },
        data: edgeData,
      }
      setEdges(eds => eds.concat(edge))
    }
    setRelPicker(null)
  }

  // Open relation picker when clicking the gear on an edge
  React.useEffect(() => {
    const onEdit = (e: any) => {
      const d = e?.detail || {}
      const source = nodes.find(n => n.id === d.sourceId) as BuilderNode | undefined
      const target = nodes.find(n => n.id === d.targetId) as BuilderNode | undefined
      if (!source || !target) return
      const pane = hostRef.current?.querySelector('.react-flow__pane') as HTMLElement | null
      const pr = pane?.getBoundingClientRect()
      const px = d.screen && pr && typeof d.clientX === 'number'
        ? d.clientX - pr.left
        : (typeof d.x === 'number' ? d.x : 0)
      const py = d.screen && pr && typeof d.clientY === 'number'
        ? d.clientY - pr.top
        : (typeof d.y === 'number' ? d.y : 0)
      setRelPicker({ x: px, y: py, source: source as any, target: target as any, edgeId: d.edgeId })
    }
    window.addEventListener('gb:edit-edge', onEdit as any)
    return () => window.removeEventListener('gb:edit-edge', onEdit as any)
  }, [nodes])

  // Apply caption edit from edge pencil (custom relation)
  React.useEffect(() => {
    const onCaption = (e: any) => {
      const d = e?.detail || {}
      if (!d?.id || d.relation !== 'custom') return
      const middle = typeof d.customMiddle === 'string' ? d.customMiddle.trim() : ''
      const caption = typeof d.customCaption === 'string' ? d.customCaption.trim() : middle
      if (!middle) return
      setEdges(eds => eds.map(edge => {
        if (edge.id !== d.id) return edge as any
        const source = nodes.find(n => n.id === edge.source) as BuilderNode | undefined
        const target = nodes.find(n => n.id === edge.target) as BuilderNode | undefined
        const tooltip = source && target
          ? buildTooltip(source, 'custom', target, middle)
          : `${middle}`
        return {
          ...edge,
          data: {
            ...(edge.data as any),
            relation: 'custom',
            customMiddle: middle,
            customCaption: caption,
            tooltip,
            dashed: false,
          },
        } as any
      }))
    }
    window.addEventListener('gb:edge-caption', onCaption as any)
    return () => window.removeEventListener('gb:edge-caption', onCaption as any)
  }, [nodes, setEdges])

  // Center nodes after first render with measured size
  React.useEffect(() => {
    const onCenter = (e: any) => {
      const { id, width, height, center } = e?.detail || {}
      if (!id || !width || !height || !center) return
      // With nodeOrigin={[0.5, 0.5]}, React Flow treats the position as the center
      // So we calculate the top-left position, and React Flow will center the node on it
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

  // Clear startEditing flag after it's been used
  React.useEffect(() => {
    const onStartEditingUsed = (e: any) => {
      const { id } = e?.detail || {}
      if (!id) return
      // Clear startEditing flag when editing is started
      setNodes(nds => nds.map(n => {
        if (n.id === id && (n.data as any).startEditing) {
          const { startEditing, ...restData } = n.data as any
          return { ...n, data: restData } as any
        }
        return n
      }))
    }
    window.addEventListener('gb:start-editing-used', onStartEditingUsed as any)
    return () => window.removeEventListener('gb:start-editing-used', onStartEditingUsed as any)
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
          onConnectStart={(e, params) => {
            connectionSucceededRef.current = false
            let nodeId = params?.nodeId ?? null
            if (!nodeId) {
              const el = (e.target as Element | null)?.closest?.('.react-flow__node')
              nodeId = el?.getAttribute('data-id') ?? null
            }
            connectSourceRef.current = nodeId
            try { window.dispatchEvent(new CustomEvent('gb:connecting', { detail: { on: true } })) } catch {}
          }}
          onPaneClick={() => {
            if (suppressPaneClickRef.current) {
              suppressPaneClickRef.current = false
              return
            }
            try { window.dispatchEvent(new CustomEvent('gb:hide-resize')) } catch {}
            setRelPicker(null)
            setEntityPicker(null)
            cancelDestinationPicker()
            // Deselect all edges when clicking on pane
            window.dispatchEvent(new CustomEvent('gb:deselect-edges'))
          }}
          onConnectEnd={handleConnectEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={false}
          proOptions={{ hideAttribution: true }}
          onInit={(inst:any) => {
            (window as any).__rfInstance = inst
            reactFlowInstanceRef.current = inst
            if (pendingViewportRef.current) {
              inst.setViewport(pendingViewportRef.current)
              pendingViewportRef.current = null
            }
          }}
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
              options={getRelationOptions(
                (relPicker.source.data as any).kind,
                (relPicker.target.data as any).kind,
                {
                  sameEntity: Boolean(
                    (relPicker.source.data as any).refId
                    && (relPicker.source.data as any).refId === (relPicker.target.data as any).refId
                  ),
                },
              )}
              onPick={(pick)=>{
                handlePick(pick)
              }}
            />
          </div>
        )}
        {entityPicker && (
          <div style={{ position:'absolute', left: entityPicker.x, top: entityPicker.y, zIndex: 50 }}>
            <EntityPicker
              categoryLabel={paletteCategoryLabel(entityPicker.paletteKind)}
              options={entityPicker.options}
              existingEntityRefIds={existingEntityRefIds}
              onCancel={() => setEntityPicker(null)}
              onPick={(option) => {
                associateNodeWithOption(entityPicker.pendingNodeId, option)
                setEntityPicker(null)
              }}
            />
          </div>
        )}
        {destinationPicker && (
          <div style={{ position:'absolute', left: destinationPicker.x, top: destinationPicker.y, zIndex: 50 }}>
            <DestinationCategoryPicker
              catalog={entityCatalog}
              existingEntityRefIds={existingEntityRefIds}
              onCancel={cancelDestinationPicker}
              onPick={applyDestinationPick}
            />
          </div>
        )}
      </div>
    </div>
  )
})

function defaultLabelFor(kind: BuilderNodeData['kind']): string {
  const label = getEntityLabel(kind)
  return kind === 'other_investigation' ? `${label}\nDel:` : label
}

function paletteCategoryLabel(kind: NodeKind): string {
  switch (kind) {
    case 'person':
    case 'male':
    case 'female':
      return getEntityLabel('person').toLocaleLowerCase('it-IT')
    case 'company':
      return getEntityLabel('company').toLocaleLowerCase('it-IT')
    case 'place':
    case 'bar':
    case 'restaurant':
      return getEntityLabel('place').toLocaleLowerCase('it-IT')
    case 'vehicle':
    case 'motorcycle':
      return getEntityLabel('vehicle').toLocaleLowerCase('it-IT')
    default:
      return 'entità'
  }
}

function formatDobForNode(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return value
}

function buildLabelBlock(option: GraphEntityOption): string | null {
  if (!(option.kind === 'person' || option.kind === 'male' || option.kind === 'female')) {
    return option.subtitle && option.subtitle !== 'Persona' ? option.subtitle : null
  }
  const lines: string[] = []
  if (option.details?.dob) {
    const dob = formatDobForNode(option.details.dob)
    const age = calcAgeFromDob(dob)
    lines.push(age === '' ? dob : `${dob} (${age})`)
  }
  lines.push(`Precedenti PS: ${option.details?.hasPs ? 'Sì' : 'No'}`)
  return lines.join('\n')
}

function calcAgeFromDob(dob: string): number | '' {
  const m = dob.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return ''
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const hasHadBirthday = (now.getMonth() > d.getMonth()) || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate())
  if (!hasHadBirthday) age--
  return age
}

function buildTooltip(
  source: BuilderNode,
  rel: RelationKind,
  target: BuilderNode,
  customMiddle?: string,
): string {
  return formatRelationPhrase({
    sourceName: source.data.label || source.id,
    targetName: target.data.label || target.id,
    sourceKind: source.data.kind,
    relation: rel,
    customMiddle,
  })
}

export default GraphBuilderInner


