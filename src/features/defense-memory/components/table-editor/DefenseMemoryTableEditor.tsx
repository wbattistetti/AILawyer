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
import { ExtractData, ObservationBlock, ExtractBlock } from './types/blocks.types'
import { getVerbaliTypes, getMainCellTypes } from './utils/cellTypeConfig'

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

    // ✅ Stato per tracciare quale riga deve essere espansa (per drop estratti su canvas vuoto)
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

    // ✅ Ref per tracciare l'estratto da aggiungere alla nuova riga dopo che viene creata
    const pendingExtractRef = useRef<{ extract: ExtractData, existingRowIds: Set<string> } | null>(null)

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
            cellType: 'nota-libera',
            description: '',
            observations: ''
        })
    }, [addRow])

    // ✅ Handler per aggiungere osservazione (click sul pulsante nell'header)
    const handleAddObservation = useCallback(() => {
        // Aggiunge un'osservazione all'ultima riga, o alla prima se non ci sono righe
        const sortedRows = [...rows].sort((a, b) => a.order - b.order)
        const targetRow = sortedRows.length > 0 ? sortedRows[sortedRows.length - 1] : null

        if (targetRow) {
            const newObservationBlock: ObservationBlock = {
                type: 'observation',
                id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                order: (targetRow.blocks || []).length,
                title: 'Osservazione',
                content: ''
            }

            const newBlocks = [...(targetRow.blocks || []), newObservationBlock]
            updateRow(targetRow.id, { blocks: newBlocks })
        } else {
            // Se non ci sono righe, aggiungi una nuova riga con un'osservazione
            addRow({
                cellType: 'nota-libera',
                description: '',
                observations: '',
                blocks: [{
                    type: 'observation',
                    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    order: 0,
                    title: 'Osservazione',
                    content: ''
                }]
            })
        }
    }, [rows, updateRow, addRow])

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
                cellType: 'nota-libera',
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
                cellType: 'nota-libera',
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

    // ✅ Handler per drop di estratti sul canvas quando non ci sono righe espanse
    const handleCanvasDrop = useCallback((e: React.DragEvent) => {
        if (readOnly) return

        e.preventDefault()
        e.stopPropagation()

        // Verifica se è un estratto
        const dragData = e.dataTransfer.getData('application/json')
        if (!dragData) return

        try {
            const data = JSON.parse(dragData)
            if (data.type !== 'extract' || !data.extract) {
                return // Non è un estratto, ignora
            }

            // Verifica se ci sono righe espanse controllando se c'è una riga con expandedRowId
            const hasExpandedRow = expandedRowId && rows.find(r => r.id === expandedRowId)

            // Se non ci sono righe espanse, crea una nuova riga
            if (!hasExpandedRow) {
                // Salva gli ID delle righe esistenti prima di aggiungere
                const existingRowIds = new Set(rows.map(r => r.id))

                // Salva l'estratto nel ref per aggiungerlo dopo che la riga viene creata
                pendingExtractRef.current = {
                    extract: data.extract as ExtractData,
                    existingRowIds
                }

                // Crea una nuova riga di tipo 'nota-libera'
                addRow({
                    cellType: 'nota-libera',
                    description: '',
                    observations: '',
                    blocks: []
                })
            }
        } catch (err) {
            console.error('[DefenseMemoryTableEditor] Errore durante drop estratto sul canvas:', err)
        }
    }, [readOnly, expandedRowId, rows, addRow])

    // ✅ useEffect per gestire l'aggiunta dell'estratto alla nuova riga dopo che viene creata
    useEffect(() => {
        if (!pendingExtractRef.current) return

        const pending = pendingExtractRef.current

        // Trova la nuova riga (quella che non esisteva prima)
        const newRow = rows.find(r =>
            !pending.existingRowIds.has(r.id) &&
            r.cellType === 'nota-libera' &&
            (!r.blocks || r.blocks.length === 0)
        )

        if (newRow) {
            // Imposta la riga come espansa
            setExpandedRowId(newRow.id)

            // Aggiungi l'estratto come ExtractBlock
            const extractBlock: ExtractBlock = {
                type: 'extract',
                id: `extract_block_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                order: 0,
                extract: pending.extract,
                title: pending.extract.title,
                observation: pending.extract.observation,
                hasObservation: pending.extract.hasObservation ?? false,
                collapsed: pending.extract.collapsed ?? false
            }

            const newBlocks = [extractBlock]
            updateRow(newRow.id, { blocks: newBlocks })

            // Reset del ref
            pendingExtractRef.current = null
        }
    }, [rows, updateRow])

    // ✅ Handler per dragOver sul canvas
    const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
        if (readOnly) return

        e.preventDefault()
        e.stopPropagation()

        // Verifica se è un estratto
        const types = Array.from(e.dataTransfer.types)
        if (types.includes('application/json')) {
            // Imposta dropEffect per estratti
            e.dataTransfer.dropEffect = 'move'
        }
    }, [readOnly])

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
                onAddObservation={!readOnly ? handleAddObservation : undefined}
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
                onDragOver={!readOnly ? handleCanvasDragOver : undefined}
                onDrop={!readOnly ? handleCanvasDrop : undefined}
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
                                    defaultExpanded={expandedRowId === row.id}
                                    onExpandChange={(rowId, isExpanded) => {
                                        if (isExpanded) {
                                            setExpandedRowId(rowId)
                                        } else if (expandedRowId === rowId) {
                                            setExpandedRowId(null)
                                        }
                                    }}
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
                        Verbali: {rows.filter(r => getVerbaliTypes().includes(r.cellType)).length} |
                        Altri: {rows.filter(r => !getMainCellTypes().includes(r.cellType)).length}
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
