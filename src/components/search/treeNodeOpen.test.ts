/**
 * Test del toggle nodi albero ricerca (primo click deve collassare se default espanso).
 */

import { describe, expect, it } from 'vitest'
import { nextTreeNodeOpen } from './treeNodeOpen'

describe('nextTreeNodeOpen', () => {
  it('al primo click collassa quando lo stato non è ancora impostato', () => {
    expect(nextTreeNodeOpen(undefined)).toBe(false)
  })

  it('alterna correttamente dopo il primo click', () => {
    expect(nextTreeNodeOpen(false)).toBe(true)
    expect(nextTreeNodeOpen(true)).toBe(false)
  })
})
