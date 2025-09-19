import type { EventRecord } from '../../services/nlp/types'

type EventWithMeta = EventRecord & { docId?: string; praticaId?: string }

const byId = new Map<string, EventWithMeta>()
const byDoc = new Map<string, string[]>()
const byPerson = new Map<string, Set<string>>()
const statsByPerson = new Map<string, { total: number; byType: Record<string, number>; recent: EventWithMeta[] }>()

const listeners = new Set<() => void>()

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach(fn => { try { fn() } catch {} })
}

export function normalizeName(s: string): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function addBatch(docId: string, events: EventRecord[], praticaId?: string) {
  if (!Array.isArray(events) || events.length === 0) return
  const addedPersons = new Set<string>()
  for (const e of events) {
    const id = e.id || `${docId}:${Math.random().toString(36).slice(2)}`
    if (!byId.has(id)) {
      const ext: EventWithMeta = { ...e, id, docId, praticaId }
      byId.set(id, ext)
      const arr = byDoc.get(docId) || []
      arr.push(id)
      byDoc.set(docId, arr)
      for (const p of (e.participants || [])) {
        const key = normalizeName(p)
        if (!byPerson.has(key)) byPerson.set(key, new Set<string>())
        byPerson.get(key)!.add(id)
        addedPersons.add(key)
      }
    }
  }
  // light stats refresh for impacted persons
  for (const key of addedPersons) recomputePersonStats(key)
  emit()
}

export function recomputeStats() {
  statsByPerson.clear()
  for (const key of byPerson.keys()) recomputePersonStats(key)
  emit()
}

function recomputePersonStats(key: string) {
  const ids = Array.from(byPerson.get(key) || [])
  const events = ids.map(id => byId.get(id)!).filter(Boolean)
  const byType: Record<string, number> = {}
  for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1
  const recent = events
    .slice()
    .sort((a, b) => ((a.time || '').localeCompare(b.time || '')))
    .reverse()
    .slice(0, 6)
  statsByPerson.set(key, { total: events.length, byType, recent })
}

export function getEvents(filter?: { person?: string; docId?: string; types?: string[]; dateFrom?: string; dateTo?: string; confMin?: number }): EventWithMeta[] {
  let ids: string[] | null = null
  if (filter?.docId) ids = (byDoc.get(filter.docId) || []).slice()
  if (filter?.person) {
    const s = byPerson.get(normalizeName(filter.person)) || new Set<string>()
    const list = Array.from(s)
    ids = ids ? ids.filter(id => list.includes(id)) : list
  }
  const all = (ids ? ids.map(id => byId.get(id)!) : Array.from(byId.values())).filter(Boolean)
  const types = (filter?.types || []).filter(Boolean)
  const confMin = typeof filter?.confMin === 'number' ? filter!.confMin! : undefined
  const from = filter?.dateFrom
  const to = filter?.dateTo
  return all.filter(e => {
    if (types.length && !types.includes(e.type as string)) return false
    if (typeof confMin === 'number' && (e.confidence || 0) < confMin) return false
    if (from && (e.time || '') < from) return false
    if (to && (e.time || '') > to) return false
    return true
  }).sort((a, b) => (b.time || '').localeCompare(a.time || ''))
}

export function getPersonSummary(fullName: string): { total: number; byType: Record<string, number>; recent: EventWithMeta[] } {
  const key = normalizeName(fullName)
  return statsByPerson.get(key) || { total: 0, byType: {}, recent: [] }
}


