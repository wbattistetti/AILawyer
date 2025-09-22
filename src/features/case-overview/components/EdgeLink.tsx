import React from 'react'
import { BaseEdge, EdgeProps } from 'reactflow'

const NODE_W = 160
const NODE_H = 80
const HW = NODE_W / 2
const HH = NODE_H / 2

function intersectRect(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

export function StarEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const p1 = intersectRect(sourceX, sourceY, HW, HH, targetX, targetY)
  const p2 = intersectRect(targetX, targetY, HW, HH, sourceX, sourceY)
  const path = `M ${p1.x},${p1.y} L ${p2.x},${p2.y}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}

export default StarEdge


