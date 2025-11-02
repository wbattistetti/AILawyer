import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Search as SearchIcon, FileText, Type as TypeIcon } from 'lucide-react'
import { useSearch, SearchScope } from './SearchProvider'

export const SearchPanelTree = React.memo<{ showInput?: boolean; showScopeSelector?: boolean; initialQuery?: string }>(({ showInput=true, showScopeSelector=true, initialQuery })=>{
  const { scope, setScope, history, results, busy, search, clearNode, navigateTo } = useSearch()
  const [q, setQ] = useState(initialQuery || '')
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
  const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const nodeRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const lastScrolledQuery = useRef<string | null>(null)

  // Auto-scroll al nodo appena cercato (solo UNA volta per query)
  useEffect(() => {
    if (initialQuery && results.length > 0 && initialQuery !== lastScrolledQuery.current) {
      // Trova il nodo con la query corrente
      const targetNode = results.find(r => r.query === initialQuery)
      if (targetNode && nodeRefs.current[targetNode.query]) {
        lastScrolledQuery.current = initialQuery
        setTimeout(() => {
          nodeRefs.current[targetNode.query]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    }
  }, [results.length, initialQuery])

  const onSubmit = () => {
    if (q.trim()) {
      search(q.trim())
      // Non svuotare più la query per mantenere l'evidenziazione
    }
  }
  const toggle = (id: string) => setOpenNodes(s => ({ ...s, [id]: !s[id] }))
  const toggleDoc = (id: string) => setOpenDocs(s => ({ ...s, [id]: !s[id] }))

  const renderSnippet = (snippet: string, query?: string) => {
    // Usa la query passata come parametro o fallback a initialQuery
    const searchQuery = (query || initialQuery || '').trim()
    if (!searchQuery) return <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>{snippet}</span>
    const idx = snippet.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx < 0) return <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>{snippet}</span>
    const before = snippet.slice(0, idx)
    const match = snippet.slice(idx, idx + searchQuery.length)
    const after = snippet.slice(idx + searchQuery.length)
    return (
      <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>
        {before}
        <strong className="font-bold text-amber-700">{match}</strong>
        {after}
      </span>
    )
  }

  return (
    <div className="flex h-full w-full flex-col text-sm">
      {showInput && (
        <div className="p-2 border-b flex items-center gap-2">
          <SearchIcon size={16} className="text-slate-600" />
          <input list="search-history" value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') onSubmit() }} className="flex-1 border rounded px-2 py-1" placeholder="Cerca..." />
          <datalist id="search-history">
            {history.map(h => <option key={h} value={h} />)}
          </datalist>
          {showScopeSelector && (
            <select value={scope} onChange={(e)=>setScope(e.target.value as SearchScope)} className="border rounded px-1 py-1">
              <option value="current">Questo PDF</option>
              <option value="open">Documenti aperti</option>
              <option value="archive">Tutto archivio</option>
            </select>
          )}
          <button className="px-2 py-1 border rounded" onClick={onSubmit}>Cerca</button>
        </div>
      )}
      {busy && <div className="p-2 text-gray-500">Indicizzazione/ricerca in corso…</div>}
      <div className="flex-1 overflow-auto">
        {results.length===0 ? (
          <div className="p-3 text-muted-foreground">Nessun risultato</div>
        ) : (
          <ul className="divide-y">
            {results.map(node => {
              const open = openNodes[node.id] ?? true
              return (
                <li
                  key={node.id}
                  className="py-1"
                  ref={(el) => { nodeRefs.current[node.query] = el }}
                >
                  <div className="flex items-center gap-2 px-2 hover:bg-gray-50">
                    <span className="text-gray-500 cursor-pointer" onClick={()=>toggle(node.id)}>{open ? '▾' : '▸'}</span>
                    <SearchIcon size={14} className={node.total === 0 ? "text-red-600" : "text-slate-700"} />
                    <span className={`font-semibold truncate ${node.total === 0 ? "text-red-600" : ""}`}>{node.query}</span>
                    <span className={node.total === 0 ? "text-red-600" : "text-gray-500"}>({node.total})</span>
                    <span className="ml-auto text-xs text-gray-400 cursor-pointer hover:text-red-600" onClick={()=>clearNode(node.id)}>🗑</span>
                  </div>
                  {open && (
                    <ul className="pl-6 py-1">
                      {node.groups.map(g => {
                        const o = openDocs[g.doc.id] ?? true
                        // ✅ Quando il titolo del documento è vuoto (scope 'current'), mostra solo i match senza header
                        if (!g.doc.title || g.doc.title.trim() === '') {
                          return (
                            <React.Fragment key={g.doc.id}>
                              {g.matches.map((m, matchIdx) => (
                                <li
                                  key={m.id || `${g.doc.id}-${m.page || 0}-${matchIdx}`}
                                  className={`px-2 py-1 cursor-pointer flex items-start gap-2 ${selectedId===m.id ? 'bg-amber-100' : 'hover:bg-blue-50'}`}
                                  onClick={async()=>{ setSelectedId(m.id); await navigateTo(m) }}
                                >
                                  <TypeIcon size={14} className="text-amber-600" />
                                  {renderSnippet(m.snippet, q)}
                                </li>
                              ))}
                            </React.Fragment>
                          )
                        }
                        // ✅ Quando c'è un titolo (scope 'archive' o 'open'), mostra l'header documento
                        return (
                          <li key={g.doc.id} className="mb-1">
                            <div className="px-2 py-0.5 text-gray-700 font-medium flex items-center gap-2">
                              <span className="text-gray-500 cursor-pointer" onClick={()=>toggleDoc(g.doc.id)}>{o ? '▾' : '▸'}</span>
                              <FileText size={14} className="text-gray-600" />
                              <span>{g.doc.title}</span>
                              <span className="text-gray-400">({g.matches.length})</span>
                            </div>
                            {o && (
                              <ul className="pl-4">
                                {g.matches.map((m, matchIdx) => (
                                  <li
                                    key={m.id || `${g.doc.id}-${m.page || 0}-${matchIdx}`}
                                    className={`px-2 py-1 cursor-pointer flex items-start gap-2 ${selectedId===m.id ? 'bg-amber-100' : 'hover:bg-blue-50'}`}
                                    onClick={async()=>{ setSelectedId(m.id); await navigateTo(m) }}
                                  >
                                    <TypeIcon size={14} className="text-amber-600" />
                                    {renderSnippet(m.snippet, q)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})


