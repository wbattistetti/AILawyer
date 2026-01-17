/**
 * ✅ Hook comune per gestire l'estrazione di contenuti dai viewer
 * Supporta sia testo che screenshot
 */

import { useState, useCallback } from 'react'
import { ViewerExtract, ViewportBox } from '../types/viewer.types'
import { captureSelectionScreenshot } from '../utils/screenshot'

export interface UseViewerExtractProps {
  onExtract?: (extract: ViewerExtract) => void
}

export interface UseViewerExtractReturn {
  extract: ViewerExtract | null
  setExtract: (extract: ViewerExtract | null) => void
  createExtract: (params: {
    pageNumber: number
    text: string
    viewportBox: ViewportBox
    container?: HTMLElement
    includeScreenshot?: boolean
    source?: string
  }) => Promise<ViewerExtract>
  clearExtract: () => void
}

export function useViewerExtract({
  onExtract
}: UseViewerExtractProps = {}): UseViewerExtractReturn {
  const [extract, setExtractState] = useState<ViewerExtract | null>(null)

  const setExtract = useCallback((newExtract: ViewerExtract | null) => {
    setExtractState(newExtract)
    if (newExtract) {
      onExtract?.(newExtract)
    }
  }, [onExtract])

  const createExtract = useCallback(async ({
    pageNumber,
    text,
    viewportBox,
    container,
    includeScreenshot = false,
    source
  }: {
    pageNumber: number
    text: string
    viewportBox: ViewportBox
    container?: HTMLElement
    includeScreenshot?: boolean
    source?: string
  }): Promise<ViewerExtract> => {
    let imageDataUrl: string | undefined

    // ✅ Cattura screenshot se richiesto e container disponibile
    if (includeScreenshot && container) {
      try {
        imageDataUrl = await captureSelectionScreenshot(container, viewportBox)
      } catch (error) {
        console.warn('[useViewerExtract] Errore durante cattura screenshot:', error)
      }
    }

    const newExtract: ViewerExtract = {
      pageNumber,
      text,
      viewportBox,
      imageDataUrl,
      source
    }

    setExtract(newExtract)
    return newExtract
  }, [setExtract])

  const clearExtract = useCallback(() => {
    setExtract(null)
  }, [setExtract])

  return {
    extract,
    setExtract,
    createExtract,
    clearExtract
  }
}
