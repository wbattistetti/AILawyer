import { DefenseMemoryTableData, TableRow, Motivation } from '../types/table.types'

export const createEmptyTable = (): DefenseMemoryTableData => ({
    rows: [],
    lastUpdated: new Date().toISOString(),
    version: 1
})

export const createEmptyRow = (order: number): TableRow => ({
    id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    order,
    cellType: 'fatto',
    description: '',
    observations: ''
})

export const serializeTable = (data: DefenseMemoryTableData): string => {
    return JSON.stringify(data, null, 2)
}

export const deserializeTable = (json: string): DefenseMemoryTableData | null => {
    try {
        const parsed = JSON.parse(json)

        // Validazione base
        if (!parsed.rows || !Array.isArray(parsed.rows)) {
            return null
        }

        // Migrazione legacy: extract -> motivations (se assente)
        const migratedRows: TableRow[] = parsed.rows.map((row: TableRow) => {
            if (!row.motivations && row.extract) {
                const motivation: Motivation = {
                    id: `mot_${Math.random().toString(36).slice(2)}`,
                    text: row.extract.content,
                    source: row.extract.source,
                    page: row.extract.page,
                    isHidden: !!row.extract.isHidden,
                    observation: ''
                }
                return {
                    ...row,
                    motivations: [motivation]
                }
            }
            return row
        })

        return {
            ...parsed,
            rows: migratedRows,
            lastUpdated: parsed.lastUpdated || new Date().toISOString(),
            version: parsed.version ? Math.max(parsed.version, 2) : 2
        }
    } catch {
        return null
    }
}

export const reorderRows = (rows: TableRow[]): TableRow[] => {
    return rows
        .sort((a, b) => a.order - b.order)
        .map((row, index) => ({
            ...row,
            order: index + 1
        }))
}

export const addRow = (rows: TableRow[], newRow: Omit<TableRow, 'id' | 'order'>): TableRow[] => {
    const maxOrder = Math.max(0, ...rows.map(r => r.order))
    const row: TableRow = {
        ...newRow,
        id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order: maxOrder + 1
    }

    return [...rows, row]
}

export const addRowAt = (rows: TableRow[], targetOrder: number, newRow: Omit<TableRow, 'id' | 'order'>): TableRow[] => {
    // Incrementa l'ordine di tutte le righe >= targetOrder
    const adjustedRows = rows.map(row => ({
        ...row,
        order: row.order >= targetOrder ? row.order + 1 : row.order
    }))

    // Crea la nuova riga con l'ordine target
    const newTableRow: TableRow = {
        ...newRow,
        id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order: targetOrder
    }

    return reorderRows([...adjustedRows, newTableRow])
}

export const updateRow = (rows: TableRow[], rowId: string, updates: Partial<TableRow>): TableRow[] => {
    return rows.map(row =>
        row.id === rowId
            ? { ...row, ...updates }
            : row
    )
}

export const deleteRow = (rows: TableRow[], rowId: string): TableRow[] => {
    return reorderRows(rows.filter(row => row.id !== rowId))
}

export const moveRow = (rows: TableRow[], rowId: string, direction: 'up' | 'down'): TableRow[] => {
    const sortedRows = [...rows].sort((a, b) => a.order - b.order)
    const currentIndex = sortedRows.findIndex(row => row.id === rowId)

    if (currentIndex === -1) return rows

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (newIndex < 0 || newIndex >= sortedRows.length) return rows

    // Swap orders
    const temp = sortedRows[currentIndex].order
    sortedRows[currentIndex].order = sortedRows[newIndex].order
    sortedRows[newIndex].order = temp

    return reorderRows(sortedRows)
}

export const exportToJSON = (data: DefenseMemoryTableData): string => {
    return serializeTable(data)
}

export const exportToCSV = (data: DefenseMemoryTableData): string => {
    const headers = [
        'Ordine',
        'Tipo',
        'Descrizione',
        'Data Contestazione',
        'Data Evento',
        'Estratto',
        'Fonte Estratto',
        'Pagina Estratto',
        'Osservazioni'
    ]

    const rows = data.rows.map(row => [
        row.order.toString(),
        row.cellType,
        `"${row.description.replace(/"/g, '""')}"`,
        row.contestationDate || '',
        row.eventDate || '',
        row.extract ? `"${row.extract.content.replace(/"/g, '""')}"` : '',
        row.extract ? `"${row.extract.source.replace(/"/g, '""')}"` : '',
        row.extract ? row.extract.page.toString() : '',
        `"${row.observations.replace(/"/g, '""')}"`
    ])

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
}
