/**
 * ✅ Hook comune per gestire la selezione nei viewer
 * Astrae la logica di selezione che può essere implementata diversamente per PDF/Word
 */

import { useState, useCallback } from 'react'
import { ViewerSelection } from '../types/viewer.types'

export interface UseViewerSelectionProps {
  onSelectionChange?: (selection: ViewerSelection | null) => void
}

export interface UseViewerSelectionReturn {
  selection: ViewerSelection | null
  setSelection: (selection: ViewerSelection | null) => void
  clearSelection: () => void
}

export function useViewerSelection({
  onSelectionChange
}: UseViewerSelectionProps = {}): UseViewerSelectionReturn {
  const [selection, setSelectionState] = useState<ViewerSelection | null>(null)

  const setSelection = useCallback((newSelection: ViewerSelection | null) => {
    setSelectionState(newSelection)
    onSelectionChange?.(newSelection)
  }, [onSelectionChange])

  const clearSelection = useCallback(() => {
    setSelection(null)
  }, [setSelection])

  return {
    selection,
    setSelection,
    clearSelection
  }
}
