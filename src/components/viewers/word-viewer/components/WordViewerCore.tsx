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
    // ✅ Stessa logica del PDF viewer: usa SOLO ref, NO state (aggiorna via setProperty)
    const scaleRef = useRef<number>(1)
    const renderCountRef = useRef(0)

    // ✅ Espone metodi tramite ref
    React.useImperativeHandle(ref, () => ({
      zoomTo: (newScale: number) => {
        const prevScale = scaleRef.current
        scaleRef.current = newScale

        console.log('🟢 [WORD-ZOOM][zoomTo-Core] ===== ZOOM CORE CHIAMATO =====', {
          timestamp: Date.now(),
          prevScale: prevScale.toFixed(3),
          newScale: newScale.toFixed(3),
          delta: Math.abs(newScale - prevScale).toFixed(3),
          hasHostRef: !!hostRef?.current,
          hasContentRef: !!contentRef.current,
          caller: new Error().stack?.split('\n')[2]
        })

        // ✅ Stessa logica del PDF viewer: aggiorna SOLO via setProperty (NO state, NO re-render)
        // ✅ IMPORTANTE: NON aggiornare hostRef (contiene anche altri elementi come DraftOverlay)
        // ✅ Aggiorna SOLO il contentRef (wrapper interno con transform: scale())
        if (contentRef.current) {
          const beforeContentRect = contentRef.current.getBoundingClientRect()

          console.log('[WORD-ZOOM][zoomTo] Prima di aggiornare CSS variable (content wrapper)', {
            contentRect: {
              width: beforeContentRect.width.toFixed(2),
              height: beforeContentRect.height.toFixed(2),
              top: beforeContentRect.top.toFixed(2),
              left: beforeContentRect.left.toFixed(2)
            },
            currentScaleFactor: contentRef.current.style.getPropertyValue('--scale-factor')
          })

          // ✅ Aggiorna SOLO sul wrapper interno (contentRef) - NON sul hostRef
          // ✅ Questo isola lo zoom solo al contenuto del Word viewer
          contentRef.current.style.setProperty('--scale-factor', String(newScale))

          requestAnimationFrame(() => {
            const afterContentRect = contentRef.current?.getBoundingClientRect()
            if (afterContentRect) {
              console.log('[WORD-ZOOM][zoomTo] Dopo aggiornamento CSS variable (content)', {
                contentRect: {
                  width: afterContentRect.width.toFixed(2),
                  height: afterContentRect.height.toFixed(2),
                  top: afterContentRect.top.toFixed(2),
                  left: afterContentRect.left.toFixed(2)
                },
                widthChanged: Math.abs(afterContentRect.width - beforeContentRect.width) > 0.1,
                heightChanged: Math.abs(afterContentRect.height - beforeContentRect.height) > 0.1,
                newScaleFactor: contentRef.current?.style.getPropertyValue('--scale-factor')
              })
            }
          })
        } else {
          console.warn('[WORD-ZOOM][zoomTo] contentRef.current non disponibile')
        }

        console.log('[WORD-ZOOM][zoomTo] Chiamata onZoom callback', {
          scale: newScale.toFixed(3),
          hasCallback: !!onZoom
        })

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

    // ✅ Observer per tracciare cambiamenti di layout che potrebbero causare flickering
    useEffect(() => {
      if (!hostRef?.current || !contentRef.current) return

      const host = hostRef.current
      const content = contentRef.current

      const resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const { width, height } = entry.contentRect
          console.log('[WORD-ZOOM][RESIZE] Layout cambiato', {
            timestamp: Date.now(),
            target: entry.target === host ? 'host' : entry.target === content ? 'content' : 'unknown',
            width: width.toFixed(2),
            height: height.toFixed(2),
              scaleFactor: (entry.target as HTMLElement).style.getPropertyValue('--scale-factor'),
              currentScale: scaleRef.current.toFixed(3)
          })
        })
      })

      resizeObserver.observe(host)
      resizeObserver.observe(content)

      return () => {
        resizeObserver.disconnect()
      }
    }, []) // ✅ Stessa logica del PDF viewer: ResizeObserver non dipende da scale (aggiornato via setProperty)

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

    // ✅ Log quando il componente viene renderizzato
    renderCountRef.current++

    // ✅ Log solo ogni 10 render per ridurre spam durante zoom continuo (Ctrl+rotella)
    if (renderCountRef.current > 1 && renderCountRef.current % 10 === 0) {
      console.log('[WORD-ZOOM][RENDER] Componente renderizzato', {
        timestamp: Date.now(),
        renderCount: renderCountRef.current,
        currentScale: scaleRef.current.toFixed(3),
        hasHostRef: !!hostRef?.current,
        hasContentRef: !!contentRef.current,
        htmlContentLength: htmlContent.length
      })

      if (contentRef.current) {
        const contentRect = contentRef.current.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(contentRef.current)
        console.log('[WORD-ZOOM][RENDER] Content wrapper rect e stili', {
          width: contentRect.width.toFixed(2),
          height: contentRect.height.toFixed(2),
          scaleFactor: contentRef.current.style.getPropertyValue('--scale-factor'),
          transform: computedStyle.transform
        })
      }
    }

    return (
      <div
        className="word-viewer-container h-full w-full overflow-auto bg-background"
        // ✅ Disabilita selezione testo - solo drag rettangolo (OCR-style)
        // ✅ hostRef è del WordViewerShell, non del WordViewerCore (come nel PDF viewer)
        // ✅ IMPORTANTE: Reset esplicito della CSS variable per evitare ereditarietà
        // ✅ La variabile viene applicata SOLO sul wrapper interno (contentRef)
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          // ✅ Reset esplicito per evitare che la CSS variable venga ereditata da elementi fuori
          ['--scale-factor' as any]: '1'
        }}
      >
        {/* ✅ Wrapper scalabile: usa transform: scale() per evitare re-layout del container */}
        {/* ✅ IMPORTANTE: Isolato con isolation per evitare che lo scale influenzi altri elementi */}
        <div
          ref={contentRef}
          style={{
            // ✅ transform: scale() non causa re-layout del container parent
            // ✅ Il contenuto viene scalato visivamente, ma lo spazio occupato rimane lo stesso
            // ✅ Lo scroll gestisce il contenuto più grande (come PDF viewer)
            transform: `scale(var(--scale-factor, 1))`,
            transformOrigin: 'top left',
            // ✅ Isolamento completo per evitare che lo scale influenzi overlay o altri elementi
            isolation: 'isolate',
            // ✅ Ottimizzazioni per performance (come PDF viewer)
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            contain: 'layout style paint'
          }}
        >
          <div
            className="word-viewer-content p-8 max-w-4xl mx-auto"
            style={{
              // ✅ Dimensioni base (non scalate) - lo scaling viene fatto dal wrapper
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
        {/* ✅ Stile globale */}
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

// ✅ Avvolgi con React.memo per prevenire re-render inutili durante lo zoom continuo
// ✅ Re-render solo se cambiano props rilevanti (non onZoom che cambia ad ogni zoom)
export const WordViewerCore = React.memo(WordViewerCoreInner, (prevProps, nextProps) => {
  return (
    prevProps.fileUrl === nextProps.fileUrl &&
    prevProps.page === nextProps.page &&
    prevProps.docId === nextProps.docId &&
    prevProps.hostRef === nextProps.hostRef &&
    prevProps.onDocumentLoad === nextProps.onDocumentLoad
    // ✅ onZoom e onPageChange possono cambiare senza causare re-render
  )
})

/**
 * ✅ Divide HTML in "pagine" virtuali per coerenza con PDF viewer
 * Ogni pagina è un div con data-page attribute
 * Usa una logica semplificata basata su tag HTML
 */
function splitHtmlIntoPages(html: string): string[] {
  // ✅ Per ora, wrappa tutto in una singola "pagina"
  // In futuro si può implementare una logica più sofisticata
  // usando un div temporaneo e calcolando l'altezza effettiva

  // ✅ Wrappa l'HTML in un div con data-page e bordo che si adatta al tema
  // Bordo nero su tema chiaro, bianco su tema scuro
  // Sfondo bianco sempre per il contenuto del documento
  return [`<div data-page="1" class="word-page border border-gray-900 dark:border-white bg-background shadow-sm">${html}</div>`]
}
