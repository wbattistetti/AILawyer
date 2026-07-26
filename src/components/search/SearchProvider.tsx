/**
 * Stato e navigazione condivisi della ricerca documentale.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DocRef, DocumentMatch, SearchResultNode, SearchScope } from './types'
import { useOptionalViewerSearchNavigatorRegistry } from './ViewerSearchNavigatorProvider'

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
    /**
     * Apre/attiva il documento. Se restituisce una stringa, è l’id canonico del viewer.
     */
    ensureDocOpen?: (docId: string, match?: DocumentMatch) => unknown | Promise<unknown>
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
  const registryRef = useRef(registry)
  const adapterFactoryRef = useRef(adapterFactory)
  const onSearchRef = useRef(onSearch)
  const viewerNavigatorRegistry = useOptionalViewerSearchNavigatorRegistry()

  useEffect(() => {
    registryRef.current = registry
    adapterFactoryRef.current = adapterFactory
    onSearchRef.current = onSearch
  }, [registry, adapterFactory, onSearch])

  const indexStore = useMemo(() => ({
    async ensure(_doc: DocRef) { /* TODO: hook to worker/IDB */ },
    async search(_doc: DocRef, _query: string): Promise<DocumentMatch[]> { return [] },
  }), [])

  const search = useCallback(async (query: string) => {
    const q = (query || '').trim()
    if (!q) return
    setBusy(true)
    setHistory((h)=> [q, ...h.filter(x=>x!==q)].slice(0,20))
    try {
      const currentOnSearch = onSearchRef.current
      const currentRegistry = registryRef.current
      if (currentOnSearch) {
        const node = await currentOnSearch(q, scope)
        if (node) {
          setResults(r => {
            const filtered = r.filter(n => n.query !== q)
            const newResults = [node, ...filtered]
            return newResults.sort((a, b) => a.query.localeCompare(b.query))
          })
        }
      } else {
        const targets: DocRef[] = scope === 'current' ? (currentRegistry?.getCurrent ? [currentRegistry.getCurrent()] : [])
          : scope === 'open' ? (currentRegistry?.getOpenDocs?.() || []) : (currentRegistry?.getAllDocs?.() || [])
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
  }, [scope, indexStore])

  const clearNode = useCallback((id: string) => {
    setResults(r => r.filter(n => n.id !== id))
  }, [])

  const navigateTo = useCallback(async (m: DocumentMatch) => {
    if (!m?.docId?.trim()) {
      throw new Error('Match senza docId: impossibile aprire il documento')
    }

    const opened = await registryRef.current?.ensureDocOpen?.(m.docId, m)
    const canonicalId = typeof opened === 'string' && opened.trim()
      ? opened.trim()
      : m.docId
    const normalizedMatch = canonicalId === m.docId
      ? m
      : { ...m, docId: canonicalId }

    const adapter = adapterFactoryRef.current?.(canonicalId)
    if (adapter?.goToMatch) {
      await adapter.goToMatch(normalizedMatch)
      return
    }

    if (viewerNavigatorRegistry) {
      const navigator = await viewerNavigatorRegistry.waitFor(canonicalId)
      await navigator.goToMatch(normalizedMatch)
      return
    }

    throw new Error(
      `Nessun navigatore ricerca per il documento "${canonicalId}": apri il documento e riprova`
    )
  }, [viewerNavigatorRegistry])

  useEffect(() => {
    if (autoSearch && initialQuery && initialQuery !== lastAutoSearchQuery.current) {
      lastAutoSearchQuery.current = initialQuery
      void search(initialQuery)
    }
  }, [autoSearch, initialQuery, search])

  const value = useMemo(
    () => ({ scope, setScope, history, results, busy, search, clearNode, navigateTo }),
    [scope, history, results, busy, search, clearNode, navigateTo]
  )

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}
