import React, { useMemo, useState } from 'react'
import { Search as SearchIcon, FileText, Type as TypeIcon } from 'lucide-react'
import { useSearch, SearchScope } from './SearchProvider'

export const SearchPanelTree: React.FC<{ showInput?: boolean }>=({ showInput=true })=>{
  const { scope, setScope, history, results, busy, search, clearNode, navigateTo } = useSearch()
  const [q, setQ] = useState('')
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
  const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onSubmit = () => { if (q.trim()) search(q.trim()) }
  const toggle = (id: string) => setOpenNodes(s => ({ ...s, [id]: !s[id] }))
  const toggleDoc = (id: string) => setOpenDocs(s => ({ ...s, [id]: !s[id] }))

  const renderSnippet = (snippet: string) => {
    const query = (q || '').trim()
    if (!query) return <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>{snippet}</span>
    const idx = snippet.toLowerCase().indexOf(query.toLowerCase())
    if (idx < 0) return <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>{snippet}</span>
    const before = snippet.slice(0, idx)
    const match = snippet.slice(idx, idx + query.length)
    const after = snippet.slice(idx + query.length)
    return (
      <span style={{ whiteSpace:'normal', wordBreak:'break-word' }}>
        {before}
        <strong>{match}</strong>
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
          <select value={scope} onChange={(e)=>setScope(e.target.value as SearchScope)} className="border rounded px-1 py-1">
            <option value="current">Questo PDF</option>
            <option value="open">Documenti aperti</option>
            <option value="archive">Tutto archivio</option>
          </select>
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
                <li key={node.id} className="py-1">
                  <div className="flex items-center gap-2 px-2 hover:bg-gray-50">
                    <span className="text-gray-500 cursor-pointer" onClick={()=>toggle(node.id)}>{open ? '▾' : '▸'}</span>
                    <SearchIcon size={14} className="text-slate-700" />
                    <span className="font-semibold truncate">{node.query}</span>
                    <span className="text-gray-500">({node.total})</span>
                    <span className="ml-auto text-xs text-gray-400 cursor-pointer hover:text-red-600" onClick={()=>clearNode(node.id)}>🗑</span>
                  </div>
                  {open && (
                    <ul className="pl-6 py-1">
                      {node.groups.map(g => {
                        const o = openDocs[g.doc.id] ?? true
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
                                {g.matches.map(m => (
                                  <li
                                    key={m.id}
                                    className={`px-2 py-1 cursor-pointer flex items-start gap-2 ${selectedId===m.id ? 'bg-amber-100' : 'hover:bg-blue-50'}`}
                                    onClick={async()=>{ setSelectedId(m.id); await navigateTo(m) }}
                                  >
                                    <TypeIcon size={14} className="text-amber-600" />
                                    {renderSnippet(m.snippet)}
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
}


