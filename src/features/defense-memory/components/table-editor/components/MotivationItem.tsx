import React from 'react'
import { Eye, EyeOff, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MotivationItemProps {
    id: string
    text: string
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
                        className="overflow-auto resize-y min-h-[80px] max-h-[600px] pr-1"
                    >
                        <p className="text-xs whitespace-pre-wrap break-words">
                            {text || <span className="text-gray-400 italic">Estratto vuoto</span>}
                        </p>
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


