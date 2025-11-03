import React, { useRef } from 'react'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { searchPlugin } from '@react-pdf-viewer/search'
import { zoomPlugin } from '@react-pdf-viewer/zoom'
import { highlightPlugin } from '@react-pdf-viewer/highlight'

/**
 * Hook per creare e gestire i plugin del PDF viewer.
 * Usa useRef per evitare ricreazioni ad ogni render.
 */
export function usePdfPlugins() {
  const scrollModeRef = useRef(scrollModePlugin())
  const pageNavRef = useRef(pageNavigationPlugin())
  const searchRef = useRef(searchPlugin())
  const zoomRef = useRef(zoomPlugin())
  const highlightRef = useRef(
    highlightPlugin({
      renderHighlights: () => {
        return React.createElement(React.Fragment)
      }
    })
  )

  return {
    scrollMode: scrollModeRef.current,
    pageNav: pageNavRef.current,
    search: searchRef.current,
    zoom: zoomRef.current,
    highlight: highlightRef.current
  }
}

