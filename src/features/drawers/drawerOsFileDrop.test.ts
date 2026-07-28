/**
 * Hit-test e upload del drop file OS sulle tab cassetto (senza DOM reale).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DRAWER_DROP_ID_ATTR,
  drawerIdFromElement,
  uploadOsFilesToDrawer,
} from './drawerOsFileDrop'

type FakeEl = {
  closest: (selector: string) => FakeEl | null
  getAttribute: (name: string) => string | null
}

function fakeNode(attrs: Record<string, string>, selfMatches: string[] = []): FakeEl {
  const node: FakeEl = {
    closest: (selector: string) => {
      if (selfMatches.some(s => selector.includes(s) || selector === s)) return node
      // match attribute selectors loosely for tests
      if (selector.includes(DRAWER_DROP_ID_ATTR) && attrs[DRAWER_DROP_ID_ATTR]) return node
      if (selector.includes('data-drawer-tab') && attrs['data-drawer-tab'] && attrs['data-drawer-id']) {
        return node
      }
      return null
    },
    getAttribute: (name: string) => attrs[name] ?? null,
  }
  return node
}

describe('drawerIdFromElement', () => {
  it('risolve data-drawer-drop-id (tab Dockview)', () => {
    const el = fakeNode({ [DRAWER_DROP_ID_ATTR]: 'comparto-1' })
    expect(drawerIdFromElement(el as unknown as Element)).toBe('comparto-1')
  })

  it('risolve data-drawer-tab + data-drawer-id (strip)', () => {
    const el = fakeNode({
      'data-drawer-tab': 'true',
      'data-drawer-id': 'comparto-2',
    })
    expect(drawerIdFromElement(el as unknown as Element)).toBe('comparto-2')
  })

  it('restituisce null fuori da tab cassetto', () => {
    const el = fakeNode({})
    expect(drawerIdFromElement(el as unknown as Element)).toBeNull()
  })
})

describe('uploadOsFilesToDrawer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fallisce se __archiveData non è pronto', async () => {
    vi.stubGlobal('window', {})
    await expect(
      uploadOsFilesToDrawer([new File(['x'], 'a.pdf')], 'id-1')
    ).rejects.toThrow(/handleFileDrop non disponibile/)
  })

  it('chiama handleFileDrop con target drawer', async () => {
    const handleFileDrop = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      __archiveData: {
        handleFileDrop,
        comparti: [{ id: 'id-1', nome: 'Parti' }],
      },
    })

    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    await uploadOsFilesToDrawer([file], 'id-1')

    expect(handleFileDrop).toHaveBeenCalledWith(
      [file],
      'id-1',
      { type: 'drawer', id: 'id-1', title: 'Parti' }
    )
  })
})
