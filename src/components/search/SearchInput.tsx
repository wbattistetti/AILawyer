/**
 * Input di ricerca condiviso con focus, submit e scope coerenti.
 */

import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent
} from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useSearch } from './SearchProvider'
import type { SearchScope } from './types'

export interface SearchInputHandle {
  focus: () => void
  getElement: () => HTMLInputElement | null
}

interface SearchInputProps {
  rolePrefix?: string
  initialQuery?: string
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  onSearchQChange?: (value: string) => void
  domUncontrolled?: boolean
  resetKey?: string
  showScopeSelector?: boolean
  currentScopeLabel?: string
  placeholder?: string
  variant?: 'panel' | 'compact'
  onSearchStart?: () => void
  onSearchError?: (error: Error) => void
}

/**
 * Espone un unico comportamento di input per ricerca documento e pratica.
 */
export const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput({
    rolePrefix = 'document',
    initialQuery = '',
    searchQuery,
    onSearchQueryChange,
    onSearchQChange,
    domUncontrolled = false,
    resetKey,
    showScopeSelector = true,
    currentScopeLabel = 'Questo documento',
    placeholder = 'Cerca...',
    variant = 'panel',
    onSearchStart,
    onSearchError
  }, ref) {
    const listId = useId()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [internalQuery, setInternalQuery] = useState(initialQuery)
    const { scope, setScope, history, busy, search } = useSearch()
    const { toast } = useToast()
    const hasExternalState = typeof onSearchQueryChange === 'function'
    const useDomState = domUncontrolled && hasExternalState
    const displayedQuery = hasExternalState ? (searchQuery ?? '') : internalQuery
    const setQuery = hasExternalState ? onSearchQueryChange : setInternalQuery

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus({ preventScroll: true }),
      getElement: () => inputRef.current
    }), [])

    const submit = async () => {
      const rawQuery = useDomState ? (inputRef.current?.value ?? '') : displayedQuery
      const trimmedQuery = rawQuery.trim()
      if (!trimmedQuery) return

      try {
        onSearchStart?.()
        await search(trimmedQuery)
        if (!hasExternalState) onSearchQChange?.(trimmedQuery)
      } catch (cause) {
        const error = cause instanceof Error
          ? cause
          : new Error('Errore imprevisto durante la ricerca')

        if (onSearchError) {
          onSearchError(error)
          return
        }

        console.error('[SEARCH] Ricerca fallita:', error)
        toast({
          title: 'Ricerca non riuscita',
          description: error.message,
          variant: 'destructive'
        })
      }
    }

    const inputStateProps = useDomState
      ? {
          defaultValue: searchQuery ?? '',
          onInput: (event: FormEvent<HTMLInputElement>) => {
            setQuery?.(event.currentTarget.value)
          }
        }
      : {
          value: displayedQuery,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            setQuery?.(event.target.value)
          }
        }

    const compact = variant === 'compact'

    return (
      <div className={compact
        ? 'flex h-9 w-72 shrink-0 items-center gap-1 border-l border-b bg-background px-2 shadow-sm'
        : 'flex flex-shrink-0 items-center gap-2 border-b bg-background p-2 text-foreground'
      }>
        <SearchIcon
          size={compact ? 15 : 16}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          key={useDomState ? String(resetKey ?? 'search-input') : undefined}
          ref={inputRef}
          data-role={`${rolePrefix}-search-input`}
          type="text"
          list={listId}
          {...inputStateProps}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
          onClick={() => {
            if (inputRef.current && document.activeElement !== inputRef.current) {
              inputRef.current.focus({ preventScroll: true })
            }
          }}
          className={compact
            ? 'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
            : 'min-w-0 flex-1 rounded border bg-background px-2 py-1 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          }
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <datalist id={listId}>
          {history.map((query) => <option key={query} value={query} />)}
        </datalist>
        {showScopeSelector && (
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as SearchScope)}
            className="rounded border bg-background px-1 py-1 text-foreground"
          >
            <option value="current">{currentScopeLabel}</option>
            <option value="open">Documenti aperti</option>
            <option value="archive">Tutto archivio</option>
          </select>
        )}
        <button
          type="button"
          className={compact
            ? 'shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50'
            : 'rounded border bg-background px-2 py-1 text-foreground hover:bg-muted disabled:opacity-50'
          }
          onClick={() => void submit()}
          disabled={busy || !String(useDomState ? inputRef.current?.value ?? displayedQuery : displayedQuery).trim()}
        >
          {busy && compact ? '…' : 'Cerca'}
        </button>
      </div>
    )
  }
)
