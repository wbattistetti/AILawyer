import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Search as SearchIcon, FileText, Type as TypeIcon, RotateCcw } from 'lucide-react'
import { useSearch, SearchScope } from './SearchProvider'
import { useToast } from '@/hooks/use-toast'
import { extractPageText } from '@/utils/extractPageText'

export interface SearchPanelTreeHandle {
  focusInput: () => void
}

interface SearchPanelTreeProps {
  showInput?: boolean
  showScopeSelector?: boolean
  initialQuery?: string
  isVisible?: boolean
}

export const SearchPanelTree = React.memo(
  forwardRef<SearchPanelTreeHandle, SearchPanelTreeProps>(
    ({ showInput=true, showScopeSelector=true, initialQuery, isVisible }, ref) => {
      const { scope, setScope, history, results, busy, search, clearNode, navigateTo } = useSearch()
      const { toast } = useToast()
      const [q, setQ] = useState(initialQuery || '')
      const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
      const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({})
      const [selectedId, setSelectedId] = useState<string | null>(null)
      const nodeRefs = useRef<Record<string, HTMLLIElement | null>>({})
      const lastScrolledQuery = useRef<string | null>(null)
      const inputRef = useRef<HTMLInputElement | null>(null)
      const renderCountRef = useRef(0)

      renderCountRef.current++
      console.log('[SEARCH][RENDER] SearchPanelTree renderizzato', {
        timestamp: Date.now(),
        renderCount: renderCountRef.current,
        showInput,
        isVisible,
        hasInputRef: !!inputRef.current
      })

      // Stato per gestire contesti espansi e slider
      const [expandedTexts, setExpandedTexts] = useState<Record<string, string>>({})
      const [contextLines, setContextLines] = useState<Record<string, number>>({}) // matchId -> righe (0-10)
      const [hoveredMatchId, setHoveredMatchId] = useState<string | null>(null)
      const [loadingContext, setLoadingContext] = useState<Record<string, boolean>>({})

      // Esponi il metodo focusInput tramite ref per controllo esplicito quando serve
      useImperativeHandle(ref, () => ({
        focusInput: () => {
          if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        }
      }), [])

      // Focus sull'input quando il pannello diventa visibile (solo una volta)
      const hasFocusedRef = useRef(false)
      useEffect(() => {
        if (isVisible && showInput && inputRef.current && !hasFocusedRef.current) {
          // Usa requestAnimationFrame per assicurarsi che il DOM sia pronto
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus()
              inputRef.current.select()
              hasFocusedRef.current = true
              console.log('[SEARCH][FOCUS][EFFECT] Focus applicato via useEffect')
            }
          })
        }

        // Reset quando il pannello viene chiuso
        if (!isVisible) {
          hasFocusedRef.current = false
        }
      }, [isVisible, showInput])

      // Mantieni il focus: riapplica quando viene perso (se il pannello è ancora visibile)
      useEffect(() => {
        if (!isVisible || !showInput || !inputRef.current) return

        const input = inputRef.current
        let blurTimeoutId: number | null = null

        const handleBlur = (e: FocusEvent) => {
          const activeElement = document.activeElement
          const relatedTarget = e.relatedTarget as HTMLElement | null

          console.log('[SEARCH][FOCUS][BLUR] Blur event ricevuto', {
            activeElement,
            relatedTarget,
            isSameInput: activeElement === input,
            inputValue: (input as HTMLInputElement).value
          })

          // ✅ Se il blur è causato da un altro elemento che prende il focus, non interferire
          // Ma verifica che NON sia lo stesso input (può succedere durante re-render)
          if (activeElement &&
              activeElement !== document.body &&
              activeElement !== document.documentElement &&
              activeElement !== input &&
              relatedTarget !== input) {
            console.log('[SEARCH][FOCUS][BLUR-HANDLED] Blur normale, elemento ha preso focus:', {
              activeElement,
              relatedTarget,
              tag: activeElement.tagName,
              id: activeElement.id
            })
            return
          }

          // ✅ Se nessun elemento ha preso il focus OPPURE è lo stesso input (re-render),
          // riapplica dopo un breve delay
          blurTimeoutId = window.setTimeout(() => {
            if (inputRef.current && isVisible) {
              const currentActive = document.activeElement
              // Ripristina sempre se non è già l'input (anche se è body/document o lo stesso input)
              if (currentActive !== inputRef.current) {
                console.log('[SEARCH][FOCUS][RESTORE] Ripristino focus dopo blur', {
                  currentActive,
                  willFocus: inputRef.current
                })
                inputRef.current.focus()
                inputRef.current.select()
              } else {
                console.log('[SEARCH][FOCUS][RESTORE] Focus già presente, nessun ripristino necessario')
              }
            }
          }, 50)
        }

        input.addEventListener('blur', handleBlur)

        return () => {
          input.removeEventListener('blur', handleBlur)
          if (blurTimeoutId !== null) {
            clearTimeout(blurTimeoutId)
          }
        }
      }, [isVisible, showInput])

      // Intercetta chiamate dirette a blur() sull'input
      useEffect(() => {
        if (!inputRef.current) return

        const input = inputRef.current
        const originalBlur = input.blur.bind(input)

        // Override blur() per tracciare chi lo chiama
        input.blur = function(...args: any[]) {
          console.log('[SEARCH][FOCUS][BLUR-CALLED] blur() chiamato direttamente', {
            timestamp: Date.now(),
            stackTrace: new Error().stack,
            activeElement: document.activeElement
          })
          return originalBlur(...args)
        }

        return () => {
          input.blur = originalBlur
        }
      }, [])

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
        <strong className="font-semibold text-foreground bg-accent/40 rounded px-0.5">{match}</strong>
        {after}
      </span>
    )
  }

  // ✅ Usa flex-1 invece di h-full per comportamento "Fill" come VB.NET
  return (
    <div className="flex flex-1 w-full flex-col text-sm">
      {showInput && (
        <div className="p-2 border-b bg-background text-foreground flex items-center gap-2">
          <SearchIcon size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            list="search-history"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==='Enter') onSubmit() }}
            onFocus={(e) => {
              console.log('[SEARCH][FOCUS][ONFOCUS] Input ha ricevuto focus', {
                timestamp: Date.now(),
                target: e.target,
                relatedTarget: e.relatedTarget,
                activeElement: document.activeElement,
                stackTrace: new Error().stack
              })
            }}
            onBlur={(e) => {
              console.log('[SEARCH][FOCUS][ONBLUR] Input ha perso focus', {
                timestamp: Date.now(),
                target: e.target,
                relatedTarget: e.relatedTarget,
                activeElementAfterBlur: document.activeElement,
                activeElementTag: document.activeElement?.tagName,
                activeElementId: document.activeElement?.id,
                activeElementClass: document.activeElement?.className,
                stackTrace: new Error().stack
              })
            }}
            className="flex-1 border rounded px-2 py-1 bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Cerca..."
          />
          <datalist id="search-history">
            {history.map(h => <option key={h} value={h} />)}
          </datalist>
          {showScopeSelector && (
            <select
              value={scope}
              onChange={(e)=>setScope(e.target.value as SearchScope)}
              className="border rounded px-1 py-1 bg-background text-foreground"
            >
              <option value="current">Questo PDF</option>
              <option value="open">Documenti aperti</option>
              <option value="archive">Tutto archivio</option>
            </select>
          )}
          <button className="px-2 py-1 border rounded bg-background text-foreground hover:bg-muted" onClick={onSubmit}>Cerca</button>
        </div>
      )}
      {busy && <div className="p-2 text-muted-foreground">Indicizzazione/ricerca in corso…</div>}
      <div className="flex-1 overflow-auto min-h-0">
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
                  <div className="flex items-center gap-2 px-2 hover:bg-muted/40">
                    <span className="text-muted-foreground cursor-pointer" onClick={()=>toggle(node.id)}>{open ? '▾' : '▸'}</span>
                    <SearchIcon size={14} className={node.total === 0 ? "text-destructive" : "text-foreground"} />
                    <span className={`font-semibold truncate ${node.total === 0 ? "text-destructive" : "text-foreground"}`}>{node.query}</span>
                    <span className={node.total === 0 ? "text-destructive" : "text-muted-foreground"}>({node.total})</span>
                    <span className="ml-auto text-xs text-muted-foreground cursor-pointer hover:text-destructive" onClick={()=>clearNode(node.id)}>🗑</span>
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
                                    className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-muted' : 'hover:bg-muted/40'}`}
                                    onMouseEnter={() => setHoveredMatchId(matchId)}
                                    onMouseLeave={() => setHoveredMatchId(null)}
                                    onClick={async()=>{
                                      setSelectedId(m.id)
                                      // Copia testo pagina nella clipboard
                                      try {
                                        const pageText = await extractPageText(m.docId, m.page || 1)
                                        const pageNumber = m.page || 1
                                        const textWithPageInfo = `${pageText}\n\n---\nPagina ${pageNumber}`
                                        await navigator.clipboard.writeText(textWithPageInfo)
                                        toast({
                                          title: 'Testo copiato',
                                          description: `Testo della pagina ${pageNumber} copiato nella clipboard`,
                                        })
                                      } catch (error) {
                                        console.error('[SEARCH] Error copying page text:', error)
                                        toast({
                                          title: 'Errore',
                                          description: 'Impossibile copiare il testo della pagina',
                                          variant: 'destructive',
                                        })
                                      }
                                      await navigateTo(m)
                                    }}
                                  >
                                    <TypeIcon size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      {renderSnippet(displayText, q)}
                                      {isLoading && (
                                        <span className="text-xs text-muted-foreground italic ml-1">Caricamento...</span>
                                      )}
                                    </div>
                                    {isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
                                      <div
                                        className="absolute right-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center bg-popover/95 border border-border rounded-sm shadow-lg z-10"
                                        onMouseDown={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (m.charIdx !== undefined && m.charIdx >= 0) {
                                              fetchExpandedContext(matchId, m.docId, m.charIdx, 0)
                                            }
                                          }}
                                          className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded mb-2 transition-colors group"
                                          title="Reset: torna al contesto minimo (1 riga)"
                                          type="button"
                                        >
                                          <RotateCcw size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
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
                                        <span className="text-xs text-muted-foreground mt-1 font-semibold bg-muted px-1.5 py-0.5 rounded">
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
                            <div className="px-2 py-0.5 text-foreground font-medium flex items-center gap-2">
                              <span className="text-muted-foreground cursor-pointer" onClick={()=>toggleDoc(g.doc.id)}>{o ? '▾' : '▸'}</span>
                              <FileText size={14} className="text-muted-foreground" />
                              <span>{g.doc.title}</span>
                              <span className="text-muted-foreground">({g.matches.length})</span>
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
                                      className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-muted' : 'hover:bg-muted/40'}`}
                                      onMouseEnter={() => setHoveredMatchId(matchId)}
                                      onMouseLeave={() => setHoveredMatchId(null)}
                                      onClick={async()=>{
                                      setSelectedId(m.id)
                                      // Copia testo pagina nella clipboard
                                      try {
                                        const pageText = await extractPageText(m.docId, m.page || 1)
                                        const pageNumber = m.page || 1
                                        const textWithPageInfo = `${pageText}\n\n---\nPagina ${pageNumber}`
                                        await navigator.clipboard.writeText(textWithPageInfo)
                                        toast({
                                          title: 'Testo copiato',
                                          description: `Testo della pagina ${pageNumber} copiato nella clipboard`,
                                        })
                                      } catch (error) {
                                        console.error('[SEARCH] Error copying page text:', error)
                                        toast({
                                          title: 'Errore',
                                          description: 'Impossibile copiare il testo della pagina',
                                          variant: 'destructive',
                                        })
                                      }
                                      await navigateTo(m)
                                    }}
                                    >
                                      <TypeIcon size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        {renderSnippet(displayText, q)}
                                        {isLoading && (
                                          <span className="text-xs text-muted-foreground italic ml-1">Caricamento...</span>
                                        )}
                                      </div>
                                      {isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
                                        <div
                                          className="absolute right-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center bg-popover/95 border border-border rounded-sm shadow-lg z-10"
                                          onMouseDown={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (m.charIdx !== undefined && m.charIdx >= 0) {
                                                fetchExpandedContext(matchId, m.docId, m.charIdx, 0)
                                              }
                                            }}
                                            className="w-7 h-7 flex items-center justify-center hover:bg-muted rounded mb-2 transition-colors group"
                                            title="Reset: torna al contesto minimo (1 riga)"
                                            type="button"
                                          >
                                            <RotateCcw size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
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
                                          <span className="text-xs text-muted-foreground mt-1 font-semibold bg-muted px-1.5 py-0.5 rounded">
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
    }
  )
)


