/**
 * Synchronizes a document viewer with its hosting dock panel lifecycle.
 */

import { useEffect, useRef, useState } from 'react'
import type { ViewerPanelApi } from '../types/viewer.types'
import { createPanelLayoutRefreshScheduler } from './panelLayoutRefreshScheduler'

interface UseViewerPanelLifecycleOptions {
  panelApi?: ViewerPanelApi
  fallbackIsActive?: boolean
  onLayoutChange?: () => void
}

/**
 * Tracks panel activation and schedules layout refreshes after dock resizing settles.
 * Dopo uno split, ripete il refresh a breve distanza: il primo frame spesso vede ancora 0×0.
 */
export function useViewerPanelLifecycle({
  panelApi,
  fallbackIsActive = false,
  onLayoutChange
}: UseViewerPanelLifecycleOptions): boolean {
  const [isActive, setIsActive] = useState(
    () => panelApi?.isActive ?? fallbackIsActive
  )
  const onLayoutChangeRef = useRef(onLayoutChange)

  useEffect(() => {
    onLayoutChangeRef.current = onLayoutChange
  }, [onLayoutChange])

  useEffect(() => {
    if (!panelApi) {
      setIsActive(fallbackIsActive)
      return
    }

    if (
      typeof panelApi.onDidActiveChange !== 'function' ||
      typeof panelApi.onDidDimensionsChange !== 'function'
    ) {
      throw new Error(
        'ViewerPanelApi non valida: sono richiesti gli eventi di attivazione e ridimensionamento'
      )
    }

    let lastWidth = panelApi.width
    let lastHeight = panelApi.height
    let delayedTimer: ReturnType<typeof setTimeout> | undefined
    const refreshScheduler = createPanelLayoutRefreshScheduler(() => {
      onLayoutChangeRef.current?.()
      // Secondo passaggio: react-pdf-viewer a volte ripinta solo dopo che il pane ha size stabile.
      if (delayedTimer) clearTimeout(delayedTimer)
      delayedTimer = setTimeout(() => {
        onLayoutChangeRef.current?.()
      }, 120)
    })

    setIsActive(panelApi.isActive)

    const activeDisposable = panelApi.onDidActiveChange((event) => {
      setIsActive(event.isActive)
      if (event.isActive) refreshScheduler.schedule()
    })

    const dimensionsDisposable = panelApi.onDidDimensionsChange((event) => {
      if (
        !Number.isFinite(event.width) ||
        !Number.isFinite(event.height) ||
        event.width < 0 ||
        event.height < 0
      ) {
        throw new Error(
          `Dimensioni pannello non valide: ${event.width}x${event.height}`
        )
      }

      if (event.width === lastWidth && event.height === lastHeight) return

      lastWidth = event.width
      lastHeight = event.height
      if (event.width > 0 && event.height > 0) refreshScheduler.schedule()
    })

    return () => {
      refreshScheduler.cancel()
      if (delayedTimer) clearTimeout(delayedTimer)
      activeDisposable.dispose()
      dimensionsDisposable.dispose()
    }
  }, [fallbackIsActive, panelApi])

  return isActive
}
