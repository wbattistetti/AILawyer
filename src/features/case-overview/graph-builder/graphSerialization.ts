import type { BuilderNode, BuilderEdge, NodeStyle } from './types'
import type { Viewport } from 'reactflow'

export type SavedGraph = {
  id: string                    // ID univoco: "graph-1234567890"
  name: string                  // "Grafo", "Grafo 2", "Mappa Indagini", etc.
  
  // Viewport (opzionale, per ripristinare zoom/pan)
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  
  // NODI - salva TUTTO
  nodes: Array<{
    id: string
    type: string
    position: {
      x: number
      y: number
    }
    data: {
      kind: string
      label: string
      labelBlock?: string | null
      refId?: string
      icon?: string
      details?: {
        dob?: string
        hasPs?: boolean
      }
      style?: NodeStyle
    }
  }>
  
  // EDGE - salva TUTTO
  edges: Array<{
    id: string
    source: string
    target: string
    type: string
    markerEnd?: {
      type: string
      color?: string
    }
    data: {
      relation: string
      tooltip?: string
      dashed?: boolean
      percent?: number
      strokeColor?: string
      strokeWidth?: number
      captionFontSizePx?: number
      captionBold?: boolean
      captionItalic?: boolean
      captionColor?: string
    }
  }>
  
  // Metadata
  createdAt: string             // ISO timestamp
  updatedAt: string             // ISO timestamp
}

/**
 * Serializza un grafo da ReactFlow a SavedGraph
 */
export function serializeGraph(
  graphId: string,
  graphName: string,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  viewport?: Viewport,
  createdAt?: string
): SavedGraph {
  return {
    id: graphId,
    name: graphName,
    viewport: viewport ? {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom
    } : undefined,
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: {
        kind: n.data.kind,
        label: n.data.label,
        labelBlock: n.data.labelBlock,
        refId: n.data.refId,
        icon: n.data.icon,
        details: n.data.details,
        style: n.data.style ? { ...n.data.style } : undefined
      }
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      markerEnd: e.markerEnd ? {
        type: (e.markerEnd as any).type || 'arrowclosed',
        color: (e.markerEnd as any).color
      } : undefined,
      data: {
        relation: e.data.relation,
        tooltip: e.data.tooltip,
        dashed: e.data.dashed,
        percent: e.data.percent,
        strokeColor: e.data.strokeColor,
        strokeWidth: e.data.strokeWidth,
        captionFontSizePx: e.data.captionFontSizePx,
        captionBold: e.data.captionBold,
        captionItalic: e.data.captionItalic,
        captionColor: e.data.captionColor
      }
    })),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

/**
 * Deserializza un SavedGraph in nodi e edge per ReactFlow
 */
export function deserializeGraph(
  saved: SavedGraph,
  onNodeDelete: (nodeId: string) => void
): { nodes: BuilderNode[]; edges: BuilderEdge[]; viewport?: Viewport } {
  const nodes: BuilderNode[] = saved.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    dragHandle: '.drag-region',
    data: {
      ...n.data,
      nodeId: n.id,
      onDelete: () => onNodeDelete(n.id)
    }
  }))
  
  const edges: BuilderEdge[] = saved.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    markerEnd: e.markerEnd,
    data: e.data
  }))
  
  const viewport: Viewport | undefined = saved.viewport ? {
    x: saved.viewport.x,
    y: saved.viewport.y,
    zoom: saved.viewport.zoom
  } : undefined
  
  return { nodes, edges, viewport }
}

/**
 * Verifica se un nome è generico (es. "Grafo", "Grafo 2", "Grafo 3", etc.)
 */
export function isGenericGraphName(name: string): boolean {
  // "Grafo" senza numero
  if (name === 'Grafo') return true
  
  // "Grafo 2", "Grafo 3", etc.
  const match = name.match(/^Grafo\s+(\d+)$/)
  return !!match
}
