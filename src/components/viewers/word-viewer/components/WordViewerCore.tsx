/**
 * ✅ Word Viewer Core - Renderizza documenti Word (.docx) come HTML
 * Usa mammoth.js per convertire .docx in HTML
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
    const [totalPages, setTotalPages] = useState(1) // Word non ha pagine reali, ma possiamo dividerlo
    const [currentPage, setCurrentPage] = useState(page || 1)
    const scaleRef = useRef<number>(1)

    // ✅ Espone metodi tramite ref
    React.useImperativeHandle(ref, () => ({
      zoomTo: (scale: number) => {
        scaleRef.current = scale
        if (contentRef.current) {
          contentRef.current.style.transform = `scale(${scale})`
          contentRef.current.style.transformOrigin = 'top left'
        }
        onZoom?.(scale)
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

    // ✅ Carica e converte documento Word
    useEffect(() => {
      let cancelled = false

      const loadDocument = async () => {
        setIsLoading(true)
        setError(null)

        try {
          // ✅ Fetch del file Word
          const response = await fetch(fileUrl)
          if (!response.ok) {
            throw new Error(`Errore nel caricamento: ${response.statusText}`)
          }

          const arrayBuffer = await response.arrayBuffer()

          // ✅ Converti .docx in HTML usando mammoth
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

          // ✅ Dividi HTML in "pagine" virtuali (per coerenza con PDF viewer)
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

    // ✅ Gestisce cambio pagina esterno
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
        ref={hostRef}
        className="word-viewer-container h-full w-full overflow-auto bg-white"
        // ✅ Disabilita selezione testo - solo drag rettangolo (OCR-style)
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        <div
          ref={contentRef}
          className="word-viewer-content p-8 max-w-4xl mx-auto"
          style={{
            transform: `scale(${scaleRef.current})`,
            transformOrigin: 'top left',
            transition: 'transform 0.2s ease-out',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    )
  }
)

WordViewerCoreInner.displayName = 'WordViewerCore'

export const WordViewerCore = WordViewerCoreInner

/**
 * ✅ Divide HTML in "pagine" virtuali per coerenza con PDF viewer
 * Ogni pagina è un div con data-page attribute
 * Usa una logica semplificata basata su tag HTML
 */
function splitHtmlIntoPages(html: string): string[] {
  // ✅ Per ora, wrappa tutto in una singola "pagina"
  // In futuro si può implementare una logica più sofisticata
  // usando un div temporaneo e calcolando l'altezza effettiva

  // ✅ Wrappa l'HTML in un div con data-page
  return [`<div data-page="1" class="word-page">${html}</div>`]
}
