/**
 * Verifies destination accordion markup and category-click resolution.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DestinationCategoryPicker, { resolveDestinationCategoryClick } from './DestinationCategoryPicker'
import type { GraphEntityOption } from './graph-entity-catalog'

const catalog: GraphEntityOption[] = [
  {
    id: 'person:1',
    category: 'person',
    kind: 'person',
    label: 'Angela Gerardi',
    subtitle: 'GIP',
  },
  {
    id: 'entity:car-1',
    category: 'vehicle',
    kind: 'vehicle',
    label: 'Fiat Panda AB123CD',
    subtitle: 'Auto',
  },
  {
    id: 'entity:moto-1',
    category: 'vehicle',
    kind: 'motorcycle',
    label: 'Honda SH',
    subtitle: 'Moto',
  },
]

describe('resolveDestinationCategoryClick', () => {
  it('picks blank nodes for categories that do not require entities', () => {
    expect(resolveDestinationCategoryClick('meeting', null)).toEqual({ type: 'blank', kind: 'meeting' })
    expect(resolveDestinationCategoryClick('other_investigation', 'vehicle')).toEqual({
      type: 'blank',
      kind: 'other_investigation',
    })
  })

  it('toggles accordion expansion for entity categories', () => {
    expect(resolveDestinationCategoryClick('vehicle', null)).toEqual({ type: 'toggle', kind: 'vehicle' })
    expect(resolveDestinationCategoryClick('vehicle', 'vehicle')).toEqual({ type: 'toggle', kind: null })
    expect(resolveDestinationCategoryClick('person', 'vehicle')).toEqual({ type: 'toggle', kind: 'person' })
  })
})

describe('DestinationCategoryPicker', () => {
  it('renders palette categories collapsed by default', () => {
    const markup = renderToStaticMarkup(
      <DestinationCategoryPicker
        catalog={catalog}
        existingEntityRefIds={new Set()}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(markup).toContain('Seleziona destinazione')
    expect(markup).toContain('Persona')
    expect(markup).toContain('Veicolo')
    expect(markup).toContain('Incontro')
    expect(markup).not.toContain('data-testid="entity-list"')
  })

  it('lists entities under an expanded category and marks ones already on the graph', () => {
    const markup = renderToStaticMarkup(
      <DestinationCategoryPicker
        catalog={catalog}
        existingEntityRefIds={new Set(['entity:car-1'])}
        defaultExpandedKind="vehicle"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(markup).toContain('data-category="vehicle" data-expanded="true"')
    expect(markup).toContain('Fiat Panda AB123CD')
    expect(markup).toContain('Honda SH')
    expect(markup).toContain('Già presente')
    expect(markup).toContain('bg-amber-50')
  })
})
