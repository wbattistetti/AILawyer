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
        <div className="border border-border rounded-lg bg-background">
            {/* Search box (sempre presente per layout stabile) */}
            <div className="p-2 border-b border-border">
                <input
                    type="text"
                    placeholder={showSearch ? "Cerca clienti..." : "Clienti disponibili"}
                    className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={!showSearch}
                />
            </div>

            {/* Lista clienti scrollabile */}
            <div className={`p-2 ${maxHeight} overflow-y-auto`}>
                {filteredClienti.length > 0 ? (
                    filteredClienti.map(cliente => (
                        <label key={cliente.id} className="flex items-center space-x-2 py-1 hover:bg-accent cursor-pointer rounded">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(cliente.id)}
                                onChange={() => handleToggleClient(cliente.id)}
                                className="rounded border-border bg-background text-primary focus:ring-blue-500"
                            />
                            <span className="text-sm text-foreground">{cliente.nome} {cliente.cognome}</span>
                        </label>
                    ))
                ) : (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                        {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente disponibile'}
                    </div>
                )}
            </div>
        </div>
    )
}
