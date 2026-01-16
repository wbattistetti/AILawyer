import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Save, Download, Upload, Undo2, Redo2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableHeaderProps {
    onAddRow: () => void
    onAddObservation?: () => void // ✅ Handler per click su "Aggiungi osservazione"
    onSave?: () => void
    onExport?: () => void
    onExportPDF?: () => void // ✅ Handler per export PDF
    onImport?: () => void
    onUndo?: () => void
    onRedo?: () => void
    canUndo?: boolean
    canRedo?: boolean
    rowCount: number
    readOnly?: boolean
    className?: string
    clienteNome?: string
}

export const TableHeader: React.FC<TableHeaderProps> = ({
    onAddRow,
    onAddObservation,
    onSave,
    onExport,
    onExportPDF,
    onImport,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    rowCount,
    readOnly = false,
    className = '',
    clienteNome
}) => {
    return (
        <div className={`flex items-center justify-between p-4 border-b bg-gray-50 ${className}`}>
            <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold text-gray-900">
                    {clienteNome ? `Analisi atti - ${clienteNome}` : 'Tabella Analisi atti'}
                </h3>
                <span className="text-sm text-gray-500">
                    {rowCount} {rowCount === 1 ? 'riga' : 'righe'}
                </span>
            </div>

            <div className="flex items-center space-x-2">
                {/* ✅ Undo/Redo buttons */}
                {!readOnly && onUndo && onRedo && (
                    <>
                        <Button
                            onClick={onUndo}
                            size="sm"
                            variant="outline"
                            disabled={!canUndo}
                            className={cn(
                                "flex items-center space-x-1",
                                !canUndo && "opacity-50 cursor-not-allowed"
                            )}
                            title="Annulla (Ctrl+Z)"
                        >
                            <Undo2 className="h-4 w-4" />
                            <span>Annulla</span>
                        </Button>
                        <Button
                            onClick={onRedo}
                            size="sm"
                            variant="outline"
                            disabled={!canRedo}
                            className={cn(
                                "flex items-center space-x-1",
                                !canRedo && "opacity-50 cursor-not-allowed"
                            )}
                            title="Ripeti (Ctrl+Y)"
                        >
                            <Redo2 className="h-4 w-4" />
                            <span>Ripeti</span>
                        </Button>
                    </>
                )}

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

                {onSave && !readOnly && (
                    <Button
                        onClick={onSave}
                        size="sm"
                        variant="outline"
                        className="flex items-center space-x-1"
                    >
                        <Save className="h-4 w-4" />
                        <span>Salva</span>
                    </Button>
                )}

                {onExport && (
                    <Button
                        onClick={onExport}
                        size="sm"
                        variant="outline"
                        className="flex items-center space-x-1"
                    >
                        <Download className="h-4 w-4" />
                        <span>Esporta</span>
                    </Button>
                )}

                {onExportPDF && (
                    <Button
                        onClick={onExportPDF}
                        size="sm"
                        variant="outline"
                        className="flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                    >
                        <FileText className="h-4 w-4" />
                        <span>Esporta PDF</span>
                    </Button>
                )}

                {onImport && !readOnly && (
                    <Button
                        onClick={onImport}
                        size="sm"
                        variant="outline"
                        className="flex items-center space-x-1"
                    >
                        <Upload className="h-4 w-4" />
                        <span>Importa</span>
                    </Button>
                )}
            </div>
        </div>
    )
}
