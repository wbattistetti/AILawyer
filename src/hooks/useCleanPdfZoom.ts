import { useRef, useEffect } from 'react'

interface UseCleanPdfZoomOptions {
  zoomLevels?: number[]
  zoomToPlugin: (scale: number) => void
  getCurrentScale: () => number
}

export function useCleanPdfZoom(options: UseCleanPdfZoomOptions) {
  const {
    zoomLevels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 
                  1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.2, 2.4, 2.6, 2.8, 3],
    zoomToPlugin,
    getCurrentScale
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  
  // Wheel handler per Ctrl+Wheel zoom - IMMEDIATO e SEMPLICE
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      
      const direction = e.deltaY < 0 ? 1 : -1
      const currentScale = getCurrentScale()
      
      // Trova livello corrente più vicino
      let currentIdx = 0
      let minDist = Infinity
      for (let i = 0; i < zoomLevels.length; i++) {
        const dist = Math.abs(zoomLevels[i] - currentScale)
        if (dist < minDist) {
          minDist = dist
          currentIdx = i
        }
      }
      
      // Vai al livello successivo/precedente
      const newIdx = Math.max(0, Math.min(zoomLevels.length - 1, currentIdx + direction))
      const newScale = zoomLevels[newIdx]
      
      if (Math.abs(newScale - currentScale) > 0.01) {
        console.log('[ZOOM]', { 
          from: currentScale.toFixed(3), 
          to: newScale.toFixed(3) 
        })
        // ✅ Chiamata DIRETTA al plugin, NESSUN delay
        zoomToPlugin(newScale)
      }
    }
    
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    
    return () => {
      container.removeEventListener('wheel', handleWheel, true)
    }
  }, [zoomLevels, zoomToPlugin, getCurrentScale])
  
  return { containerRef }
}


