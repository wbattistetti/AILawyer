import type { CaseGraph, CaseNode } from '../types/graph'

export type BlockState = 'active' | 'partial' | 'empty'

export function computeBlockStatus(graph: CaseGraph, selectedPeople: string[] = []): Record<string, { state: BlockState; count: number }> {
  const res: Record<string, { state: BlockState; count: number }> = {}
  const nodesById = new Map(graph.nodes.map(n => [n.id, n]))
  const countFor = (n: CaseNode) => Math.max(0, n.counts?.items || 0)

  for (const n of graph.nodes) {
    const cnt = countFor(n)
    let state: BlockState = cnt > 0 ? 'active' : 'empty'
    // TODO: in futuro: usare selectedPeople + meta.persons sugli atti/eventi
    res[n.id] = { state, count: cnt }
  }

  // Se ci sono archi da nodi con dati verso altri blocchi, marca 'partial' se destinazione ha 0
  for (const e of graph.edges) {
    const src = nodesById.get(e.source)
    const dst = nodesById.get(e.target)
    if (!src || !dst) continue
    const srcCnt = countFor(src)
    if (srcCnt > 0 && res[dst.id]?.state === 'empty') {
      res[dst.id] = { state: 'partial', count: res[dst.id].count }
    }
  }
  return res
}


