import React, { useState, useMemo } from 'react'
import { Estratto } from '../../../../types'

interface MotivationSelectorProps {
    motivations: Estratto[]
    selectedId: string | null
    onSelectionChange: (selectedId: string | null) => void
    maxHeight?: string
    enableSearchThreshold?: number
    emptyMessage?: string
}

export const MotivationSelector: React.FC<MotivationSelectorProps> = ({
    motivations,
    selectedId,
    onSelectionChange,
    maxHeight = 'max-h-32',
    enableSearchThreshold = 10,
    emptyMessage = 'Nessuna motivazione disponibile'
}) => {
    const [searchTerm, setSearchTerm] = useState('')

    // Filtra motivazioni basato sulla ricerca
    const filteredMotivations = useMemo(() => {
        if (!searchTerm.trim()) return motivations

        return motivations.filter(motivation =>
            (motivation.title || motivation.content).toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [motivations, searchTerm])

    // Determina se mostrare la search box
    const showSearch = motivations.length >= enableSearchThreshold

    const handleSelectMotivation = (motivationId: string) => {
        onSelectionChange(motivationId === selectedId ? null : motivationId)
    }

    return (
        <div className={`border border-gray-300 rounded-lg p-2 ${maxHeight} overflow-y-auto`}>
            {/* Search box (solo se necessario) */}
            {showSearch && (
                <div className="mb-2">
                    <input
                        type="text"
                        placeholder="Cerca motivazioni..."
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            )}

            {/* Lista motivazioni */}
            {filteredMotivations.length > 0 ? (
                filteredMotivations.map(motivation => (
                    <label key={motivation.id} className="flex items-center space-x-2 py-1 hover:bg-gray-50 cursor-pointer rounded">
                        <input
                            type="radio"
                            name="motivationSelection"
                            checked={selectedId === motivation.id}
                            onChange={() => handleSelectMotivation(motivation.id)}
                            className="border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{motivation.title || motivation.content}</span>
                    </label>
                ))
            ) : (
                <div className="text-xs text-gray-500 py-2 text-center">
                    {searchTerm ? 'Nessuna motivazione trovata' : emptyMessage}
                </div>
            )}
        </div>
    )
}
