import { useState, useCallback, useMemo } from 'react'
import { getReatoSuggestions, isReatoValid } from '../utils/reatoSuggestions'

interface UseReatoSuggestionsProps {
    debounceMs?: number
    minQueryLength?: number
    maxSuggestions?: number
}

export const useReatoSuggestions = ({
    debounceMs = 300,
    minQueryLength = 2,
    maxSuggestions = 10
}: UseReatoSuggestionsProps = {}) => {
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<string[]>([])

    // Genera suggerimenti basati sulla query
    const generateSuggestions = useCallback((searchQuery: string) => {
        if (searchQuery.length < minQueryLength) {
            setSuggestions([])
            return
        }

        setIsLoading(true)

        // Simula debounce
        const timeoutId = setTimeout(() => {
            const newSuggestions = getReatoSuggestions(searchQuery).slice(0, maxSuggestions)
            setSuggestions(newSuggestions)
            setIsLoading(false)
        }, debounceMs)

        return () => clearTimeout(timeoutId)
    }, [debounceMs, minQueryLength, maxSuggestions])

    // Aggiorna la query e genera suggerimenti
    const updateQuery = useCallback((newQuery: string) => {
        setQuery(newQuery)
        generateSuggestions(newQuery)
    }, [generateSuggestions])

    // Pulisce i suggerimenti
    const clearSuggestions = useCallback(() => {
        setSuggestions([])
        setQuery('')
    }, [])

    // Seleziona un suggerimento
    const selectSuggestion = useCallback((selectedReato: string) => {
        setQuery(selectedReato)
        setSuggestions([])
    }, [])

    // Verifica se la query è valida
    const isValidReato = useMemo(() => {
        return query.length >= minQueryLength && isReatoValid(query)
    }, [query, minQueryLength])

    // Verifica se ci sono suggerimenti
    const hasSuggestions = useMemo(() => {
        return suggestions.length > 0
    }, [suggestions.length])

    // Verifica se la query è vuota
    const isEmpty = useMemo(() => {
        return query.length === 0
    }, [query.length])

    return {
        query,
        suggestions,
        isLoading,
        isValidReato,
        hasSuggestions,
        isEmpty,
        updateQuery,
        clearSuggestions,
        selectSuggestion,
        generateSuggestions
    }
}
