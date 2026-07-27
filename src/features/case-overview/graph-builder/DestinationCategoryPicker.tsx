/**
 * Accordion picker for choosing a link destination category and entity on canvas drop.
 */
import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EntityTypeIcon } from '../../EntityTypeIcon'
import { filterCatalogByPaletteKind, requiresEntitySelection, type GraphEntityOption } from './graph-entity-catalog'
import { TOOL_PALETTE_ITEMS, type ToolPaletteItem } from './ToolPalette'
import type { NodeKind } from './types'

export type DestinationCategoryPick =
  | { type: 'blank'; kind: NodeKind }
  | { type: 'entity'; kind: NodeKind; option: GraphEntityOption }

/** Resolves a category-row click into blank pick or accordion toggle. */
export function resolveDestinationCategoryClick(
  kind: NodeKind,
  expandedKind: NodeKind | null,
): { type: 'blank'; kind: NodeKind } | { type: 'toggle'; kind: NodeKind | null } {
  if (!requiresEntitySelection(kind)) {
    return { type: 'blank', kind }
  }
  return { type: 'toggle', kind: expandedKind === kind ? null : kind }
}

type DestinationCategoryPickerProps = {
  catalog: GraphEntityOption[]
  existingEntityRefIds: ReadonlySet<string>
  categories?: readonly ToolPaletteItem[]
  /** Optional initial expanded category (useful for tests / deep links). */
  defaultExpandedKind?: NodeKind | null
  onPick: (pick: DestinationCategoryPick) => void
  onCancel: () => void
}

/** Floating accordion: categories from the tool palette, entities nested under each. */
export default function DestinationCategoryPicker({
  catalog,
  existingEntityRefIds,
  categories = TOOL_PALETTE_ITEMS,
  defaultExpandedKind = null,
  onPick,
  onCancel,
}: DestinationCategoryPickerProps) {
  const [expandedKind, setExpandedKind] = useState<NodeKind | null>(defaultExpandedKind)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef(new Map<NodeKind, HTMLDivElement>())

  useEffect(() => {
    if (!expandedKind) return
    const section = sectionRefs.current.get(expandedKind)
    const scroll = scrollRef.current
    if (!section || !scroll) return
    scroll.scrollTop = section.offsetTop
  }, [expandedKind])

  const handleCategoryClick = (kind: NodeKind) => {
    const result = resolveDestinationCategoryClick(kind, expandedKind)
    if (result.type === 'blank') {
      onPick({ type: 'blank', kind: result.kind })
      return
    }
    setExpandedKind(result.kind)
  }

  return (
    <div className="bg-white border rounded shadow-md p-2 text-sm min-w-[280px] max-w-[360px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-600">Seleziona destinazione</div>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={onCancel}
        >
          Chiudi
        </button>
      </div>
      <div ref={scrollRef} className="max-h-80 overflow-auto">
        {categories.map(category => {
          const isExpanded = expandedKind === category.id
          const needsEntities = requiresEntitySelection(category.id)
          const options = needsEntities
            ? filterCatalogByPaletteKind(catalog, category.id)
            : []

          return (
            <div
              key={category.id}
              ref={el => {
                if (el) sectionRefs.current.set(category.id, el)
                else sectionRefs.current.delete(category.id)
              }}
              data-category={category.id}
              data-expanded={isExpanded ? 'true' : 'false'}
            >
              <button
                type="button"
                className={`sticky top-0 z-10 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left ${
                  isExpanded
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-transparent bg-white hover:bg-slate-100'
                }`}
                onClick={() => handleCategoryClick(category.id)}
              >
                {needsEntities ? (
                  isExpanded
                    ? <ChevronDown size={14} className="shrink-0 text-slate-500" />
                    : <ChevronRight size={14} className="shrink-0 text-slate-500" />
                ) : (
                  <span className="inline-block w-3.5 shrink-0" />
                )}
                <EntityTypeIcon
                  kind={category.id}
                  size={28}
                  iconSize={16}
                  label={category.label}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{category.label}</span>
              </button>

              {isExpanded && needsEntities && (
                <div className="mb-1 ml-4 grid grid-cols-1 gap-1 border-l border-slate-200 pl-2" data-testid="entity-list">
                  {options.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-slate-500">
                      Nessuna entità disponibile in questa categoria.
                    </div>
                  ) : (
                    options.map(option => {
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
                          onClick={() => onPick({ type: 'entity', kind: option.kind, option })}
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
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
        {/* Extra scroll room so a bottom category can pin to the top when expanded. */}
        {expandedKind ? <div aria-hidden className="h-48" /> : null}
      </div>
    </div>
  )
}
