import React, { useState, useRef, useEffect } from 'react'
import { Eye, EyeOff, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MotivationItemProps {
    id: string
    text: string
    imageDataUrl?: string  // Per snippet immagine OCR
    source?: string
    page?: number
    isHidden: boolean
    onToggleVisibility?: (id: string) => void
    onRemove?: (id: string) => void
    readOnly?: boolean
    className?: string
    maxBodyHeight?: number // px, altezza massima del testo con scroll
    draggable?: boolean
    onDragStart?: (e: React.DragEvent) => void
}

export const MotivationItem: React.FC<MotivationItemProps> = ({
    id,
    text,
    imageDataUrl,
    source,
    page,
    isHidden,
    onToggleVisibility,
    onRemove,
    readOnly = false,
    className = '',
    maxBodyHeight = 160,
    draggable = false,
    onDragStart
}) => {
    // ✅ Stato per zoom dell'immagine
    const [imageZoom, setImageZoom] = useState(1.0)
    const imageContainerRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement>(null)
    const zoomRef = useRef(1.0) // Ref per evitare dependency loop

    // Sincronizza ref con state
    useEffect(() => {
        zoomRef.current = imageZoom
    }, [imageZoom])

    // ✅ Reset zoom quando cambia l'immagine
    useEffect(() => {
        if (imageDataUrl) {
            setImageZoom(1.0)
            zoomRef.current = 1.0
        }
    }, [imageDataUrl])

    // ✅ Gestione zoom con Ctrl + rotella usando addEventListener (come negli altri componenti)
    useEffect(() => {
        if (!imageDataUrl) return

        let cleanup: (() => void) | null = null

        // Usa setTimeout per assicurarsi che il DOM sia renderizzato
        const timeoutId = setTimeout(() => {
            const container = imageContainerRef.current
            if (!container) return

            const handleWheel = (e: WheelEvent) => {
                // Controlla se Ctrl è premuto
                if (!e.ctrlKey && !e.metaKey) return

                // Verifica che il mouse sia sopra il container (usando target invece di clientX/Y)
                const target = e.target as HTMLElement
                if (!container.contains(target) && target !== container) return

                // BLOCCA TUTTO per evitare conflitti con altri gestori
                e.preventDefault()
                e.stopPropagation()
                e.stopImmediatePropagation()

                // Calcola nuovo livello di zoom (0.5x - 3x)
                const zoomStep = 0.1
                const currentZoom = zoomRef.current
                const delta = e.deltaY > 0 ? -zoomStep : zoomStep
                const newZoom = Math.max(0.5, Math.min(3.0, currentZoom + delta))

                if (Math.abs(newZoom - currentZoom) > 0.001) {
                    console.log('[MOTIVATION_ZOOM]', { from: currentZoom.toFixed(2), to: newZoom.toFixed(2), ctrl: e.ctrlKey, meta: e.metaKey })
                    setImageZoom(newZoom)
                }
            }

            // CAPTURE PHASE per intercettare PRIMA di altri gestori
            container.addEventListener('wheel', handleWheel, { passive: false, capture: true })

            // Salva cleanup function
            cleanup = () => {
                container.removeEventListener('wheel', handleWheel, true)
            }
        }, 0)

        return () => {
            clearTimeout(timeoutId)
            if (cleanup) {
                cleanup()
            }
        }
    }, [imageDataUrl])

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex items-center space-x-1">
                <FileText className="h-3 w-3 text-blue-600" />
                <span
                    className={cn('text-xs font-medium', isHidden ? 'text-gray-400' : 'text-gray-900')}
                    draggable={draggable}
                    onDragStart={onDragStart}
                >
                    Motivazione:
                </span>
                {/* Ghost hint quando c'è contenuto in clipboard (gestito dal parent via CSS opzionale) */}
                <div className="ml-auto flex items-center space-x-1">
                    <button
                        onClick={() => onToggleVisibility?.(id)}
                        disabled={readOnly}
                        className={cn(
                            'p-1.5 rounded transition-all flex items-center justify-center',
                            'hover:bg-blue-50 hover:shadow-sm',
                            readOnly && 'cursor-not-allowed opacity-60'
                        )}
                        title={isHidden ? 'Mostra' : 'Nascondi'}
                    >
                        {isHidden ? <EyeOff className="h-3.5 w-3.5 text-gray-500" /> : <Eye className="h-3.5 w-3.5 text-gray-500" />}
                    </button>
                    {!readOnly && (
                        <button
                            onClick={() => onRemove?.(id)}
                            className="p-1.5 rounded transition-all flex items-center justify-center hover:bg-red-50"
                            title="Rimuovi"
                        >
                            <span className="text-red-500 text-base font-bold">×</span>
                        </button>
                    )}
                </div>
            </div>

            {!isHidden && (
                <div className="space-y-1">
                    <div
                        ref={imageContainerRef}
                        className="overflow-auto resize-y min-h-[80px] max-h-[600px] pr-1"
                    >
                        {/* Mostra immagine se presente, altrimenti testo */}
                        {imageDataUrl ? (
                            <div
                                className="space-y-2"
                                style={{
                                    cursor: imageZoom !== 1.0 ? 'zoom-in' : 'default'
                                }}
                            >
                                <img
                                    ref={imgRef}
                                    src={imageDataUrl}
                                    alt="Estratto documento"
                                    className="rounded border border-gray-200 shadow-sm transition-transform origin-top-left"
                                    style={{
                                        transform: `scale(${imageZoom})`,
                                        transformOrigin: 'top left',
                                        maxWidth: imageZoom > 1 ? 'none' : '100%',
                                        height: imageZoom > 1 ? 'auto' : 'auto'
                                    }}
                                />
                                {/* ✅ Indicatore zoom visibile quando zoom != 1.0 */}
                                {imageZoom !== 1.0 && (
                                    <div className="fixed top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-md shadow-lg text-sm z-50">
                                        Zoom: {Math.round(imageZoom * 100)}%
                                    </div>
                                )}
                                {text && (
                                    <p className="text-xs whitespace-pre-wrap break-words text-gray-600">
                                        {text}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs whitespace-pre-wrap break-words">
                                {text || <span className="text-gray-400 italic">Estratto vuoto</span>}
                            </p>
                        )}
                    </div>
                    {(source || typeof page === 'number') && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <ExternalLink className="h-2 w-2" />
                            <span>
                                {source || 'Documento'}
                                {(typeof page === 'number' && page > 0) && ` - Pagina ${page}`}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


