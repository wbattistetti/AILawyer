import React, { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { DocRef, DocumentMatch, SearchResultNode, SearchScope } from './types'

export type { DocRef, DocumentMatch as Match, SearchResultNode, SearchScope } from './types'

type Ctx = {
  scope: SearchScope
  setScope: (s: SearchScope) => void
  history: string[]
  results: SearchResultNode[]
  busy: boolean
  search: (query: string) => Promise<void>
  clearNode: (id: string) => void
  navigateTo: (m: DocumentMatch) => Promise<void>
}

const SearchContext = createContext<Ctx | null>(null)

export const useSearch = () => {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be inside SearchProvider')
  return ctx
}

interface SearchProviderProps {
  children: React.ReactNode
  defaultScope?: SearchScope
  initialQuery?: string
  autoSearch?: boolean
  registry?: {
    getCurrent?: () => DocRef
    getOpenDocs?: () => DocRef[]
    getAllDocs?: () => DocRef[]
    ensureDocOpen?: (docId: string) => unknown | Promise<unknown>
  }
  adapterFactory?: (docId: string) => { goToMatch: (match: DocumentMatch) => Promise<void> } | undefined
  onSearch?: (query: string, scope: SearchScope) => Promise<SearchResultNode | null>
}

export const SearchProvider: React.FC<SearchProviderProps>
  = ({ children, defaultScope = 'current', initialQuery, autoSearch = false, registry, adapterFactory, onSearch }) => {
  const [scope, setScope] = useState<SearchScope>(defaultScope)
  const [history, setHistory] = useState<string[]>(initialQuery ? [initialQuery] : [])
  const [results, setResults] = useState<SearchResultNode[]>([])
  const [busy, setBusy] = useState(false)
  const idRef = useRef(0)
  const lastAutoSearchQuery = useRef<string | null>(null)

  const indexStore = useMemo(() => ({
    async ensure(_doc: DocRef) { /* TODO: hook to worker/IDB */ },
    async search(_doc: DocRef, _query: string): Promise<DocumentMatch[]> { return [] },
  }), [])

  const search = React.useCallback(async (query: string) => {
    const q = (query || '').trim()
    if (!q) return
    setBusy(true)
    setHistory((h)=> [q, ...h.filter(x=>x!==q)].slice(0,20))
    try {
      if (onSearch) {
        const node = await onSearch(q, scope)
        if (node) {
          setResults(r => {
            const filtered = r.filter(n => n.query !== q)
            const newResults = [node, ...filtered]
            return newResults.sort((a, b) => a.query.localeCompare(b.query))
          })
        }
      } else {
        const targets: DocRef[] = scope === 'current' ? (registry?.getCurrent ? [registry.getCurrent()] : [])
          : scope === 'open' ? (registry?.getOpenDocs?.() || []) : (registry?.getAllDocs?.() || [])
        await Promise.all(targets.map(d => indexStore.ensure(d)))
        const groups = await Promise.all(targets.map(async (d) => ({ doc: d, matches: await indexStore.search(d, q) })))
        const total = groups.reduce((sum, group) => sum + group.matches.length, 0)
        const node: SearchResultNode = { id: String(++idRef.current), query: q, scope, total, groups }
        setResults(r => {
          const filtered = r.filter(n => n.query !== q)
          const newResults = [node, ...filtered]
          return newResults.sort((a, b) => a.query.localeCompare(b.query))
        })
      }
    } finally {
      setBusy(false)
    }
  }, [scope, onSearch, registry, indexStore])

  const clearNode = (id: string) => setResults(r => r.filter(n => n.id !== id))

  const navigateTo = async (m: DocumentMatch) => {
    await (registry?.ensureDocOpen?.(m.docId))
    const adapter = adapterFactory?.(m.docId)
    if (adapter?.goToMatch) {
      await adapter.goToMatch(m)
    } else {
      window.dispatchEvent(new CustomEvent('app:goto-match', {
        detail: { docId: m.docId, q: m.q, match: m }
      }))
    }
  }

  // ✅ Auto-search quando initialQuery cambia (solo UNA volta per query)
  React.useEffect(() => {
    if (autoSearch && initialQuery && initialQuery !== lastAutoSearchQuery.current) {
      lastAutoSearchQuery.current = initialQuery
      search(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch, initialQuery])  // NON includere search nelle dipendenze per evitare loop!

  return (
    <SearchContext.Provider value={{ scope, setScope, history, results, busy, search, clearNode, navigateTo }}>
      {children}
    </SearchContext.Provider>
  )
}


