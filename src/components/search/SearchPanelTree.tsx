import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search as SearchIcon, FileText, Type as TypeIcon, RotateCcw } from 'lucide-react'
import { useSearch, SearchScope } from './SearchProvider'

export const SearchPanelTree = React.memo<{ showInput?: boolean; showScopeSelector?: boolean; initialQuery?: string }>(({ showInput=true, showScopeSelector=true, initialQuery })=>{
  const { scope, setScope, history, results, busy, search, clearNode, navigateTo } = useSearch()
  const [q, setQ] = useState(initialQuery || '')
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
  const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const nodeRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const lastScrolledQuery = useRef<string | null>(null)

  // Stato per gestire contesti espansi e slider
  const [expandedTexts, setExpandedTexts] = useState<Record<string, string>>({})
  const [contextLines, setContextLines] = useState<Record<string, number>>({}) // matchId -> righe (0-10)
  const [hoveredMatchId, setHoveredMatchId] = useState<string | null>(null)
  const [loadingContext, setLoadingContext] = useState<Record<string, boolean>>({})

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

  // Funzione per recuperare contesto espanso dal backend
  const fetchExpandedContext = useCallback(async (
    matchId: string,
    docId: string,
    charIdx: number | undefined,
    lines: number
  ) => {
    // Validazione: charIdx deve essere presente e valido
    if (charIdx === undefined || charIdx < 0) {
      console.warn('[SEARCH][context] Invalid charIdx', { matchId, docId, charIdx })
      return
    }

    // Validazione: lines deve essere nel range valido
    if (lines < 0 || lines > 10) {
      console.warn('[SEARCH][context] Invalid lines value', { matchId, docId, lines })
      return
    }

    // Reset: rimuovi testo espanso se lines === 0
    if (lines === 0) {
      setExpandedTexts(prev => {
        const next = { ...prev }
        delete next[matchId]
        return next
      })
      setContextLines(prev => {
        const next = { ...prev }
        delete next[matchId]
        return next
      })
      setLoadingContext(prev => {
        const next = { ...prev }
        delete next[matchId]
        return next
      })
      return
    }

    // Evita chiamate duplicate
    if (loadingContext[matchId]) {
      return
    }

    setLoadingContext(prev => ({ ...prev, [matchId]: true }))

    try {
      const url = `/api/search/context?docId=${encodeURIComponent(docId)}&charIdx=${charIdx}&linesBefore=${lines}&linesAfter=${lines}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }))
        console.error('[SEARCH][context] Fetch failed', {
          matchId,
          docId,
          charIdx,
          lines,
          status: response.status,
          statusText: response.statusText,
          error: errorData
        })
        return
      }

      const data = await response.json()

      // Validazione risposta
      if (!data || typeof data !== 'object') {
        console.error('[SEARCH][context] Invalid response format', { matchId, docId, data })
        return
      }

      if (data.expandedText && typeof data.expandedText === 'string') {
        setExpandedTexts(prev => ({ ...prev, [matchId]: data.expandedText }))
        setContextLines(prev => ({ ...prev, [matchId]: lines }))
      } else {
        console.warn('[SEARCH][context] Missing or invalid expandedText', { matchId, docId, data })
      }
    } catch (error) {
      console.error('[SEARCH][context] Error fetching context', {
        matchId,
        docId,
        charIdx,
        lines,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    } finally {
      setLoadingContext(prev => {
        const next = { ...prev }
        delete next[matchId]
        return next
      })
    }
  }, [loadingContext])

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
                              {g.matches.map((m, matchIdx) => {
                                const matchId = m.id || `${g.doc.id}-${m.page || 0}-${matchIdx}`
                                const isHovered = hoveredMatchId === matchId
                                const hasExpanded = !!expandedTexts[matchId]
                                const currentLines = contextLines[matchId] || 0
                                const isLoading = loadingContext[matchId] || false
                                const displayText = expandedTexts[matchId] || m.snippet

                                // Debug log per verificare che il testo espanso venga mostrato
                                if (hasExpanded) {
                                  console.log('[SEARCH][CONTEXT] Rendering expanded text', {
                                    matchId,
                                    expandedLength: expandedTexts[matchId].length,
                                    originalSnippetLength: m.snippet.length,
                                    currentLines,
                                    displayTextPreview: displayText.substring(0, 100)
                                  })
                                }

                                return (
                                  <li
                                    key={matchId}
                                    className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-amber-100' : 'hover:bg-blue-50'}`}
                                    onMouseEnter={() => setHoveredMatchId(matchId)}
                                    onMouseLeave={() => setHoveredMatchId(null)}
                                    onClick={async()=>{ setSelectedId(m.id); await navigateTo(m) }}
                                  >
                                    <TypeIcon size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      {renderSnippet(displayText, q)}
                                      {isLoading && (
                                        <span className="text-xs text-gray-400 italic ml-1">Caricamento...</span>
                                      )}
                                    </div>
                                    {isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
                                      <div
                                        className="absolute right-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center bg-white/98 border border-gray-300 rounded-sm shadow-lg z-10"
                                        onMouseDown={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (m.charIdx !== undefined && m.charIdx >= 0) {
                                              fetchExpandedContext(matchId, m.docId, m.charIdx, 0)
                                            }
                                          }}
                                          className="w-7 h-7 flex items-center justify-center hover:bg-blue-50 rounded mb-2 transition-colors group"
                                          title="Reset: torna al contesto minimo (1 riga)"
                                          type="button"
                                        >
                                          <RotateCcw size={14} className="text-gray-600 group-hover:text-blue-600 transition-colors" />
                                        </button>
                                        <div
                                          className="flex flex-col items-center flex-1 mb-2 relative"
                                          title={`Trascina per espandere il contesto: ${currentLines === 0 ? 'minimo' : `${currentLines} righe`} di contesto sopra e sotto`}
                                        >
                                          <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            step="1"
                                            value={currentLines}
                                            onChange={(e) => {
                                              const lines = parseInt(e.target.value, 10)
                                              if (!isNaN(lines) && m.charIdx !== undefined && m.charIdx >= 0) {
                                                fetchExpandedContext(matchId, m.docId, m.charIdx, lines)
                                              }
                                            }}
                                            className="slider-vertical flex-1 cursor-grab active:cursor-grabbing"
                                            style={{ writingMode: 'bt-lr', width: '24px' }}
                                          />
                                        </div>
                                        <span className="text-xs text-gray-600 mt-1 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                                          {currentLines}
                                        </span>
                                      </div>
                                    )}
                                  </li>
                                )
                              })}
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
                                {g.matches.map((m, matchIdx) => {
                                  const matchId = m.id || `${g.doc.id}-${m.page || 0}-${matchIdx}`
                                  const isHovered = hoveredMatchId === matchId
                                  const hasExpanded = !!expandedTexts[matchId]
                                  const currentLines = contextLines[matchId] || 0
                                  const isLoading = loadingContext[matchId] || false
                                  const displayText = expandedTexts[matchId] || m.snippet

                                  // Debug log per verificare che il testo espanso venga mostrato
                                  if (hasExpanded) {
                                    console.log('[SEARCH][CONTEXT] Rendering expanded text', {
                                      matchId,
                                      expandedLength: expandedTexts[matchId].length,
                                      originalSnippetLength: m.snippet.length,
                                      currentLines,
                                      displayTextPreview: displayText.substring(0, 100)
                                    })
                                  }

                                  return (
                                    <li
                                      key={matchId}
                                      className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-amber-100' : 'hover:bg-blue-50'}`}
                                      onMouseEnter={() => setHoveredMatchId(matchId)}
                                      onMouseLeave={() => setHoveredMatchId(null)}
                                      onClick={async()=>{ setSelectedId(m.id); await navigateTo(m) }}
                                    >
                                      <TypeIcon size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        {renderSnippet(displayText, q)}
                                        {isLoading && (
                                          <span className="text-xs text-gray-400 italic ml-1">Caricamento...</span>
                                        )}
                                      </div>
                                      {isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
                                        <div
                                          className="absolute right-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center bg-white/98 border border-gray-300 rounded-sm shadow-lg z-10"
                                          onMouseDown={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (m.charIdx !== undefined && m.charIdx >= 0) {
                                                fetchExpandedContext(matchId, m.docId, m.charIdx, 0)
                                              }
                                            }}
                                            className="w-7 h-7 flex items-center justify-center hover:bg-blue-50 rounded mb-2 transition-colors group"
                                            title="Reset: torna al contesto minimo (1 riga)"
                                            type="button"
                                          >
                                            <RotateCcw size={14} className="text-gray-600 group-hover:text-blue-600 transition-colors" />
                                          </button>
                                          <div
                                            className="flex flex-col items-center flex-1 mb-2 relative"
                                            title={`Trascina per espandere il contesto: ${currentLines === 0 ? 'minimo' : `${currentLines} righe`} di contesto sopra e sotto`}
                                          >
                                            <input
                                              type="range"
                                              min="0"
                                              max="10"
                                              step="1"
                                              value={currentLines}
                                              onChange={(e) => {
                                                const lines = parseInt(e.target.value, 10)
                                                if (!isNaN(lines) && m.charIdx !== undefined && m.charIdx >= 0) {
                                                  fetchExpandedContext(matchId, m.docId, m.charIdx, lines)
                                                }
                                              }}
                                              className="slider-vertical flex-1 cursor-grab active:cursor-grabbing"
                                              style={{ writingMode: 'bt-lr', width: '24px' }}
                                            />
                                          </div>
                                          <span className="text-xs text-gray-600 mt-1 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                                            {currentLines}
                                          </span>
                                        </div>
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
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})


