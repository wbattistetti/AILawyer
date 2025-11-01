import React, { useState, useRef, useEffect, useCallback } from 'react'
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
    errors = [],
    onMoveMotivation
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
    const rootRef = useRef<HTMLDivElement>(null)
    const [isMouseInside, setIsMouseInside] = useState(false)
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

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
            imageDataUrl: extractData.imageDataUrl,
            source: extractData.source || 'Documento',
            page: extractData.page || 0,
            isHidden: false,
            observation: ''
        }
        updateMotivations([...motivations, newMotivation])
        extractClipboardManager.clear()
    }

    // Inserimento preciso tramite slot
    const insertMotivationAt = useCallback((index: number, m: Motivation) => {
        const next = [...motivations]
        const at = Math.max(0, Math.min(index, next.length))
        next.splice(at, 0, m)
        updateMotivations(next)
    }, [motivations])

    const handleDropAtIndex = useCallback((index: number, e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
        if (readOnly) return
        try {
            const raw = e.dataTransfer.getData('application/json')
            if (!raw) return
            const data = JSON.parse(raw)
            if (data.type === 'extract') {
                const newMotivation: Motivation = {
                    id: `mot_${Math.random().toString(36).slice(2)}`,
                    text: data.content || '',
                    imageDataUrl: data.imageDataUrl,
                    source: data.source || 'Documento',
                    page: data.page || 0,
                    isHidden: false,
                    observation: ''
                }
                insertMotivationAt(index, newMotivation)
            } else if (data.type === 'motivation') {
                if (data.fromRowId === row.id) {
                    const next = [...motivations]
                    const fromIdx = next.findIndex(m => m.id === data.motivationId)
                    if (fromIdx === -1) return
                    const [moved] = next.splice(fromIdx, 1)
                    const at = Math.max(0, Math.min(index, next.length))
                    next.splice(at, 0, moved)
                    updateMotivations(next)
                } else if (onMoveMotivation) {
                    onMoveMotivation(data.fromRowId, row.id, data.motivationId, index)
                }
            }
        } catch (err) {
            console.error('[ObservationsCell] Drop error:', err)
        }
    }, [insertMotivationAt, motivations, onMoveMotivation, readOnly, row.id])

    const InsertSlot: React.FC<{ index: number }> = ({ index }) => {
        const [hover, setHover] = useState(false)
        return (
            <div
                className={cn(
                    'relative select-none rounded',
                    (hover || isDragOver) ? 'bg-blue-50' : (hasExtractInClipboard && isMouseInside ? 'bg-blue-50/60' : 'bg-transparent')
                )}
                style={{ height: 8, marginTop: 8, marginBottom: 8 }}
            >
                {/* Hit area che copre intercapedine al 100% */}
                <div
                    className="absolute inset-0 cursor-pointer z-10"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setHover(true); setIsDragOver(true) }}
                    onDragLeave={() => { setHover(false); setIsDragOver(false) }}
                    onDrop={(e) => { setHover(false); handleDropAtIndex(index, e) }}
                    onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (!hasExtractInClipboard || readOnly) return
                        const extractData = extractClipboardManager.paste()
                        if (!extractData) return
                        const newMotivation: Motivation = {
                            id: `mot_${Math.random().toString(36).slice(2)}`,
                            text: extractData.content || '',
                            imageDataUrl: extractData.imageDataUrl,
                            source: extractData.source || 'Documento',
                            page: extractData.page || 0,
                            isHidden: false,
                            observation: ''
                        }
                        insertMotivationAt(index, newMotivation)
                        extractClipboardManager.clear()
                    }}
                />
                {/* Linea blu centrale come feedback, senza cambiare l'altezza della fascia */}
                <div className={cn('absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded transition-colors', (hover || isDragOver) ? 'bg-blue-600' : (hasExtractInClipboard && isMouseInside ? 'bg-blue-400/60' : 'bg-transparent'))} />
            </div>
        )
    }

    return (
        <div
            ref={rootRef}
            className={cn("p-2 space-y-1")}
            onMouseEnter={() => setIsMouseInside(true)}
            onMouseLeave={() => setIsMouseInside(false)}
            onMouseMove={(e) => {
                const rect = rootRef.current?.getBoundingClientRect()
                if (!rect) return
                setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
            }}
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
                            <InsertSlot index={0} />
                            {motivations.map((m, i) => (
                                <div key={m.id}>
                                    <Card className="border-blue-200 p-1">
                                        <CardContent className={cn('pt-2 px-2 space-y-2', m.isHidden ? 'pb-1 space-y-1' : 'pb-2')}>
                                            <MotivationItem
                                                id={m.id}
                                                text={m.text}
                                                imageDataUrl={m.imageDataUrl}
                                                source={m.source}
                                                page={m.page}
                                                isHidden={m.isHidden}
                                                onToggleVisibility={handleToggleVisibility}
                                                onRemove={handleRemoveMotivation}
                                                readOnly={readOnly}
                                                maxBodyHeight={160}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('application/json', JSON.stringify({
                                                        type: 'motivation',
                                                        fromRowId: row.id,
                                                        motivationId: m.id,
                                                        fromIndex: i
                                                    }))
                                                    e.dataTransfer.effectAllowed = 'move'
                                                }}
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
                                    <InsertSlot index={i + 1} />
                                </div>
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
                {(hasExtractInClipboard && isMouseInside) && (
                    <div
                        className="pointer-events-none absolute z-10 text-[11px] px-2 py-1 rounded bg-blue-600 text-white shadow"
                        style={{ left: Math.max(0, cursorPos.x + 12), top: Math.max(0, cursorPos.y + 12) }}
                    >
                        Incolla estratto in una delle aree evidenziate
                    </div>
                )}
            </div>
        </div>
    )
}
