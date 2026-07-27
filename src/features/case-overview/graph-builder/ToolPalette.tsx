/**
 * Graph tool palette: one Persona tool replaces separate male/female icons.
 */
import React from 'react'
import { EntityTypeIcon } from '../../EntityTypeIcon'
import {
  GRAPH_TOOL_KINDS,
  getEntityLabel,
} from '../../entity-visual-catalog'
import type { NodeKind } from './types'

export type ToolPaletteItem = {
  id: NodeKind
  label: string
}

/** Categories shown in the left strip and in the link-drop destination menu. */
export const TOOL_PALETTE_ITEMS: readonly ToolPaletteItem[] = [
  ...GRAPH_TOOL_KINDS.map(id => ({ id, label: getEntityLabel(id) })),
]

export function ToolPalette() {
  return (
    <div className="w-[84px] border-r bg-white h-full p-2 flex flex-col gap-2 select-none">
      {TOOL_PALETTE_ITEMS.map(({ id, label }) => {
        return (
          <div
            key={id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-node-kind', id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            className="flex flex-col items-center gap-1 p-2 rounded hover:bg-slate-50 cursor-grab active:cursor-grabbing"
            title={`Trascina ${label}`}
          >
            <EntityTypeIcon kind={id} size={38} iconSize={24} label={label} />
            <div className="text-[11px] text-center leading-tight">{label}</div>
          </div>
        )
      })}
    </div>
  )
}
