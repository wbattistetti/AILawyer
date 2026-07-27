/**
 * Verifies the compact inline editor markup (white field + ✓ / ✕).
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import InlineTextEditor from './InlineTextEditor'

describe('InlineTextEditor', () => {
  it('renders a light input with confirm and cancel icon buttons', () => {
    const markup = renderToStaticMarkup(
      <InlineTextEditor
        value="Nuova relazione"
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        aria-label="Caption relazione"
      />,
    )

    expect(markup).toContain('background:#ffffff')
    expect(markup).toContain('color:#0f172a')
    expect(markup).toContain('aria-label="Conferma"')
    expect(markup).toContain('aria-label="Annulla"')
    expect(markup).not.toContain('>OK<')
    expect(markup).not.toContain('>Annulla</button>')
  })
})
