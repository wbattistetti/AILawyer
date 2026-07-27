/**
 * Alphabetic picker for extracted entities available when dropping a graph tool icon.
 */
import React from 'react'
import { EntityTypeIcon } from '../../EntityTypeIcon'
import type { GraphEntityOption } from './graph-entity-catalog'

type EntityPickerProps = {
  categoryLabel: string
  options: GraphEntityOption[]
  existingEntityRefIds: ReadonlySet<string>
  onPick: (option: GraphEntityOption) => void
  onCancel: () => void
}

/** Renders selectable practice entities and marks those already used in the graph. */
export default function EntityPicker({
  categoryLabel,
  options,
  existingEntityRefIds,
  onPick,
  onCancel,
}: EntityPickerProps) {
  return (
    <div className="bg-white border rounded shadow-md p-2 text-sm min-w-[280px] max-w-[360px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-600">Seleziona {categoryLabel}</div>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={onCancel}
        >
          Chiudi
        </button>
      </div>
      {options.length === 0 ? (
        <div className="px-2 py-3 text-xs text-slate-500">
          Nessuna entità disponibile in questa categoria.
        </div>
      ) : (
        <div className="grid max-h-72 grid-cols-1 gap-1 overflow-auto">
          {options.map(option => {
            const isAlreadyPresent = existingEntityRefIds.has(option.id)
            return (
              <button
                key={option.id}
                type="button"
                className={`flex items-start gap-2 rounded border px-2 py-1.5 text-left ${
                  isAlreadyPresent
                    ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                    : 'border-transparent hover:bg-slate-100'
                }`}
                onClick={() => onPick(option)}
              >
                <EntityTypeIcon
                  kind={option.kind}
                  size={28}
                  iconSize={16}
                  className="mt-0.5"
                  label={option.label}
                />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="block min-w-0 truncate font-medium text-slate-900">{option.label}</span>
                    {isAlreadyPresent && (
                      <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-900">
                        Già presente
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">{option.subtitle}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
