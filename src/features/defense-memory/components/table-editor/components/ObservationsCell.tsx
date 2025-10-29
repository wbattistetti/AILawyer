import React, { useState, useRef, useEffect } from 'react'
import { ObservationsCellProps } from '../../types/table.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, FileText, ExternalLink, Plus } from 'lucide-react'

export const ObservationsCell: React.FC<ObservationsCellProps> = ({
    row,
    onUpdate,
    readOnly = false,
    errors = []
}) => {
    const isReatoContestato = row.cellType === 'reato-contestato'
    const hasExtract = row.extract && row.extract.content.trim().length > 0
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

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

    return (
        <div className="p-2 space-y-1">
            {/* Motivazione (solo per reato contestato) */}
            {isReatoContestato && (
                <div className="space-y-1">
                    <div className="flex items-center space-x-1">
                        <FileText className="h-3 w-3 text-blue-600" />
                        <span className="text-xs font-medium text-gray-900">Motivazione:</span>
                    </div>

                    {hasExtract ? (
                        <Card className="border-blue-200 p-1">
                            <CardHeader className="pb-1 px-2 pt-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-xs text-blue-700">Estratto</CardTitle>
                                    <div className="flex items-center space-x-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleExtractVisibilityToggle}
                                            className="h-5 px-1"
                                            disabled={readOnly}
                                        >
                                            {row.extract?.isHidden ? (
                                                <EyeOff className="h-3 w-3" />
                                            ) : (
                                                <Eye className="h-3 w-3" />
                                            )}
                                        </Button>
                                        {!readOnly && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleExtractRemove}
                                                className="h-5 px-1 text-red-500 hover:text-red-700"
                                            >
                                                ×
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0 px-2 pb-2">
                                {!row.extract?.isHidden ? (
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-700 whitespace-pre-wrap">
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
                        <div className="p-1 bg-gray-50 rounded-md border border-dashed border-gray-300">
                            {!readOnly ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddExtract}
                                    className="w-full h-7 text-xs"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Aggiungi estratto
                                </Button>
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
