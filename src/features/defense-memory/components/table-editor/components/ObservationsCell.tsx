import React, { useState, useRef, useEffect } from 'react'
import { ObservationsCellProps } from '../../types/table.types'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, FileText, ExternalLink } from 'lucide-react'
import { extractClipboardManager } from '@/utils/extractClipboard'

export const ObservationsCell: React.FC<ObservationsCellProps> = ({
    row,
    onUpdate,
    readOnly = false,
    errors = []
}) => {
    const isReatoContestato = row.cellType === 'reato-contestato'
    const hasExtract = row.extract && row.extract.content.trim().length > 0
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isDragOver, setIsDragOver] = useState(false)
    const [hasExtractInClipboard, setHasExtractInClipboard] = useState(false)
    const [isHoveringMotivazione, setIsHoveringMotivazione] = useState(false)
    const [hoveredIcon, setHoveredIcon] = useState<'eye' | 'x' | null>(null)

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

    // Subscribe alla clipboard per rilevare cambiamenti
    useEffect(() => {
        const unsubscribe = extractClipboardManager.subscribe((extract) => {
            setHasExtractInClipboard(extract !== null)
        })

        // Verifica stato iniziale
        setHasExtractInClipboard(extractClipboardManager.hasExtract())

        return unsubscribe
    }, [])

    // Auto-expand textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        }
    }, [row.observations])

    const handleObservationsChange = (value: string) => {
        onUpdate({ observations: value })
    }

    const handleExtractVisibilityToggle = () => {
        if (!row.extract) return

        onUpdate({
            extract: {
                ...row.extract,
                isHidden: !row.extract.isHidden
            }
        })
    }

    const handleExtractRemove = () => {
        onUpdate({ extract: undefined })
    }

    const handleAddExtract = () => {
        // TODO: Implementare la logica per aggiungere un estratto
        // Per ora creiamo un estratto vuoto come placeholder
        onUpdate({
            extract: {
                content: '',
                source: '',
                page: 0,
                isHidden: false
            }
        })
    }

    // Handler per incollare estratto dalla clipboard
    const handlePasteExtract = () => {
        if (readOnly) return

        const extractData = extractClipboardManager.paste()
        if (!extractData) return

        onUpdate({
            extract: {
                content: extractData.content || '',
                source: extractData.source || 'Documento',
                page: extractData.page || 0,
                isHidden: false
            }
        })

        // Svuota la clipboard dopo l'incollaggio
        extractClipboardManager.clear()
    }

    // Drag and drop handlers (mantenuti per compatibilità)
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!readOnly) {
            setIsDragOver(true)
            e.dataTransfer.dropEffect = 'move'
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        if (readOnly) return

        try {
            const data = e.dataTransfer.getData('application/json')
            if (!data) return

            const extractData = JSON.parse(data)
            if (extractData.type === 'extract') {
                // Aggiorna l'estratto con i dati trascinati
                onUpdate({
                    extract: {
                        content: extractData.content || '',
                        source: extractData.source || 'Documento',
                        page: extractData.page || 0,
                        isHidden: false
                    }
                })
            }
        } catch (error) {
            console.error('[ObservationsCell] Error parsing drop data:', error)
        }
    }

    return (
        <div
            className={cn("p-2 space-y-1", isDragOver && "bg-blue-50 border-2 border-blue-300 border-dashed rounded")}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Motivazione (solo per reato contestato) */}
            {isReatoContestato && (
                <div
                    className="space-y-1"
                    onMouseEnter={() => setIsHoveringMotivazione(true)}
                    onMouseLeave={() => setIsHoveringMotivazione(false)}
                    style={{ cursor: hasExtractInClipboard && !hasExtract ? 'pointer' : 'default' }}
                >
                    <div className="flex items-center space-x-1">
                        <FileText className="h-3 w-3 text-blue-600" />
                        <span className="text-xs font-medium text-gray-900">Motivazione:</span>

                        {/* ✅ Iconi occhio e X sulla stessa riga di Motivazione */}
                        {hasExtract && (
                            <>
                                {/* Occhio per nascondere/mostrare estratto */}
                                <button
                                    onClick={handleExtractVisibilityToggle}
                                    disabled={readOnly}
                                    className={cn(
                                        "ml-auto p-1.5 rounded transition-all flex items-center justify-center",
                                        "hover:bg-blue-50 hover:shadow-sm",
                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                        readOnly && "cursor-not-allowed"
                                    )}
                                    onMouseEnter={() => setHoveredIcon('eye')}
                                    onMouseLeave={() => setHoveredIcon(null)}
                                    title={row.extract?.isHidden ? "Mostra estratto" : "Nascondi estratto"}
                                >
                                    {row.extract?.isHidden ? (
                                        <EyeOff className={cn(
                                            "h-3.5 w-3.5 text-gray-500 transition-all",
                                            hoveredIcon === 'eye' && "text-blue-600 scale-110"
                                        )} />
                                    ) : (
                                        <Eye className={cn(
                                            "h-3.5 w-3.5 text-gray-500 transition-all",
                                            hoveredIcon === 'eye' && "text-blue-600 scale-110"
                                        )} />
                                    )}
                                </button>

                                {/* X per rimuovere estratto */}
                                {!readOnly && (
                                    <button
                                        onClick={handleExtractRemove}
                                        className={cn(
                                            "p-1.5 rounded transition-all flex items-center justify-center",
                                            "hover:bg-red-50 hover:shadow-sm"
                                        )}
                                        onMouseEnter={() => setHoveredIcon('x')}
                                        onMouseLeave={() => setHoveredIcon(null)}
                                        title="Rimuovi estratto"
                                    >
                                        <span className={cn(
                                            "text-red-500 text-base font-bold transition-all",
                                            hoveredIcon === 'x' && "text-red-700 scale-110"
                                        )}>×</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {hasExtract ? (
                        <Card className="border-blue-200 p-1">
                            <CardContent className="pt-2 px-2 pb-2">
                                {!row.extract?.isHidden ? (
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">
                                            {row.extract.content || <span className="text-gray-400 italic">Estratto vuoto</span>}
                                        </p>
                                        {row.extract.source && (
                                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                                                <ExternalLink className="h-2 w-2" />
                                                <span>
                                                    {row.extract.source}
                                                    {row.extract.page > 0 && ` - Pagina ${row.extract.page}`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center space-x-1 text-xs text-gray-500 italic">
                                        <EyeOff className="h-3 w-3" />
                                        <span>Estratto nascosto</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div
                            className={cn(
                                "p-1 bg-gray-50 rounded-md border border-dashed border-gray-300 transition-colors",
                                isDragOver && "border-blue-400 bg-blue-50",
                                hasExtractInClipboard && isHoveringMotivazione && "border-blue-500 bg-blue-100"
                            )}
                            onClick={hasExtractInClipboard ? handlePasteExtract : undefined}
                        >
                            {!readOnly ? (
                                <div className="text-xs text-gray-500 text-center py-2">
                                    {hasExtractInClipboard && isHoveringMotivazione ? (
                                        <span className="text-blue-600 font-medium">Incolla estratto</span>
                                    ) : isDragOver ? (
                                        'Rilascia qui l\'estratto'
                                    ) : (
                                        'Aggiungi qui l\'estratto o trascina l\'estratto'
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 italic text-center">
                                    Nessun estratto disponibile
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Osservazioni - Editabile in-place */}
            <div className="space-y-1">
                <div className="flex items-center space-x-1">
                    <FileText className="h-3 w-3 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Osservazioni:</span>
                </div>

                <div>
                    <Textarea
                        ref={textareaRef}
                        value={row.observations || ''}
                        onChange={(e) => handleObservationsChange(e.target.value)}
                        placeholder="Inserisci le tue osservazioni..."
                        readOnly={readOnly}
                        className={cn(
                            "min-h-[60px] resize-none overflow-hidden text-xs p-2",
                            "whitespace-pre-wrap break-words"
                        )}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = 'auto'
                            target.style.height = `${target.scrollHeight}px`
                        }}
                    />
                    {getFieldError('observations') && (
                        <p className="text-xs text-red-500 mt-0.5">{getFieldError('observations')}</p>
                    )}
                </div>
            </div>
        </div>
    )
}
