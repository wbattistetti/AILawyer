import React, { createContext, useContext, useMemo, useRef, useState } from 'react'

export type SearchScope = 'current' | 'open' | 'archive'

export type DocRef = { id: string; title: string; hash: string; pages: number; kind: 'pdf' | 'word' }

export type Match = {
  id: string
  docId: string
  docTitle: string
  kind: 'pdf' | 'word'
  page: number
  q: string
  // box in % sul *text layer container* (coerente con overlay)
  x0Pct: number; x1Pct: number; y0Pct: number; y1Pct: number
  // opzionali per ricalcolo preciso
  charIdx?: number; qLength?: number
  snippet: string
  score: number
  ord?: number
}

export type SearchResultNode = {
  id: string
  query: string
  scope: SearchScope
  total: number
  groups: Array<{ doc: DocRef; matches: Match[] }>
}

type Ctx = {
  scope: SearchScope
  setScope: (s: SearchScope) => void
  history: string[]
  results: SearchResultNode[]
  busy: boolean
  search: (query: string) => Promise<void>
  clearNode: (id: string) => void
  navigateTo: (m: Match) => Promise<void>
}

const SearchContext = createContext<Ctx | null>(null)

export const useSearch = () => {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be inside SearchProvider')
  return ctx
}

export const SearchProvider: React.FC<{ children: React.ReactNode; defaultScope?: SearchScope; registry?: any; adapterFactory?: any; onSearch?: (q: string, scope: SearchScope) => Promise<SearchResultNode | null>; }>
  = ({ children, defaultScope = 'current', registry, adapterFactory, onSearch }) => {
  const [scope, setScope] = useState<SearchScope>(defaultScope)
  const [history, setHistory] = useState<string[]>([])
  const [results, setResults] = useState<SearchResultNode[]>([])
  const [busy, setBusy] = useState(false)
  const idRef = useRef(0)

  const indexStore = useMemo(() => ({
    async ensure(doc: DocRef) { /* TODO: hook to worker/IDB */ },
    async search(doc: DocRef, q: string): Promise<Match[]> { return [] },
  }), [])

  const search = async (query: string) => {
    const q = (query || '').trim()
    if (!q) return
    setBusy(true)
    setHistory((h)=> [q, ...h.filter(x=>x!==q)].slice(0,20))
    if (onSearch) {
      console.log('[SEARCH][provider] onSearch start', { q, scope })
      const node = await onSearch(q, scope)
      console.log('[SEARCH][provider] onSearch done', { total: node?.total })
      if (node) setResults(r => [node, ...r])
    } else {
      // pick targets by scope
      const targets: DocRef[] = scope === 'current' ? (registry?.getCurrent ? [registry.getCurrent()] : [])
        : scope === 'open' ? (registry?.getOpenDocs?.() || []) : (registry?.getAllDocs?.() || [])
      await Promise.all(targets.map(d => indexStore.ensure(d)))
      const groups = await Promise.all(targets.map(async (d) => ({ doc: d, matches: await indexStore.search(d, q) })))
      const total = groups.reduce((s,g)=> s + g.matches.length, 0)
      const node: SearchResultNode = { id: String(++idRef.current), query: q, scope, total, groups }
      setResults(r => [node, ...r])
    }
    setBusy(false)
  }

  const clearNode = (id: string) => { console.log('[SEARCH][provider] clear node', id); setResults(r => r.filter(n => n.id !== id)) }

  const navigateTo = async (m: Match) => {
    console.log('[SEARCH][provider] navigateTo', { docId: m.docId, page: m.page, q: m.q })
    await (registry?.ensureDocOpen?.(m.docId))
    const adapter = adapterFactory?.(m.docId)
    if (adapter?.goToMatch) {
      console.log('[SEARCH][provider] adapter.goToMatch')
      await adapter.goToMatch(m)
    } else {
      console.log('[SEARCH][provider] dispatch app:goto-match event')
      try { window.dispatchEvent(new CustomEvent('app:goto-match', { detail: { docId: m.docId, q: m.q, match: m } })) } catch {}
    }
  }

  return (
    <SearchContext.Provider value={{ scope, setScope, history, results, busy, search, clearNode, navigateTo }}>
      {children}
    </SearchContext.Provider>
  )
}


