import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Plus, Printer, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableHeaderProps {
    onAddRow: () => void
    onAddObservation?: () => void // ✅ Handler per click su "Aggiungi osservazione"
    onExport?: (format: 'pdf' | 'word') => void // ✅ Handler per export (chiamato quando si clicca "Stampa")
    rowCount: number
    readOnly?: boolean
    className?: string
    includeExtracts?: boolean // ✅ Flag per includere estratti nell'export
    onIncludeExtractsChange?: (include: boolean) => void // ✅ Callback per cambiare il flag
    includeEmptyRows?: boolean // ✅ Flag per includere righe vuote nel preambolo
    onIncludeEmptyRowsChange?: (include: boolean) => void // ✅ Callback per cambiare il flag
    exportFormat?: 'pdf' | 'word' // ✅ Formato selezionato
    onExportFormatChange?: (format: 'pdf' | 'word') => void // ✅ Callback per cambiare il formato
}

export const TableHeader: React.FC<TableHeaderProps> = ({
    onAddRow,
    onAddObservation,
    onExport,
    rowCount,
    readOnly = false,
    className = '',
    includeExtracts = true,
    onIncludeExtractsChange,
    includeEmptyRows = false,
    onIncludeEmptyRowsChange,
    exportFormat = 'pdf',
    onExportFormatChange
}) => {
    const [localIncludeExtracts, setLocalIncludeExtracts] = useState(includeExtracts)
    const [localIncludeEmptyRows, setLocalIncludeEmptyRows] = useState(includeEmptyRows)
    const [localExportFormat, setLocalExportFormat] = useState<'pdf' | 'word'>(exportFormat)
    const [isOpen, setIsOpen] = useState(false)

    const handleIncludeExtractsChange = (checked: boolean) => {
        setLocalIncludeExtracts(checked)
        onIncludeExtractsChange?.(checked)
    }

    const handleIncludeEmptyRowsChange = (checked: boolean) => {
        setLocalIncludeEmptyRows(checked)
        onIncludeEmptyRowsChange?.(checked)
    }

    const handleFormatChange = (format: 'pdf' | 'word') => {
        setLocalExportFormat(format)
        onExportFormatChange?.(format)
    }

    const handlePrint = () => {
        onExport?.(localExportFormat)
        setIsOpen(false) // Chiudi il dropdown dopo la stampa
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
                <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
                    <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
                        {/* ✅ Formato selezionabile (radio) */}
                        <DropdownMenuRadioGroup value={localExportFormat} onValueChange={(value) => handleFormatChange(value as 'pdf' | 'word')}>
                            <DropdownMenuRadioItem
                                value="pdf"
                                className="flex items-center space-x-2"
                                onSelect={(e) => e.preventDefault()}
                            >
                                <FileText className="h-4 w-4" />
                                <span>PDF</span>
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem
                                value="word"
                                className="flex items-center space-x-2"
                                onSelect={(e) => e.preventDefault()}
                            >
                                <FileText className="h-4 w-4" />
                                <span>Word</span>
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        {/* ✅ Opzioni checkbox */}
                        <DropdownMenuCheckboxItem
                            checked={localIncludeExtracts}
                            onCheckedChange={handleIncludeExtractsChange}
                            onSelect={(e) => e.preventDefault()}
                        >
                            Stampa anche estratti
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={localIncludeEmptyRows}
                            onCheckedChange={handleIncludeEmptyRowsChange}
                            onSelect={(e) => e.preventDefault()}
                        >
                            Includi righe vuote
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        {/* ✅ Pulsante Stampa */}
                        <div className="p-1">
                            <Button
                                onClick={handlePrint}
                                size="sm"
                                className="w-full"
                            >
                                <Printer className="h-4 w-4 mr-2" />
                                Stampa
                            </Button>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
