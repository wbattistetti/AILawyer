import React, { useState, useMemo } from 'react'
import { Cliente } from '../../../../types'

interface ClientSelectorProps {
    clienti: Cliente[]
    selectedIds: string[]
    onSelectionChange: (selectedIds: string[]) => void
    maxHeight?: string
    enableSearchThreshold?: number
}

export const ClientSelector: React.FC<ClientSelectorProps> = ({
    clienti,
    selectedIds,
    onSelectionChange,
    maxHeight = 'max-h-32',
    enableSearchThreshold = 10
}) => {
    const [searchTerm, setSearchTerm] = useState('')

    // Filtra clienti basato sulla ricerca
    const filteredClienti = useMemo(() => {
        if (!searchTerm.trim()) return clienti

        return clienti.filter(cliente =>
            `${cliente.nome} ${cliente.cognome}`.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [clienti, searchTerm])

    // Determina se mostrare la search box
    const showSearch = clienti.length >= enableSearchThreshold

    const handleToggleClient = (clienteId: string) => {
        if (selectedIds.includes(clienteId)) {
            onSelectionChange(selectedIds.filter(id => id !== clienteId))
        } else {
            onSelectionChange([...selectedIds, clienteId])
        }
    }

    return (
        <div className={`border border-gray-300 rounded-lg p-2 ${maxHeight} overflow-y-auto`}>
            {/* Search box (solo se necessario) */}
            {showSearch && (
                <div className="mb-2">
                    <input
                        type="text"
                        placeholder="Cerca clienti..."
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            )}

            {/* Lista clienti */}
            {filteredClienti.length > 0 ? (
                filteredClienti.map(cliente => (
                    <label key={cliente.id} className="flex items-center space-x-2 py-1 hover:bg-gray-50 cursor-pointer rounded">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(cliente.id)}
                            onChange={() => handleToggleClient(cliente.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cliente.nome} {cliente.cognome}</span>
                    </label>
                ))
            ) : (
                <div className="text-xs text-gray-500 py-2 text-center">
                    {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente disponibile'}
                </div>
            )}
        </div>
    )
}
