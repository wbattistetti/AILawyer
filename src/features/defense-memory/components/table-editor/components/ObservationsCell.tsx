import React, { useState, useRef, useEffect } from 'react'
import { ObservationsCellProps, Motivation } from '../../types/table.types'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FileText } from 'lucide-react'
import { extractClipboardManager } from '@/utils/extractClipboard'
import { MotivationItem } from './MotivationItem'
import { MotivationObservation } from './MotivationObservation'

export const ObservationsCell: React.FC<ObservationsCellProps> = ({
    row,
    onUpdate,
    readOnly = false,
    errors = []
}) => {
    const isReatoContestato = row.cellType === 'reato-contestato'
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isDragOver, setIsDragOver] = useState(false)
    const [hasExtractInClipboard, setHasExtractInClipboard] = useState(false)
    const [isHoveringMotivazione, setIsHoveringMotivazione] = useState(false)

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

    // Helpers motivazioni (reato-contestato)
    const getMotivations = (): Motivation[] => {
        if (row.motivations && row.motivations.length > 0) return row.motivations
        if (row.extract && row.extract.content?.trim()) {
            return [{
                id: `mot_${Math.random().toString(36).slice(2)}`,
                text: row.extract.content,
                source: row.extract.source,
                page: row.extract.page,
                isHidden: !!row.extract.isHidden,
                observation: ''
            }]
        }
        return []
    }

    const motivations = getMotivations()

    const updateMotivations = (next: Motivation[]) => {
        onUpdate({ motivations: next })
    }

    const handleToggleVisibility = (id: string) => {
        const next = motivations.map(m => m.id === id ? { ...m, isHidden: !m.isHidden } : m)
        updateMotivations(next)
    }

    const handleRemoveMotivation = (id: string) => {
        const next = motivations.filter(m => m.id !== id)
        updateMotivations(next)
    }

    const handleMotivationObservationChange = (id: string, value: string) => {
        const next = motivations.map(m => m.id === id ? { ...m, observation: value } : m)
        updateMotivations(next)
    }

    // Handler per incollare motivazione dalla clipboard
    const handlePasteMotivation = () => {
        if (readOnly) return
        const extractData = extractClipboardManager.paste()
        if (!extractData) return
        const newMotivation: Motivation = {
            id: `mot_${Math.random().toString(36).slice(2)}`,
            text: extractData.content || '',
            source: extractData.source || 'Documento',
            page: extractData.page || 0,
            isHidden: false,
            observation: ''
        }
        updateMotivations([...motivations, newMotivation])
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
                const newMotivation: Motivation = {
                    id: `mot_${Math.random().toString(36).slice(2)}`,
                    text: extractData.content || '',
                    source: extractData.source || 'Documento',
                    page: extractData.page || 0,
                    isHidden: false,
                    observation: ''
                }
                updateMotivations([...motivations, newMotivation])
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
            {/* Motivazioni (solo per reato contestato) */}
            {isReatoContestato && (
                <div
                    className="space-y-2"
                    onMouseEnter={() => setIsHoveringMotivazione(true)}
                    onMouseLeave={() => setIsHoveringMotivazione(false)}
                    style={{ cursor: hasExtractInClipboard ? 'pointer' : 'default' }}
                >
                    {/* Lista motivazioni */}
                    {motivations.length > 0 ? (
                        <>
                            {motivations.map(m => (
                                <Card key={m.id} className="border-blue-200 p-1">
                                    <CardContent className="pt-2 px-2 pb-2 space-y-2">
                                        <MotivationItem
                                            id={m.id}
                                            text={m.text}
                                            source={m.source}
                                            page={m.page}
                                            isHidden={m.isHidden}
                                            onToggleVisibility={handleToggleVisibility}
                                            onRemove={handleRemoveMotivation}
                                            readOnly={readOnly}
                                        />
                                        <div className="ml-4">
                                            <MotivationObservation
                                                value={m.observation}
                                                onChange={(val) => handleMotivationObservationChange(m.id, val)}
                                                readOnly={readOnly}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}

                            {/* Zona aggiunta sempre visibile */}
                            <div
                                className={cn(
                                    'p-1 bg-gray-50 rounded-md border border-dashed border-gray-300 transition-colors',
                                    isDragOver && 'border-blue-400 bg-blue-50',
                                    hasExtractInClipboard && isHoveringMotivazione && 'border-blue-500 bg-blue-100'
                                )}
                                onClick={hasExtractInClipboard ? handlePasteMotivation : undefined}
                            >
                                {!readOnly ? (
                                    <div className="text-xs text-gray-500 text-center py-2">
                                        {hasExtractInClipboard && isHoveringMotivazione ? (
                                            <span className="text-blue-600 font-medium">Incolla motivazione</span>
                                        ) : isDragOver ? (
                                            'Rilascia qui l\'estratto'
                                        ) : (
                                            'Aggiungi nuova motivazione (incolla o trascina estratto)'
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 italic text-center">
                                        Trascina qui per aggiungere una motivazione
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div
                            className={cn(
                                'p-1 bg-gray-50 rounded-md border border-dashed border-gray-300 transition-colors',
                                isDragOver && 'border-blue-400 bg-blue-50',
                                hasExtractInClipboard && isHoveringMotivazione && 'border-blue-500 bg-blue-100'
                            )}
                            onClick={hasExtractInClipboard ? handlePasteMotivation : undefined}
                        >
                            {!readOnly ? (
                                <div className="text-xs text-gray-500 text-center py-2">
                                    {hasExtractInClipboard && isHoveringMotivazione ? (
                                        <span className="text-blue-600 font-medium">Incolla motivazione</span>
                                    ) : isDragOver ? (
                                        'Rilascia qui l\'estratto'
                                    ) : (
                                        'Aggiungi qui una motivazione (incolla o trascina estratto)'
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 italic text-center">
                                    Nessuna motivazione disponibile
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Osservazioni */}
            <div className="space-y-1">
                <div className="flex items-center space-x-1">
                    <FileText className="h-3 w-3 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">{isReatoContestato ? 'Osservazione generale' : 'Osservazioni'}:</span>
                </div>

                <div>
                    {isReatoContestato ? (
                        <Textarea
                            value={(motivations.map(m => m.observation?.trim()).filter(Boolean) as string[]).join('\n\n')}
                            readOnly
                            className={cn(
                                'min-h-[60px] resize-none overflow-hidden text-xs p-2 whitespace-pre-wrap break-words bg-gray-50'
                            )}
                        />
                    ) : (
                        <Textarea
                            ref={textareaRef}
                            value={row.observations || ''}
                            onChange={(e) => handleObservationsChange(e.target.value)}
                            placeholder="Inserisci le tue osservazioni..."
                            readOnly={readOnly}
                            className={cn(
                                'min-h-[60px] resize-none overflow-hidden text-xs p-2 whitespace-pre-wrap break-words'
                            )}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement
                                target.style.height = 'auto'
                                target.style.height = `${target.scrollHeight}px`
                            }}
                        />
                    )}
                    {getFieldError('observations') && (
                        <p className="text-xs text-red-500 mt-0.5">{getFieldError('observations')}</p>
                    )}
                </div>
            </div>
        </div>
    )
}
