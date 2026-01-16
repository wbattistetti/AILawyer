import React, { useState, useMemo } from 'react'
import { CaseDetail } from '../types/table.types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CaseDetailsTableProps {
    details: CaseDetail[]
    onUpdate: (details: CaseDetail[]) => void
    readOnly?: boolean
}

// ✅ Etichette predefinite per i dettagli caso
const PREDEFINED_LABELS = [
    'Nome indagato/imputato',
    'Nr. procedimento',
    'Ufficio che procede',
    'Reato/i contestati',
    'Data e luogo',
    'Ufficio del P.M.',
    'Parte offesa',
    'Polizia Giudiziaria',
    'Difensore/i',
    'Altro'
]

// ✅ Dettagli predefiniti di default
const DEFAULT_DETAILS: Omit<CaseDetail, 'id'>[] = [
    { label: 'Nome indagato/imputato', value: '', order: 0 },
    { label: 'Nr. procedimento', value: '', order: 1 },
    { label: 'Ufficio che procede', value: '', order: 2 },
    { label: 'Reato/i contestati', value: '', order: 3 },
    { label: 'Data e luogo', value: '', order: 4 },
    { label: 'Ufficio del P.M.', value: '', order: 5 },
    { label: 'Parte offesa', value: '', order: 6 },
    { label: 'Polizia Giudiziaria', value: '', order: 7 },
    { label: 'Difensore/i', value: '', order: 8 },
]

export const CaseDetailsTable: React.FC<CaseDetailsTableProps> = ({
    details,
    onUpdate,
    readOnly = false
}) => {
    // ✅ Se non ci sono dettagli, inizializza con quelli di default
    const [localDetails, setLocalDetails] = useState<CaseDetail[]>(() => {
        if (details && details.length > 0) {
            return [...details].sort((a, b) => a.order - b.order)
        }
        // ✅ Crea dettagli di default con ID univoci
        return DEFAULT_DETAILS.map((detail, index) => ({
            ...detail,
            id: `detail_${Date.now()}_${index}`
        }))
    })

    // ✅ Drag & Drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

    // ✅ Etichette disponibili (predefinite + personalizzate già usate)
    const availableLabels = useMemo(() => {
        const usedLabels = new Set(localDetails.map(d => d.label).filter(Boolean))
        const customLabels = Array.from(usedLabels).filter(label =>
            label && !PREDEFINED_LABELS.includes(label)
        )

        // ✅ Assicurati che tutte le etichette usate siano nelle opzioni
        const allLabels = new Set([...PREDEFINED_LABELS, ...customLabels])

        return [
            ...PREDEFINED_LABELS,
            ...(customLabels.length > 0 ? ['---'] : []),
            ...customLabels
        ]
    }, [localDetails])

    const handleAddRow = () => {
        const newDetail: CaseDetail = {
            id: `detail_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            label: '',
            value: '',
            order: localDetails.length
        }
        const updated = [...localDetails, newDetail]
        setLocalDetails(updated)
        onUpdate(updated)
    }

    const handleRemoveRow = (id: string) => {
        const updated = localDetails.filter(d => d.id !== id)
        // ✅ Riordina gli order
        updated.forEach((d, index) => {
            d.order = index
        })
        setLocalDetails(updated)
        onUpdate(updated)
    }

    const handleLabelChange = (id: string, label: string) => {
        const updated = localDetails.map(d => {
            if (d.id === id) {
                return { ...d, label }
            }
            return d
        })
        setLocalDetails(updated)
        onUpdate(updated)
    }

    const handleValueChange = (id: string, value: string) => {
        const updated = localDetails.map(d => {
            if (d.id === id) {
                return { ...d, value }
            }
            return d
        })
        setLocalDetails(updated)
        onUpdate(updated)
    }

    const handleCustomLabel = (id: string, customLabel: string) => {
        if (customLabel.trim()) {
            handleLabelChange(id, customLabel.trim())
        }
    }

    // ✅ Drag & Drop handlers
    const handleDragStart = (index: number) => {
        setDraggedIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index)
        }
    }

    const handleDragLeave = () => {
        setDragOverIndex(null)
    }

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null)
            setDragOverIndex(null)
            return
        }

        const updated = [...localDetails]
        const [draggedItem] = updated.splice(draggedIndex, 1)
        updated.splice(dropIndex, 0, draggedItem)

        // ✅ Aggiorna gli order
        updated.forEach((d, index) => {
            d.order = index
        })

        setLocalDetails(updated)
        onUpdate(updated)
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    // ✅ Filtra etichette disponibili: mostra solo quelle non ancora usate
    const unusedLabels = useMemo(() => {
        const usedLabels = new Set(localDetails.map(d => d.label).filter(Boolean))
        return PREDEFINED_LABELS.filter(label => !usedLabels.has(label))
    }, [localDetails])

    return (
        <div className="space-y-2">
            {/* ✅ Tabella */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 w-8">
                                #
                            </th>
                            {!readOnly && (
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 w-8">
                                    {/* Drag handle column */}
                                </th>
                            )}
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                Etichetta
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                Valore
                            </th>
                            {!readOnly && (
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 w-12">
                                    Azioni
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {localDetails.map((detail, index) => (
                            <tr
                                key={detail.id}
                                draggable={!readOnly}
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "hover:bg-gray-50 transition-colors cursor-move",
                                    index % 2 === 0 ? "bg-white" : "bg-gray-50",
                                    draggedIndex === index && "opacity-50",
                                    dragOverIndex === index && "bg-blue-100"
                                )}
                            >
                                {/* Numero progressivo */}
                                <td className="px-3 py-2 text-sm text-gray-600">
                                    {index + 1}
                                </td>

                                {/* Drag handle */}
                                {!readOnly && (
                                    <td className="px-2 py-2 w-8">
                                        <div className="flex items-center justify-center cursor-grab active:cursor-grabbing">
                                            <GripVertical className="h-4 w-4 text-gray-400" />
                                        </div>
                                    </td>
                                )}

                                {/* Etichetta */}
                                <td className="px-3 py-2">
                                    {readOnly ? (
                                        <span className="text-sm text-gray-900">
                                            {detail.label || '-'}
                                        </span>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Select
                                                value={detail.label || ''}
                                                onValueChange={(value) => {
                                                    if (value === '__custom__') {
                                                        // ✅ Apri input per etichetta personalizzata
                                                        const customLabel = prompt('Inserisci nuova etichetta:')
                                                        if (customLabel && customLabel.trim()) {
                                                            handleLabelChange(detail.id, customLabel.trim())
                                                        }
                                                    } else {
                                                        handleLabelChange(detail.id, value)
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-sm">
                                                    <SelectValue placeholder="Seleziona etichetta">
                                                        {detail.label || 'Seleziona etichetta'}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {unusedLabels.length > 0 ? (
                                                        unusedLabels.map((label) => (
                                                            <SelectItem key={label} value={label}>
                                                                {label}
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <div className="px-2 py-1 text-xs text-gray-400">
                                                            Tutte le etichette predefinite sono state usate
                                                        </div>
                                                    )}
                                                    <div className="px-2 py-1 border-t border-gray-200">
                                                        <SelectItem value="__custom__" className="text-blue-600 font-medium">
                                                            + Etichetta libera
                                                        </SelectItem>
                                                    </div>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </td>

                                {/* Valore */}
                                <td className="px-3 py-2">
                                    <Input
                                        value={detail.value}
                                        onChange={(e) => handleValueChange(detail.id, e.target.value)}
                                        readOnly={readOnly}
                                        placeholder="Inserisci valore"
                                        className="h-8 text-sm"
                                    />
                                </td>

                                {/* Azioni */}
                                {!readOnly && (
                                    <td className="px-3 py-2 text-right">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveRow(detail.id)}
                                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ✅ Pulsante Aggiungi riga */}
            {!readOnly && (
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRow}
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Aggiungi riga
                    </Button>
                </div>
            )}
        </div>
    )
}
