import type { BuilderNode, BuilderEdge, NodeStyle } from './types'
import type { Viewport } from 'reactflow'

export type SavedGraph = {
  id: string                    // ID univoco: "graph-1234567890"
  name: string                  // "Grafo", "Grafo 2", "Mappa Indagini", etc.
  /** Descrizione libera associata al grafo (opzionale). */
  note?: string

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
      customMiddle?: string
      customCaption?: string
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

/** Voce menu toolbar: grafo noto e se è già aperto in una tab. */
export type GraphMenuItem = {
  id: string
  name: string
  isOpen: boolean
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
  createdAt?: string,
  note?: string
): SavedGraph {
  return {
    id: graphId,
    name: graphName,
    note: note ?? '',
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
        customMiddle: e.data.customMiddle,
        customCaption: e.data.customCaption,
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
 * Crea un grafo vuoto pronto per il catalogo e la tab.
 */
export function createEmptySavedGraph(id: string, name: string): SavedGraph {
  const now = new Date().toISOString()
  return {
    id,
    name,
    note: '',
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Prossimo nome generico non ancora usato ("Grafo", "Grafo 2", …).
 */
export function nextGraphName(existingNames: string[]): string {
  const used = new Set(existingNames)
  if (!used.has('Grafo')) return 'Grafo'
  let n = 2
  while (used.has(`Grafo ${n}`)) n += 1
  return `Grafo ${n}`
}

/**
 * Parsa `Pratica.graphsState` in un array di SavedGraph validati in modo minimale.
 * Fallisce in modo esplicito su JSON non array.
 */
export function parseGraphsState(raw: string | null | undefined): SavedGraph[] {
  if (raw == null || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`graphsState non è JSON valido: ${(err as Error).message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('graphsState deve essere un array di grafi')
  }
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Grafo all'indice ${index} non è un oggetto`)
    }
    const g = item as Partial<SavedGraph>
    if (typeof g.id !== 'string' || !g.id.trim()) {
      throw new Error(`Grafo all'indice ${index} senza id valido`)
    }
    if (typeof g.name !== 'string' || !g.name.trim()) {
      throw new Error(`Grafo ${g.id} senza name valido`)
    }
    return {
      id: g.id,
      name: g.name,
      note: typeof g.note === 'string' ? g.note : '',
      viewport: g.viewport,
      nodes: Array.isArray(g.nodes) ? g.nodes : [],
      edges: Array.isArray(g.edges) ? g.edges : [],
      createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
      updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : new Date().toISOString(),
    }
  })
}

/**
 * Serializza il catalogo grafi per `Pratica.graphsState`.
 */
export function serializeGraphsState(graphs: SavedGraph[]): string {
  return JSON.stringify(graphs)
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
