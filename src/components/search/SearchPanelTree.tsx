import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Search as SearchIcon, FileText, Type as TypeIcon, RotateCcw, Trash2 } from 'lucide-react'
import { useSearch } from './SearchProvider'
import { useToast } from '@/hooks/use-toast'
import { extractPageText } from '@/utils/extractPageText'
import { SearchInput, type SearchInputHandle } from './SearchInput'

export interface SearchPanelTreeHandle {
  focusInput: () => void
  /** Espone l’input nativo per focus/retry scoped (niente querySelector globale). */
  getInputElement: () => HTMLInputElement | null
}

interface SearchPanelTreeProps {
  showInput?: boolean
  showScopeSelector?: boolean
  initialQuery?: string
  isVisible?: boolean
  /** Prefisso per data-role dell'input (`${prefix}-search-input`) e per evitare collisioni tra viewer PDF e ricerca archivio */
  rolePrefix?: string
  /**
   * Viewer PDF: `searchQuery` + `onSearchQueryChange` controllano l’input dallo shell (nessun reset da stato locale).
   * Se `onSearchQueryChange` non è passato, si usa stato interno + `initialQuery`.
   */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  /** Solo modalità non controllata: dopo submit sincronizza il genitore. */
  onSearchQChange?: (value: string) => void
  /**
   * PDF: input gestito dal browser (`defaultValue` + `onInput`), non `value=` React.
   * Evita conflitti tra stato shell e DOM durante la digitazione.
   */
  domUncontrolledSearch?: boolean
  /** Cambia con il documento per remount pulito dell’input (es. docId). */
  resetSearchKey?: string
  /** Abilita il recupero del contesto testuale dal backend. */
  enableExpandedContext?: boolean
  /** Copia il testo della pagina prima della navigazione. */
  copyPageTextOnNavigate?: boolean
  /** Etichetta dello scope corrente per il tipo di documento. */
  currentScopeLabel?: string
  /** Testo guida mostrato nell'input di ricerca. */
  searchPlaceholder?: string
}

export const SearchPanelTree = React.memo(
  forwardRef<SearchPanelTreeHandle, SearchPanelTreeProps>(
    ({
      showInput = true,
      showScopeSelector = true,
      initialQuery,
      isVisible: _isVisible,
      rolePrefix = 'document',
      searchQuery,
      onSearchQueryChange,
      onSearchQChange,
      domUncontrolledSearch,
      resetSearchKey,
      enableExpandedContext = true,
      copyPageTextOnNavigate = true,
      currentScopeLabel = 'Questo documento',
      searchPlaceholder = 'Cerca...'
    }, ref) => {
      const { results, busy, clearNode, navigateTo } = useSearch()
      const { toast } = useToast()
      const hasExternalSync = typeof onSearchQueryChange === 'function'
      const isDomUncontrolled = domUncontrolledSearch === true && hasExternalSync
      const [internalQ, setInternalQ] = useState(initialQuery || '')
      const qForUi = hasExternalSync ? (searchQuery ?? '') : internalQ
      const setQ = hasExternalSync ? onSearchQueryChange! : setInternalQ
      const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
      const [openDocs, setOpenDocs] = useState<Record<string, boolean>>({})
      const [selectedId, setSelectedId] = useState<string | null>(null)
      const nodeRefs = useRef<Record<string, HTMLLIElement | null>>({})
      const lastScrolledQuery = useRef<string | null>(null)
      const inputRef = useRef<SearchInputHandle | null>(null)

      // Stato per gestire contesti espansi e slider
      const [expandedTexts, setExpandedTexts] = useState<Record<string, string>>({})
      const [contextLines, setContextLines] = useState<Record<string, number>>({}) // matchId -> righe (0-10)
      const [hoveredMatchId, setHoveredMatchId] = useState<string | null>(null)
      const [loadingContext, setLoadingContext] = useState<Record<string, boolean>>({})

      // ✅ Focus gestito esternamente via ref (chiamato da SearchPanel quando showAdvanced diventa true)
      // Il pannello è sempre montato, quindi inputRef.current è sempre disponibile
      useImperativeHandle(ref, () => ({
        focusInput: () => {
          inputRef.current?.focus()
        },
        getInputElement: () => inputRef.current?.getElement() ?? null
      }), [])

      // ❌ RIMOSSO: useEffect con setTimeout per focus automatico
      // Il focus è ora gestito in modo sincrono dall'esterno via ref quando il pannello si apre

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
    <div className="flex flex-1 w-full min-h-0 flex-col text-sm">
      {showInput && (
        <SearchInput
          ref={inputRef}
          rolePrefix={rolePrefix}
          initialQuery={initialQuery}
          searchQuery={qForUi}
          onSearchQueryChange={setQ}
          onSearchQChange={onSearchQChange}
          domUncontrolled={isDomUncontrolled}
          resetKey={resetSearchKey}
          showScopeSelector={showScopeSelector}
          currentScopeLabel={currentScopeLabel}
          placeholder={searchPlaceholder}
        />
      )}
      {busy && <div className="p-2 text-muted-foreground flex-shrink-0">Indicizzazione/ricerca in corso…</div>}
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
                  <div className="group flex items-center gap-2 px-2 hover:bg-muted/40">
                    <span className="text-muted-foreground cursor-pointer" onClick={()=>toggle(node.id)}>{open ? '▾' : '▸'}</span>
                    <SearchIcon size={14} className={node.total === 0 ? "text-destructive" : "text-foreground"} />
                    <span className={`font-semibold truncate ${node.total === 0 ? "text-destructive" : "text-foreground"}`}>{node.query}</span>
                    <span className={node.total === 0 ? "text-destructive" : "text-muted-foreground"}>({node.total})</span>
                    <button
                      type="button"
                      className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                      title={`Elimina la ricerca "${node.query}"`}
                      aria-label={`Elimina la ricerca "${node.query}"`}
                      onClick={() => clearNode(node.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
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
                                const currentLines = contextLines[matchId] || 0
                                const isLoading = loadingContext[matchId] || false
                                const displayText = expandedTexts[matchId] || m.snippet

                                  return (
                                  <li
                                    key={matchId}
                                    className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-muted' : 'hover:bg-muted/40'}`}
                                    onMouseEnter={() => setHoveredMatchId(matchId)}
                                    onMouseLeave={() => setHoveredMatchId(null)}
                                    onClick={async()=>{
                                      setSelectedId(m.id)
                                      if (copyPageTextOnNavigate) {
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
                                      }
                                      await navigateTo(m)
                                    }}
                                  >
                                    <TypeIcon size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      {renderSnippet(displayText, qForUi)}
                                      {isLoading && (
                                        <span className="text-xs text-muted-foreground italic ml-1">Caricamento...</span>
                                      )}
                                    </div>
                                    {enableExpandedContext && isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
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
                                  const currentLines = contextLines[matchId] || 0
                                  const isLoading = loadingContext[matchId] || false
                                  const displayText = expandedTexts[matchId] || m.snippet

                                  return (
                                    <li
                                      key={matchId}
                                      className={`px-2 py-1 cursor-pointer flex items-start gap-2 relative group ${selectedId===m.id ? 'bg-muted' : 'hover:bg-muted/40'}`}
                                      onMouseEnter={() => setHoveredMatchId(matchId)}
                                      onMouseLeave={() => setHoveredMatchId(null)}
                                      onClick={async()=>{
                                      setSelectedId(m.id)
                                      if (copyPageTextOnNavigate) {
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
                                      }
                                      await navigateTo(m)
                                    }}
                                    >
                                      <TypeIcon size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        {renderSnippet(displayText, qForUi)}
                                        {isLoading && (
                                          <span className="text-xs text-muted-foreground italic ml-1">Caricamento...</span>
                                        )}
                                      </div>
                                      {enableExpandedContext && isHovered && m.charIdx !== undefined && m.charIdx >= 0 && (
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

export default SearchPanelTree

