import React, { useCallback, useEffect } from 'react'
import { DefenseMemoryTableEditorProps } from './types/table.types'
import { useTableData } from './hooks/useTableData'
import { useRowValidation } from './hooks/useRowValidation'
import { TableHeader } from './components/TableHeader'
import { TableRow } from './components/TableRow'
import { exportToJSON, exportToCSV } from './utils/tableSerialization'
import { cn } from '@/lib/utils'

export const DefenseMemoryTableEditor: React.FC<DefenseMemoryTableEditorProps> = ({
    praticaId,
    clienteId,
    clienteNome,
    initialData,
    onSave,
    onCancel,
    readOnly = false,
    className = ''
}) => {

    const {
        tableData,
        rows,
        addRow,
        updateRow,
        deleteRow,
        moveRowUp,
        moveRowDown,
        reorderRows,
        resetTable,
        getRowCount,
        canMoveUp,
        canMoveDown
    } = useTableData({
        initialData,
        onDataChange: (data) => {
            // Salva in memoria globale con chiave specifica per cliente
            if (typeof window !== 'undefined') {
                if (clienteId) {
                    (window as any)[`__defenseMemoryTable_${clienteId}`] = data
                } else {
                    (window as any).__defenseMemoryTable = data
                }
            }
        }
    })

    const {
        errors,
        validationResult,
        getRowErrors,
        hasRowErrors,
        validateAll
    } = useRowValidation({
        rows,
        validateOnChange: true,
        validateOnBlur: true
    })

    // Carica dati iniziali
    useEffect(() => {
        if (initialData) {
            // I dati vengono già caricati dal hook useTableData
        } else if (typeof window !== 'undefined' && (window as any).__defenseMemoryTable) {
            // Carica da memoria globale se disponibile
            const savedData = (window as any).__defenseMemoryTable
            if (savedData) {
                // I dati vengono gestiti dal hook
            }
        }
    }, [initialData])

    const handleAddRow = useCallback(() => {
        // Aggiunge direttamente una riga vuota
        addRow({
            cellType: 'fatto',
            description: '',
            observations: ''
        })
    }, [addRow])

    const handleDeleteRow = useCallback((rowId: string) => {
        deleteRow(rowId)
    }, [deleteRow])

    const handleMoveRowUp = useCallback((rowId: string) => {
        moveRowUp(rowId)
    }, [moveRowUp])

    const handleMoveRowDown = useCallback((rowId: string) => {
        moveRowDown(rowId)
    }, [moveRowDown])

    const handleSave = useCallback(() => {
        const validation = validateAll()
        if (validation.isValid) {
            onSave?.(tableData)
        } else {
            alert('Ci sono errori di validazione. Controlla i campi evidenziati.')
        }
    }, [validateAll, tableData, onSave])

    const handleExportJSON = useCallback(() => {
        const json = exportToJSON(tableData)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `memoria-difensiva-${praticaId}-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [tableData, praticaId])

    const handleExportCSV = useCallback(() => {
        const csv = exportToCSV(tableData)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `memoria-difensiva-${praticaId}-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [tableData, praticaId])

    const handleExport = useCallback(() => {
        handleExportJSON()
    }, [handleExportJSON])

    const sortedRows = [...rows].sort((a, b) => a.order - b.order)

    return (
        <div className={cn(
            "flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden",
            className
        )}>
            {/* Header */}
            <TableHeader
                onAddRow={handleAddRow}
                onSave={onSave ? handleSave : undefined}
                onExport={handleExport}
                rowCount={getRowCount()}
                readOnly={readOnly}
                clienteNome={clienteNome}
            />

            {/* Tabella */}
            <div className="flex-1 overflow-auto">
                {sortedRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <div className="text-center">
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                Nessuna riga presente
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Inizia aggiungendo la prima riga alla tabella
                            </p>
                            {!readOnly && (
                                <button
                                    onClick={handleAddRow}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    Aggiungi prima riga
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="min-w-full">
                        {/* Header colonne */}
                        <div className="grid grid-cols-12 bg-gray-100 border-b border-gray-200 text-sm font-medium text-gray-700">
                            <div className="col-span-1 p-4 text-center">#</div>
                            <div className="col-span-5 p-4">Tipo e Descrizione</div>
                            <div className="col-span-5 p-4">Osservazioni</div>
                            <div className="col-span-1 p-4 text-center">Azioni</div>
                        </div>

                        {/* Righe */}
                        {sortedRows.map((row, index) => (
                            <TableRow
                                key={row.id}
                                row={row}
                                order={index + 1}
                                onUpdate={updateRow}
                                onDelete={handleDeleteRow}
                                onMoveUp={canMoveUp(row.id) ? () => handleMoveRowUp(row.id) : undefined}
                                onMoveDown={canMoveDown(row.id) ? () => handleMoveRowDown(row.id) : undefined}
                                readOnly={readOnly}
                                errors={getRowErrors(row.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer con statistiche */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                <div className="flex justify-between items-center">
                    <span>
                        Totale righe: {getRowCount()} |
                        Reati contestati: {rows.filter(r => r.cellType === 'reato-contestato').length} |
                        Fatti: {rows.filter(r => r.cellType === 'fatto').length} |
                        Atti: {rows.filter(r => r.cellType === 'atto').length}
                    </span>
                    <span>
                        Ultimo aggiornamento: {new Date(tableData.lastUpdated).toLocaleString('it-IT')}
                    </span>
                </div>
            </div>

        </div>
    )
}
