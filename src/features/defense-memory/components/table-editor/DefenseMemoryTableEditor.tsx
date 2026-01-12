import React, { useCallback, useEffect, useState, useRef } from 'react'
import { DefenseMemoryTableEditorProps } from './types/table.types'
import { useTableData } from './hooks/useTableData'
import { useRowValidation } from './hooks/useRowValidation'
import { useResizableColumns } from './hooks/useResizableColumns'
import { useUndoRedo } from './hooks/useUndoRedo'
import { TableHeader } from './components/TableHeader'
import { AccordionRow } from './components/AccordionRow'
import { exportToJSON, exportToCSV } from './utils/tableSerialization'
import { cn } from '@/lib/utils'
import { ExtractDrawer } from './components/ExtractDrawer'
import { ExtractData } from './types/blocks.types'

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
        addRowAt,
        updateRow,
        deleteRow,
        moveRowUp,
        moveRowDown,
        reorderRows,
        resetTable,
        getRowCount,
        canMoveUp,
        canMoveDown,
        loadTableData
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

    // ✅ Undo/Redo functionality
    const { undo, redo, canUndo, canRedo } = useUndoRedo({
        tableData,
        onStateChange: (data) => {
            loadTableData(data)
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

    const { widths, handleResizeStart } = useResizableColumns()

    // ✅ Stato per estratti nel cassetto
    const [extracts, setExtracts] = useState<ExtractData[]>([])

    // ✅ Listener per eventi 'app:extract-add' dal PDF viewer
    useEffect(() => {
        const handleExtractAdd = (event: CustomEvent) => {
            const { extract } = event.detail
            console.log('[DefenseMemoryTableEditor] 📬 Evento app:extract-add ricevuto:', extract)
            setExtracts(prev => {
                // ✅ Evita duplicati controllando l'ID
                if (prev.some(e => e.id === extract.id)) {
                    console.log('[DefenseMemoryTableEditor] ⚠️ Estratto già presente, skip:', extract.id)
                    return prev
                }
                return [...prev, extract]
            })
        }

        window.addEventListener('app:extract-add', handleExtractAdd as EventListener)
        return () => {
            window.removeEventListener('app:extract-add', handleExtractAdd as EventListener)
        }
    }, [])

    // Stato per zoom locale (Ctrl + rotella)
    const [zoomLevel, setZoomLevel] = useState(1.0) // 1.0 = 100%, 1.2 = 120%, etc.
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollableRef = useRef<HTMLDivElement>(null)
    const zoomLevelRef = useRef(1.0) // Ref per accedere al valore corrente senza causare re-render

    // Sincronizza ref con state
    useEffect(() => {
        zoomLevelRef.current = zoomLevel
    }, [zoomLevel])

    // Handler per zoom con Ctrl + rotella
    const handleWheelZoom = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // Controlla se Ctrl (Windows/Linux) o Meta (Mac) è premuto
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault() // Previene zoom della pagina
            e.stopPropagation() // Previene la propagazione

            // Calcola nuovo zoom level usando il ref per evitare dependency loop
            const currentZoom = zoomLevelRef.current
            // Scroll down (deltaY > 0) = zoom out, scroll up (deltaY < 0) = zoom in
            const delta = e.deltaY > 0 ? -0.05 : 0.05
            const newZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta)) // Limite tra 50% e 200%

            setZoomLevel(newZoom)
        }
    }, [])

    // Handler per zoom con Ctrl + rotella (versione DOM per compatibilità)
    useEffect(() => {
        const container = containerRef.current
        const scrollable = scrollableRef.current
        if (!container) return

        const handleWheel = (e: WheelEvent) => {
            // Controlla se Ctrl (Windows/Linux) o Meta (Mac) è premuto
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault() // Previene zoom della pagina
                e.stopPropagation() // Previene la propagazione

                // Calcola nuovo zoom level usando il ref per evitare dependency loop
                const currentZoom = zoomLevelRef.current
                // Scroll down (deltaY > 0) = zoom out, scroll up (deltaY < 0) = zoom in
                const delta = e.deltaY > 0 ? -0.05 : 0.05
                const newZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta)) // Limite tra 50% e 200%

                setZoomLevel(newZoom)
            }
        }

        container.addEventListener('wheel', handleWheel, { passive: false })
        if (scrollable) {
            scrollable.addEventListener('wheel', handleWheel, { passive: false })
        }

        return () => {
            container.removeEventListener('wheel', handleWheel)
            if (scrollable) {
                scrollable.removeEventListener('wheel', handleWheel)
            }
        }
    }, []) // Nessuna dipendenza per evitare re-registrazione

    // Log per debug - rimuovere in produzione
    // useEffect(() => {
    //     console.log('🟡 [DefenseMemoryTableEditor] widths:', widths)
    //     console.log('🟡 [DefenseMemoryTableEditor] Larghezza totale colonne:',
    //         widths.number + widths.typeDescription + widths.observations)
    // }, [widths])

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

    const handleAddRowAbove = useCallback((rowId: string) => {
        const sortedRows = [...rows].sort((a, b) => a.order - b.order)
        const currentIndex = sortedRows.findIndex(row => row.id === rowId)
        if (currentIndex >= 0) {
            const targetOrder = sortedRows[currentIndex].order
            addRowAt(targetOrder, {
                cellType: 'fatto',
                description: '',
                observations: ''
            })
        }
    }, [rows, addRowAt])

    const handleAddRowBelow = useCallback((rowId: string) => {
        const sortedRows = [...rows].sort((a, b) => a.order - b.order)
        const currentIndex = sortedRows.findIndex(row => row.id === rowId)
        if (currentIndex >= 0) {
            const targetOrder = sortedRows[currentIndex].order + 1
            addRowAt(targetOrder, {
                cellType: 'fatto',
                description: '',
                observations: ''
            })
        }
    }, [rows, addRowAt])

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

    // Spostamento motivazioni tra righe e riordino locale
    const handleMoveMotivation = useCallback((fromRowId: string, toRowId: string, motivationId: string, toIndex: number) => {
        if (fromRowId === toRowId) {
            const source = rows.find(r => r.id === fromRowId)
            if (!source || !source.motivations) return
            const current = [...source.motivations]
            const fromIndex = current.findIndex(m => m.id === motivationId)
            if (fromIndex === -1) return
            const [moved] = current.splice(fromIndex, 1)
            const insertAt = Math.max(0, Math.min(toIndex, current.length))
            current.splice(insertAt, 0, moved)
            updateRow(fromRowId, { motivations: current })
            return
        }

        const fromRow = rows.find(r => r.id === fromRowId)
        const toRow = rows.find(r => r.id === toRowId)
        if (!fromRow || !toRow) return
        const fromMotivs = [...(fromRow.motivations || [])]
        const idx = fromMotivs.findIndex(m => m.id === motivationId)
        if (idx === -1) return
        const [moved] = fromMotivs.splice(idx, 1)
        const toMotivs = [...(toRow.motivations || [])]
        const insertAt = Math.max(0, Math.min(toIndex, toMotivs.length))
        toMotivs.splice(insertAt, 0, moved)

        updateRow(fromRowId, { motivations: fromMotivs })
        updateRow(toRowId, { motivations: toMotivs })
    }, [rows, updateRow])

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex flex-col h-full bg-white border border-gray-200 rounded-lg",
                className
            )}
            style={{
                fontSize: `${zoomLevel * 100}%` // Applica zoom al font-size
            }}
            onWheel={handleWheelZoom}
        >
            {/* Header */}
            <TableHeader
                onAddRow={handleAddRow}
                onSave={onSave ? handleSave : undefined}
                onExport={handleExport}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                rowCount={getRowCount()}
                readOnly={readOnly}
                clienteNome={clienteNome}
            />

            {/* Tabella - riempie tutto il pannello */}
            <div
                ref={scrollableRef}
                className="flex-1 overflow-x-auto overflow-y-auto w-full"
                onWheel={handleWheelZoom}
            >
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
                    <div className="w-full h-full flex flex-col">
                        {/* ✅ Accordion rows - struttura collassabile */}
                        <div className="flex-1 w-full overflow-auto">
                            {sortedRows.map((row, index) => (
                                <AccordionRow
                                    key={row.id}
                                    row={row}
                                    order={index + 1}
                                    onUpdate={updateRow}
                                    onDelete={handleDeleteRow}
                                    onMoveUp={canMoveUp(row.id) ? () => handleMoveRowUp(row.id) : undefined}
                                    onMoveDown={canMoveDown(row.id) ? () => handleMoveRowDown(row.id) : undefined}
                                    onAddRowAbove={handleAddRowAbove}
                                    onAddRowBelow={handleAddRowBelow}
                                    readOnly={readOnly}
                                    errors={getRowErrors(row.id)}
                                    columnWidths={widths}
                                    onMoveMotivation={handleMoveMotivation}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer con statistiche */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <span>
                        Totale righe: {getRowCount()} |
                        Reati contestati: {rows.filter(r => r.cellType === 'reato-contestato').length} |
                        Fatti: {rows.filter(r => r.cellType === 'fatto').length} |
                        Atti: {rows.filter(r => r.cellType === 'atto').length} |
                        Elementi di prova: {rows.filter(r => r.cellType === 'elementi-prova').length} |
                        Verbali: {rows.filter(r => ['verbale-arresto', 'verbale-sequestro', 'verbale-perquisizione'].includes(r.cellType)).length} |
                        Altri: {rows.filter(r => !['reato-contestato', 'fatto', 'atto', 'elementi-prova', 'verbale-arresto', 'verbale-sequestro', 'verbale-perquisizione'].includes(r.cellType)).length}
                    </span>
                    <span>
                        Ultimo aggiornamento: {new Date(tableData.lastUpdated).toLocaleString('it-IT')}
                    </span>
                </div>
            </div>

            {/* ✅ NUOVO: ExtractDrawer (cassetto estratti) - sempre visibile in fondo */}
            <div className="flex-shrink-0">
                <ExtractDrawer
                    extracts={extracts}
                    onExtractAdd={(extract) => {
                        setExtracts(prev => [...prev, extract])
                    }}
                    onExtractUpdate={(updatedExtract) => {
                        // ✅ Aggiorna l'estratto con i nuovi metadati (titolo, osservazione, etc.)
                        setExtracts(prev => prev.map(e =>
                            e.id === updatedExtract.id ? updatedExtract : e
                        ))
                    }}
                    onExtractRemove={(extractId) => {
                        setExtracts(prev => prev.filter(e => e.id !== extractId))
                    }}
                    onExtractReorder={(fromIndex, toIndex) => {
                        setExtracts(prev => {
                            const newExtracts = [...prev]
                            const [moved] = newExtracts.splice(fromIndex, 1)
                            newExtracts.splice(toIndex, 0, moved)
                            return newExtracts
                        })
                    }}
                />
            </div>

        </div>
    )
}
