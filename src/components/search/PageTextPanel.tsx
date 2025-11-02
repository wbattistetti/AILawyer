import React, { useState, useEffect, useRef } from 'react'
import { X, Maximize2, Minimize2, Move } from 'lucide-react'
import { api } from '@/lib/api'

interface PageTextPanelProps {
  docId: string
  pageNumber: number
  docTitle?: string
  onClose: () => void
}

export const PageTextPanel: React.FC<PageTextPanelProps> = ({
  docId,
  pageNumber,
  docTitle,
  onClose
}) => {
  const [text, setText] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState<boolean>(false)
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 600, height: 500 })
  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [zIndex, setZIndex] = useState<number>(9999)

  // Porta il pannello in primo piano quando viene cliccato
  const handlePanelClick = (e: React.MouseEvent) => {
    // Incrementa z-index per portarlo in primo piano
    setZIndex(prev => prev + 1)
  }

  useEffect(() => {
    const loadPageText = async () => {
      if (!docId || !pageNumber) return

      setLoading(true)
      setError(null)

      try {
        // ✅ Usa la funzione helper centralizzata per estrazione robusta
        const { extractPageText } = await import('@/utils/extractPageText')
        const pageText = await extractPageText(docId, pageNumber)

        if (!pageText) {
          setError('Nessun testo OCR disponibile per questa pagina')
          setLoading(false)
          return
        }

        setText(pageText)
      } catch (err) {
        console.error('[PageTextPanel] Error loading page text:', err)
        setError(err instanceof Error ? err.message : 'Errore nel caricamento del testo')
      } finally {
        setLoading(false)
      }
    }

    loadPageText()
  }, [docId, pageNumber])

  // Drag handling
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setPosition(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - size.width, prev.x + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, prev.y + dy))
      }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, size])

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, .resize-handle')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMaximize = () => {
    if (isMaximized) {
      setIsMaximized(false)
      setSize({ width: 600, height: 500 })
      setPosition({ x: 100, y: 100 })
    } else {
      setIsMaximized(true)
      setPosition({ x: 0, y: 0 })
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
  }

  // Resize handling
  const handleResize = (e: React.MouseEvent, corner: 'se' | 'sw' | 'ne' | 'nw') => {
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height
    const startPosX = position.x
    const startPosY = position.y

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight
      let newX = startPosX
      let newY = startPosY

      if (corner === 'se') {
        newWidth = Math.max(400, startWidth + dx)
        newHeight = Math.max(300, startHeight + dy)
      } else if (corner === 'sw') {
        newWidth = Math.max(400, startWidth - dx)
        newHeight = Math.max(300, startHeight + dy)
        newX = Math.max(0, startPosX + dx)
      } else if (corner === 'ne') {
        newWidth = Math.max(400, startWidth + dx)
        newHeight = Math.max(300, startHeight - dy)
        newY = Math.max(0, startPosY + dy)
      } else if (corner === 'nw') {
        newWidth = Math.max(400, startWidth - dx)
        newHeight = Math.max(300, startHeight - dy)
        newX = Math.max(0, startPosX + dx)
        newY = Math.max(0, startPosY + dy)
      }

      setSize({ width: newWidth, height: newHeight })
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      ref={panelRef}
      className="fixed bg-white border-2 border-gray-300 shadow-2xl rounded-lg flex flex-col"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: zIndex
      }}
      onClick={handlePanelClick}
    >
      {/* Header */}
      <div
        ref={headerRef}
        onMouseDown={handleHeaderMouseDown}
        className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-300 rounded-t-lg cursor-move select-none"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Move size={16} className="text-gray-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700 truncate">
            {docTitle || 'Documento'} - Pagina {pageNumber}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleMaximize}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title={isMaximized ? 'Riduci' : 'Ingrandisci'}
          >
            {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
            title="Chiudi"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-white">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Caricamento testo pagina...</div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="text-red-600 font-semibold">{error}</div>
            <div className="text-xs text-gray-500">Richiesta pagina: {pageNumber}</div>
          </div>
        )}

        {!loading && !error && text && (
          <div className="flex flex-col h-full">
            <div className="text-xs text-gray-500 mb-2 pb-2 border-b">
              Testo estratto dalla pagina {pageNumber} (lunghezza: {text.length} caratteri)
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed flex-1">
              {text}
            </pre>
          </div>
        )}

        {!loading && !error && !text && (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Nessun testo disponibile</div>
          </div>
        )}
      </div>

      {/* Resize handles */}
      {!isMaximized && (
        <>
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-gray-300 hover:bg-gray-400"
            onMouseDown={(e) => handleResize(e, 'se')}
            style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}
          />
          <div
            className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize bg-gray-300 hover:bg-gray-400"
            onMouseDown={(e) => handleResize(e, 'sw')}
            style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }}
          />
          <div
            className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize bg-gray-300 hover:bg-gray-400"
            onMouseDown={(e) => handleResize(e, 'ne')}
            style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
          />
          <div
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize bg-gray-300 hover:bg-gray-400"
            onMouseDown={(e) => handleResize(e, 'nw')}
            style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
          />
        </>
      )}
    </div>
  )
}

