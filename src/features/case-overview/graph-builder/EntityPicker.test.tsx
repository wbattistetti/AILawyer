/**
 * Verifies the visual marker for graph entities that can be selected again.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EntityPicker from './EntityPicker'
import type { GraphEntityOption } from './graph-entity-catalog'

const options: GraphEntityOption[] = [
  {
    id: 'person:1',
    category: 'person',
    kind: 'person',
    label: 'Angela Gerardi',
    subtitle: 'GIP',
  },
  {
    id: 'person:2',
    category: 'person',
    kind: 'person',
    label: 'Antonio Pintaudi',
    subtitle: 'Commissario Capo Tecnico',
  },
]

describe('EntityPicker', () => {
  it('highlights existing entities without disabling their selection button', () => {
    const markup = renderToStaticMarkup(
      <EntityPicker
        categoryLabel="persona"
        options={options}
        existingEntityRefIds={new Set(['person:1'])}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(markup).toContain('Già presente')
    expect(markup).toContain('bg-amber-50')
    expect(markup).not.toContain('disabled')
    expect(markup.match(/Già presente/g)).toHaveLength(1)
  })
})
