import { useState, useRef, useCallback } from 'react'
import { MatchItem } from '../types'

interface UsePdfSearchProps {
	docId?: string
	fileUrl: string
}

interface UsePdfSearchReturn {
	searchQ: string
	setSearchQ: (q: string) => void
	matches: MatchItem[]
	runSearch: (qOverride?: string) => Promise<MatchItem[]>
	goToMatch: (match: any) => Promise<void>
	searchCacheRef: React.MutableRefObject<Map<string, MatchItem[]>>
}

export const usePdfSearch = ({ docId, fileUrl }: UsePdfSearchProps): UsePdfSearchReturn => {
	const [searchQ, setSearchQ] = useState<string>('')
	const [matches, setMatches] = useState<MatchItem[]>([])
	const searchCacheRef = useRef<Map<string, MatchItem[]>>(new Map())

	const runSearch = useCallback(async (qOverride?: string): Promise<MatchItem[]> => {
		const qRaw = ((qOverride != null ? qOverride : searchQ) || '').trim()
		if (!qRaw) {
			setMatches([])
			return []
		}

		if (!docId) {
			console.error('[SEARCH][ERROR] docId is missing! Cannot search without document ID.')
			setMatches([])
			return []
		}

		const cacheKey = `${fileUrl}::${qRaw.toLowerCase()}::${docId}`

		if (searchCacheRef.current.has(cacheKey)) {
			const cached = searchCacheRef.current.get(cacheKey) || []
			console.log('[SEARCH][cache][hit]', { q: qRaw, cached: cached.length })
			setMatches(cached)
			return cached
		}

		console.log('[SEARCH][ocr][start]', { docId, q: qRaw })
		const found = await searchViaOcrBackend(docId, qRaw)
		console.log('[SEARCH][ocr][done]', { count: found.length })

		if (found.length === 0) {
			console.warn('[SEARCH][ocr][NO_RESULTS]', { docId, q: qRaw })
		}

		setMatches(found)
		searchCacheRef.current.set(cacheKey, found)

		return found
	}, [searchQ, docId, fileUrl])

	const goToMatch = useCallback(async (match: any) => {
		// Implementation would go here - this would need access to many dependencies
		// For now, this is a placeholder
		console.log('[GOTO] match navigation', match)
	}, [])

	return {
		searchQ,
		setSearchQ,
		matches,
		runSearch,
		goToMatch,
		searchCacheRef
	}
}
