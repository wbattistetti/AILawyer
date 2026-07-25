/**
 * Gestione condivisa del ridimensionamento del pannello di ricerca.
 */

import { useEffect } from 'react'

interface UseDocumentSearchPanelResizerProps {
  resizingRef: React.MutableRefObject<boolean>
  setPanelW: React.Dispatch<React.SetStateAction<number>>
}

const clearBodyDragStyles = (): void => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

/**
 * Registra gli eventi globali necessari durante il trascinamento del resizer.
 */
export function useDocumentSearchPanelResizer({
  resizingRef,
  setPanelW
}: UseDocumentSearchPanelResizerProps): void {
  useEffect(() => {
    const stopResizing = () => {
      resizingRef.current = false
      clearBodyDragStyles()
    }

    const onMove = (event: MouseEvent) => {
      if (!resizingRef.current) return
      setPanelW((width) => Math.max(220, Math.min(560, width - event.movementX)))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && resizingRef.current) {
        stopResizing()
      }
    }

    const onDocumentLeave = () => {
      if (resizingRef.current) {
        stopResizing()
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stopResizing)
    document.addEventListener('keydown', onKeyDown, true)
    document.documentElement.addEventListener('mouseleave', onDocumentLeave)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stopResizing)
      document.removeEventListener('keydown', onKeyDown, true)
      document.documentElement.removeEventListener('mouseleave', onDocumentLeave)
      if (resizingRef.current) {
        stopResizing()
      }
    }
  }, [resizingRef, setPanelW])
}
