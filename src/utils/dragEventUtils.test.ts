/**
 * Verifica la classificazione dei drag (Dockview vs file OS / custom).
 */
import { describe, expect, it } from 'vitest'
import type { DragEvent as ReactDragEvent } from 'react'
import { isDockviewDrag, isOsFileDrag } from './dragEventUtils'

function makeDragEvent(types: string[], targetClasses = 'dv-tab'): ReactDragEvent {
  const target = {
    tagName: 'DIV',
    className: targetClasses,
    closest: (selector: string) => {
      if (selector === '.dv-tab' && targetClasses.includes('dv-tab')) return target
      if (selector.includes('dockview-tab') && targetClasses.includes('dockview')) return target
      return null
    },
  }
  return {
    dataTransfer: {
      types,
      getData: () => '',
    },
    target,
  } as unknown as ReactDragEvent
}

describe('isDockviewDrag', () => {
  it('tratta i file OS come non-Dockview anche sopra .dv-tab', () => {
    const e = makeDragEvent(['Files', 'application/x-moz-file'])
    expect(isOsFileDrag(e)).toBe(true)
    expect(isDockviewDrag(e)).toBe(false)
  })

  it('riconosce un drag di pannello Dockview senza marker custom', () => {
    const e = makeDragEvent(['text/plain'])
    expect(isDockviewDrag(e)).toBe(true)
  })

  it('non tratta come Dockview i marker Explorer/doc', () => {
    expect(isDockviewDrag(makeDragEvent(['application/x-explorer-file']))).toBe(false)
    expect(isDockviewDrag(makeDragEvent(['application/x-doc-id']))).toBe(false)
  })
})
