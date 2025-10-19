import { useEffect, useRef } from 'react'
import { logger } from '../../../../utils/logger'
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist'

export interface UsePdfDocumentProps {
	fileUrl: string
}

export interface UsePdfDocumentReturn {
	pdfDocRef: React.MutableRefObject<any>
}

export function usePdfDocument({ fileUrl }: UsePdfDocumentProps): UsePdfDocumentReturn {
	const pdfDocRef = useRef<any>(null)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				logger.debug('PDF[getDocument][start]', { fileUrl })
				const loadingTask = (pdfjsLib as any).getDocument({ url: fileUrl, disableWorker: true })
				const doc = await loadingTask.promise
				logger.debug('PDF[getDocument][done]', { pages: doc?.numPages || 0 })
				if (!cancelled) pdfDocRef.current = doc
			} catch {}
		})()
		return () => { cancelled = true }
	}, [fileUrl])

	return {
		pdfDocRef
	}
}
