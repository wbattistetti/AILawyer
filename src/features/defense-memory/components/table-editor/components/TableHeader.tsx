import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Printer, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableHeaderProps {
    onAddRow: () => void
    onAddObservation?: () => void // ✅ Handler per click su "Aggiungi osservazione"
    onExportPDF?: () => void // ✅ Handler per export PDF
    onExportWord?: () => void // ✅ Handler per export Word
    rowCount: number
    readOnly?: boolean
    className?: string
    includeExtracts?: boolean // ✅ Flag per includere estratti nell'export
    onIncludeExtractsChange?: (include: boolean) => void // ✅ Callback per cambiare il flag
}

export const TableHeader: React.FC<TableHeaderProps> = ({
    onAddRow,
    onAddObservation,
    onExportPDF,
    onExportWord,
    rowCount,
    readOnly = false,
    className = '',
    includeExtracts = true,
    onIncludeExtractsChange
}) => {
    const [localIncludeExtracts, setLocalIncludeExtracts] = useState(includeExtracts)

    const handleIncludeExtractsChange = (checked: boolean) => {
        setLocalIncludeExtracts(checked)
        onIncludeExtractsChange?.(checked)
    }

    return (
        <div className={`flex items-center justify-between p-4 border-b bg-gray-50 ${className}`}>
            {/* ✅ Rimosso il titolo a sinistra, mantenuto solo il conteggio righe */}
            <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">
                    {rowCount} {rowCount === 1 ? 'riga' : 'righe'}
                </span>
            </div>

            <div className="flex items-center space-x-2">
                {!readOnly && (
                    <>
                        <Button
                            onClick={onAddRow}
                            size="sm"
                            className="flex items-center space-x-1"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Aggiungi riga</span>
                        </Button>
                        {onAddObservation && (
                            <Button
                                draggable
                                onDragStart={(e) => {
                                    // ✅ Imposta dati per drag
                                    e.dataTransfer.setData('application/json', JSON.stringify({
                                        type: 'new-observation',
                                        source: 'header-button'
                                    }))
                                    e.dataTransfer.effectAllowed = 'copy'
                                    // ✅ Aggiungi classe per feedback visivo
                                    e.currentTarget.style.opacity = '0.5'
                                }}
                                onDragEnd={(e) => {
                                    // ✅ Ripristina opacità
                                    e.currentTarget.style.opacity = '1'
                                }}
                                onClick={onAddObservation}
                                size="sm"
                                className="flex items-center space-x-1 bg-green-500 hover:bg-green-600 text-white"
                            >
                                <Plus className="h-4 w-4" />
                                <span>Aggiungi osservazione</span>
                            </Button>
                        )}
                    </>
                )}

                {/* ✅ Nuovo pulsante "Stampa" con dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                        >
                            <Printer className="h-4 w-4" />
                            <span>Stampa</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => onExportPDF?.()}
                            className="flex items-center space-x-2"
                        >
                            <FileText className="h-4 w-4" />
                            <span>PDF</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => onExportWord?.()}
                            className="flex items-center space-x-2"
                        >
                            <FileText className="h-4 w-4" />
                            <span>Word</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            checked={localIncludeExtracts}
                            onCheckedChange={handleIncludeExtractsChange}
                        >
                            Stampa anche estratti
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
