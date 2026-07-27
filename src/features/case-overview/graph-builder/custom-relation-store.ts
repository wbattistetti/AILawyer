/**
 * Persists user-defined graph relation phrases for reuse in the relation menu.
 */
export type SavedCustomRelation = {
  id: string
  middle: string
  caption: string
}

const STORAGE_KEY = 'ailawyer.graph.custom-relations'
const listeners = new Set<() => void>()
let memoryStore: SavedCustomRelation[] | null = null

function titleCaption(middle: string): string {
  const trimmed = middle.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Personalizzata'
  return trimmed.replace(/\b([a-zà-ü])/gu, ch => ch.toUpperCase())
}

function readStore(): SavedCustomRelation[] {
  if (memoryStore) return memoryStore
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedCustomRelation[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item.middle === 'string' && item.middle.trim())
  } catch {
    return memoryStore ?? []
  }
}

function writeStore(items: SavedCustomRelation[]) {
  memoryStore = items
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // keep memory fallback (tests / private mode)
  }
  listeners.forEach(listener => listener())
}

/** Lists saved custom relations, newest first. */
export function listCustomRelations(): SavedCustomRelation[] {
  return readStore()
}

/** Adds or refreshes a custom relation by normalized middle text. */
export function addCustomRelation(middle: string): SavedCustomRelation {
  const normalized = middle.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    throw new Error('La relazione personalizzata non può essere vuota')
  }
  const caption = titleCaption(normalized)
  const id = `custom:${normalized.toLocaleLowerCase('it-IT')}`
  const current = readStore().filter(item => item.id !== id)
  const next: SavedCustomRelation = { id, middle: normalized, caption }
  writeStore([next, ...current])
  return next
}

/** Clears custom relations (tests). */
export function clearCustomRelations(): void {
  memoryStore = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
  listeners.forEach(listener => listener())
}

/** Subscribes to custom-relation catalog changes. */
export function subscribeCustomRelations(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
