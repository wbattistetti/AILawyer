import type { CaseGraph } from '../types/graph'

export type Point = { x: number; y: number }

// Very simple concentric/radial layout as a baseline.
// Distributes nodes on concentric rings to avoid overlap.
export function layoutRadial(graph: CaseGraph, size: { width: number; height: number }): Record<string, Point> {
  const cx = size.width / 2
  const cy = size.height / 2
  const nodes = graph.nodes.filter(n => n.kind !== 'TIMELINE')
  // force central node if present
  const centerIdx = nodes.findIndex(n => n.id === 'soggetto')
  const ordered = [...nodes]
  if (centerIdx >= 0) { const [c] = ordered.splice(centerIdx,1); ordered.unshift(c) }
  const perRing = Math.max(8, Math.ceil((ordered.length-1)/2))
  const ringCount = 2
  const gap = Math.min(size.width, size.height) / 4

  const pos: Record<string, Point> = {}
  // center
  if (ordered[0]) pos[ordered[0].id] = { x: cx, y: cy }
  // rings
  let idx = 1
  for (let r = 1; r <= ringCount; r++) {
    const ringItems = Math.min(perRing, ordered.length - idx)
    const radius = r * gap
    for (let i = 0; i < ringItems; i++) {
      const a = (2 * Math.PI * i) / ringItems
      const x = cx + radius * Math.cos(a)
      const y = cy + radius * Math.sin(a)
      const n = ordered[idx++]
      if (n) pos[n.id] = { x, y }
    }
  }
  // timeline band at bottom
  const tl = graph.nodes.find(n => n.kind === 'TIMELINE')
  if (tl) pos[tl.id] = { x: cx, y: cy + gap * 1.8 }
  return pos
}


