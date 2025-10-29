import React from 'react'
// import { DefenseMemoryViewer } from '../../features/defense-memory/components/DefenseMemoryViewer'

export const DefenseMemoryTestPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        🛡️ Test Memoria Difensiva
                    </h1>
                    <p className="text-gray-600">
                        Pagina di test per verificare la generazione di documenti PDF/Word
                    </p>
                </div>

                {/* <DefenseMemoryViewer
                    praticaId="test-pratica"
                    clienteId="test-cliente"
                    clienteNome="Mario Rossi"
                /> */}
                <div className="p-8 text-center text-gray-500">
                    <p>DefenseMemoryViewer temporaneamente in quarantena</p>
                    <p className="text-sm mt-2">Usa le tab dinamiche per cliente nella pratica</p>
                </div>
            </div>
        </div>
    )
}
