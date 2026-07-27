/**
 * Relation picker with catalog phrases plus reusable custom relations.
 */
import React, { useEffect, useState } from 'react'
import { formatRelationPhraseParts } from './relation-phrase'
import { getRelationOptions, labelFor } from './relation-catalog'
import {
  addCustomRelation,
  listCustomRelations,
  subscribeCustomRelations,
  type SavedCustomRelation,
} from './custom-relation-store'
import type { NodeKind, RelationKind } from './types'

export { getRelationOptions, labelFor } from './relation-catalog'

export type RelationPick =
  | { type: 'catalog'; relation: RelationKind }
  | { type: 'custom'; middle: string; caption: string }

type RelationPickerProps = {
  sourceName: string
  targetName: string
  sourceKind: NodeKind
  targetKind: NodeKind
  options: RelationKind[]
  onPick: (pick: RelationPick) => void
}

/** Renders filtered relation phrases and a custom-relation composer at the top. */
export default function RelationPicker({
  sourceName,
  targetName,
  sourceKind,
  options,
  onPick,
}: RelationPickerProps) {
  const [customText, setCustomText] = useState('')
  const [customs, setCustoms] = useState<SavedCustomRelation[]>(() => listCustomRelations())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeCustomRelations(() => setCustoms(listCustomRelations())), [])

  const submitCustom = () => {
    try {
      const saved = addCustomRelation(customText)
      setError(null)
      setCustomText('')
      onPick({ type: 'custom', middle: saved.middle, caption: saved.caption })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relazione non valida')
    }
  }

  return (
    <div className="bg-white border rounded shadow-md p-2 text-sm min-w-[320px] max-w-[420px]">
      <div className="mb-2 border-b border-slate-100 pb-2">
        <div className="mb-1 text-[11px] font-medium text-slate-500">Nuova relazione</div>
        <div className="flex gap-1">
          <input
            type="text"
            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
            placeholder="es. conosce / abita vicino a"
            value={customText}
            onChange={e => { setCustomText(e.target.value); setError(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitCustom()
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700"
            onClick={submitCustom}
          >
            Aggiungi
          </button>
        </div>
        {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
        <div className="mt-1 text-[10px] text-slate-400">
          <b>{sourceName}</b> {customText.trim() || '…'} <b>{targetName}</b>
        </div>
      </div>

      <div className="grid max-h-64 grid-cols-1 gap-1 overflow-auto">
        {customs.map(custom => (
          <button
            key={custom.id}
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-slate-100"
            onClick={() => onPick({ type: 'custom', middle: custom.middle, caption: custom.caption })}
          >
            <b>{sourceName}</b> {custom.middle} <b>{targetName}</b>
            <span className="ml-2 text-[10px] text-slate-400">custom</span>
          </button>
        ))}
        {options.filter(opt => opt !== 'custom').map(opt => {
          const parts = formatRelationPhraseParts({
            sourceName,
            targetName,
            sourceKind,
            relation: opt,
          })
          return (
            <button
              key={opt}
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-slate-100"
              onClick={() => onPick({ type: 'catalog', relation: opt })}
            >
              <b>{parts.sourceName}</b> {parts.middle} <b>{parts.targetName}</b>
            </button>
          )
        })}
      </div>
    </div>
  )
}
