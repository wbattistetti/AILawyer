import React from 'react'
import { DefenseMemoryTableEditor } from '../../../../features/defense-memory/components/table-editor/DefenseMemoryTableEditor'
import { DefenseMemoryTableData } from '../../../../features/defense-memory/components/table-editor/types/table.types'
import { Cliente } from '../../../../types'

interface ClienteMemoriaRendererProps {
    praticaId: string
    cliente: Cliente
    onTableSave?: (clienteId: string, data: DefenseMemoryTableData) => void
}

export const ClienteMemoriaRenderer: React.FC<ClienteMemoriaRendererProps> = ({
    praticaId,
    cliente,
    onTableSave
}) => {
    const handleTableSave = (data: DefenseMemoryTableData) => {
        // Salva in memoria globale per questo cliente specifico
        const globalKey = `__defenseMemoryTable_${cliente.id}`
        if (typeof window !== 'undefined') {
            (window as any)[globalKey] = data
        }

        // Notifica il parent
        onTableSave?.(cliente.id, data)

        console.log(`💾 [ClienteMemoriaRenderer] Tabella salvata per cliente ${cliente.nome} ${cliente.cognome}:`, data)
    }

    // Carica dati iniziali dalla memoria globale
    const loadInitialData = (): DefenseMemoryTableData | undefined => {
        if (typeof window === 'undefined') return undefined

        const globalKey = `__defenseMemoryTable_${cliente.id}`
        const savedData = (window as any)[globalKey] as DefenseMemoryTableData

        if (savedData) {
            console.log(`📂 [ClienteMemoriaRenderer] Dati caricati per cliente ${cliente.nome} ${cliente.cognome}:`, savedData)
            return savedData
        }

        return undefined
    }

    return (
        <div className="h-full w-full bg-white">
            <DefenseMemoryTableEditor
                praticaId={praticaId}
                clienteId={cliente.id}
                clienteNome={`${cliente.nome} ${cliente.cognome}`}
                initialData={loadInitialData()}
                onSave={handleTableSave}
                className="h-full"
            />
        </div>
    )
}
