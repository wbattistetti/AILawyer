/**
 * Test per la cache ultima sessione workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LAST_WORKSPACE_SESSION_KEY,
  clearLastWorkspaceSession,
  getRestorableLayoutForPratica,
  loadLastWorkspaceSession,
  saveLastWorkspaceSession,
  shouldRestoreLastWorkspace,
} from './lastWorkspaceSession'

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  })
}

describe('lastWorkspaceSession', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    clearLastWorkspaceSession()
  })

  it('salva e rilegge la sessione', () => {
    const layout = { grid: { root: {} }, panels: [] }
    saveLastWorkspaceSession('pratica-a', layout)
    const session = loadLastWorkspaceSession()
    expect(session?.praticaId).toBe('pratica-a')
    expect(session?.layout).toEqual(layout)
    expect(typeof session?.savedAt).toBe('number')
  })

  it('ripristina solo se la pratica è l’ultima', () => {
    saveLastWorkspaceSession('pratica-a', { ok: true })
    expect(shouldRestoreLastWorkspace('pratica-a')).toBe(true)
    expect(shouldRestoreLastWorkspace('pratica-b')).toBe(false)
    expect(getRestorableLayoutForPratica('pratica-a')).toEqual({ ok: true })
    expect(getRestorableLayoutForPratica('pratica-b')).toBeNull()
  })

  it('sovrascrive con una sola ultima sessione', () => {
    saveLastWorkspaceSession('pratica-a', { a: 1 })
    saveLastWorkspaceSession('pratica-b', { b: 2 })
    expect(shouldRestoreLastWorkspace('pratica-a')).toBe(false)
    expect(getRestorableLayoutForPratica('pratica-b')).toEqual({ b: 2 })
    expect(localStorage.getItem(LAST_WORKSPACE_SESSION_KEY)).toContain('pratica-b')
  })

  it('fallisce in modo esplicito senza praticaId', () => {
    expect(() => saveLastWorkspaceSession('', { x: 1 })).toThrow(/praticaId/)
  })
})
