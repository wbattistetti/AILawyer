import { useState, useCallback, useEffect } from 'react'
import { DefenseMemoryTableData, TableRow, TableRowFormData } from '../types/table.types'
import {
    createEmptyTable,
    createEmptyRow,
    addRow,
    updateRow,
    deleteRow,
    moveRow,
    reorderRows
} from '../utils/tableSerialization'

interface UseTableDataProps {
    initialData?: DefenseMemoryTableData
    onDataChange?: (data: DefenseMemoryTableData) => void
}

export const useTableData = ({ initialData, onDataChange }: UseTableDataProps = {}) => {
    const [tableData, setTableData] = useState<DefenseMemoryTableData>(
        initialData || createEmptyTable()
    )

    // Notifica cambiamenti al parent
    useEffect(() => {
        onDataChange?.(tableData)
    }, [tableData, onDataChange])

    const addNewRow = useCallback((rowData: Omit<TableRowFormData, 'id' | 'order'>) => {
        setTableData(prev => {
            const newData = addRow(prev.rows, rowData)
            return {
                ...prev,
                rows: newData,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const updateExistingRow = useCallback((rowId: string, updates: Partial<TableRowFormData>) => {
        setTableData(prev => {
            const newRows = updateRow(prev.rows, rowId, updates)
            return {
                ...prev,
                rows: newRows,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const removeRow = useCallback((rowId: string) => {
        setTableData(prev => {
            const newRows = deleteRow(prev.rows, rowId)
            return {
                ...prev,
                rows: newRows,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const moveRowUp = useCallback((rowId: string) => {
        setTableData(prev => {
            const newRows = moveRow(prev.rows, rowId, 'up')
            return {
                ...prev,
                rows: newRows,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const moveRowDown = useCallback((rowId: string) => {
        setTableData(prev => {
            const newRows = moveRow(prev.rows, rowId, 'down')
            return {
                ...prev,
                rows: newRows,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const reorderTableRows = useCallback((newOrder: TableRow[]) => {
        setTableData(prev => {
            const reorderedRows = reorderRows(newOrder)
            return {
                ...prev,
                rows: reorderedRows,
                lastUpdated: new Date().toISOString()
            }
        })
    }, [])

    const resetTable = useCallback(() => {
        setTableData(createEmptyTable())
    }, [])

    const loadTableData = useCallback((data: DefenseMemoryTableData) => {
        setTableData(data)
    }, [])

    const getRowById = useCallback((rowId: string): TableRow | undefined => {
        return tableData.rows.find(row => row.id === rowId)
    }, [tableData.rows])

    const getRowCount = useCallback(() => {
        return tableData.rows.length
    }, [tableData.rows.length])

    const canMoveUp = useCallback((rowId: string): boolean => {
        const sortedRows = [...tableData.rows].sort((a, b) => a.order - b.order)
        const currentIndex = sortedRows.findIndex(row => row.id === rowId)
        return currentIndex > 0
    }, [tableData.rows])

    const canMoveDown = useCallback((rowId: string): boolean => {
        const sortedRows = [...tableData.rows].sort((a, b) => a.order - b.order)
        const currentIndex = sortedRows.findIndex(row => row.id === rowId)
        return currentIndex < sortedRows.length - 1
    }, [tableData.rows])

    return {
        tableData,
        rows: tableData.rows,
        addRow: addNewRow,
        updateRow: updateExistingRow,
        deleteRow: removeRow,
        moveRowUp,
        moveRowDown,
        reorderRows: reorderTableRows,
        resetTable,
        loadTableData,
        getRowById,
        getRowCount,
        canMoveUp,
        canMoveDown
    }
}
