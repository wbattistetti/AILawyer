/**
 * Word Viewer Core - Renderizza documenti Word (.docx) come HTML
 */

import React, { useRef, useEffect, useState, forwardRef } from 'react'
import mammoth from 'mammoth'
import { ViewerCoreProps, ViewerHandle } from '../../common/types/viewer.types'

export interface WordViewerHandle extends ViewerHandle {
  // Metodi specifici Word se necessari
}

interface WordViewerCoreProps extends ViewerCoreProps {
  // Props specifiche Word se necessarie
}

const WordViewerCoreInner = forwardRef<WordViewerHandle, WordViewerCoreProps>(
  ({ fileUrl, page, onPageChange, docId, hostRef, onDocumentLoad, onZoom }, ref) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [htmlContent, setHtmlContent] = useState<string>('')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [totalPages, setTotalPages] = useState(1)
    const [currentPage, setCurrentPage] = useState(page || 1)
    const scaleRef = useRef<number>(1)

    React.useImperativeHandle(ref, () => ({
      zoomTo: (newScale: number) => {
        scaleRef.current = newScale

        if (contentRef.current) {
          contentRef.current.style.setProperty('--scale-factor', String(newScale))
        }

        onZoom?.(newScale)
      },
      jumpToPage: (pageNum: number) => {
        const page = Math.max(1, Math.min(pageNum, totalPages))
        setCurrentPage(page)
        onPageChange?.(page)
        // Scroll alla pagina
        const pageElement = contentRef.current?.querySelector(`[data-page="${page}"]`)
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      },
      getCurrentPage: () => currentPage,
      getTotalPages: () => totalPages,
      getCurrentScale: () => scaleRef.current
    }), [currentPage, totalPages, onPageChange, onZoom])

    useEffect(() => {
      let cancelled = false

      const loadDocument = async () => {
        setIsLoading(true)
        setError(null)

        try {
          const response = await fetch(fileUrl)
          if (!response.ok) {
            throw new Error(`Errore nel caricamento: ${response.statusText}`)
          }

          const arrayBuffer = await response.arrayBuffer()
          const result = await mammoth.convertToHtml(
            { arrayBuffer },
            {
              styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh"
              ]
            }
          )

          if (cancelled) return

          const html = result.value
          const pages = splitHtmlIntoPages(html)
          setTotalPages(pages.length)
          setHtmlContent(pages.join(''))
          setIsLoading(false)

          onDocumentLoad?.(pages.length)
        } catch (err) {
          if (cancelled) return
          console.error('[WordViewerCore] Errore nel caricamento:', err)
          setError(err instanceof Error ? err.message : 'Errore sconosciuto')
          setIsLoading(false)
        }
      }

      loadDocument()

      return () => {
        cancelled = true
      }
    }, [fileUrl, onDocumentLoad])

    useEffect(() => {
      if (page && page !== currentPage) {
        setCurrentPage(page)
        const pageElement = contentRef.current?.querySelector(`[data-page="${page}"]`)
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }, [page, currentPage])

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Caricamento documento Word...</p>
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <p className="text-red-600 mb-2">Errore nel caricamento</p>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      )
    }

    return (
      <div
        className="word-viewer-container h-full w-full overflow-auto bg-background"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          ['--scale-factor' as any]: '1'
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(var(--scale-factor, 1))`,
            transformOrigin: 'top left',
            isolation: 'isolate',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            contain: 'layout style paint'
          }}
        >
          <div
            className="word-viewer-content p-8 max-w-4xl mx-auto"
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
        <style>{`
          .word-viewer-content * {
            box-sizing: border-box;
          }
        `}</style>
      </div>
    )
  }
)

WordViewerCoreInner.displayName = 'WordViewerCore'

export const WordViewerCore = React.memo(WordViewerCoreInner, (prevProps, nextProps) => {
  return (
    prevProps.fileUrl === nextProps.fileUrl &&
    prevProps.page === nextProps.page &&
    prevProps.docId === nextProps.docId &&
    prevProps.hostRef === nextProps.hostRef &&
    prevProps.onDocumentLoad === nextProps.onDocumentLoad
  )
})

function splitHtmlIntoPages(html: string): string[] {
  return [`<div data-page="1" class="word-page border border-gray-900 dark:border-white bg-background shadow-sm">${html}</div>`]
}
