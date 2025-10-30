import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ExtractClassifier,
    ExtractTreeView,
    DefenseDocumentBuilder
} from '../defense-memory'
import { Estratto } from '@/types'
import { api } from '@/lib/api'

interface DefenseMemoryDemoProps {
    praticaId: string
}

export const DefenseMemoryDemo: React.FC<DefenseMemoryDemoProps> = ({ praticaId }) => {
    const [extracts, setExtracts] = useState<Estratto[]>([])
    const [showClassifier, setShowClassifier] = useState(false)
    const [showDocumentBuilder, setShowDocumentBuilder] = useState(false)
    const [selectedExtract, setSelectedExtract] = useState<Estratto | null>(null)
    const [loading, setLoading] = useState(false)

    // Carica estratti esistenti
    useEffect(() => {
        loadExtracts()
    }, [praticaId])

    const loadExtracts = async () => {
        try {
            setLoading(true)
            const response = await api.getEstrattiByPratica(praticaId)
            setExtracts(response.estratti)
        } catch (error) {
            console.error('Errore nel caricamento estratti:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleExtractCreated = (newExtract: Estratto) => {
        setExtracts(prev => [newExtract, ...prev])
        setShowClassifier(false)
    }

    const handleExtractUpdate = async (extractId: string, field: string, value: string) => {
        try {
            await api.updateEstratto(extractId, { [field]: value })
            setExtracts(prev =>
                prev.map(e => e.id === extractId ? { ...e, [field]: value } : e)
            )
        } catch (error) {
            console.error('Errore nell\'aggiornamento estratto:', error)
        }
    }

    const handleExtractDelete = async (extractId: string) => {
        try {
            await api.deleteEstratto(extractId)
            setExtracts(prev => prev.filter(e => e.id !== extractId))
        } catch (error) {
            console.error('Errore nell\'eliminazione estratto:', error)
        }
    }

    const handleDocumentExport = (format: 'pdf' | 'word') => {
        console.log(`Esportazione documento in formato ${format}`)
        // TODO: Implementare esportazione
    }

    if (showClassifier) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Classificazione Nuovo Estratto</CardTitle>
                            <Button variant="outline" onClick={() => setShowClassifier(false)}>
                                Annulla
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ExtractClassifier
                            praticaId={praticaId}
                            extractContent="Questo è un estratto di esempio per testare il sistema di classificazione. Contiene informazioni rilevanti per il caso giudiziario."
                            sourceDoc={{
                                id: 'doc-1',
                                title: 'Documento di Test',
                                page: 1,
                                bbox: { x: 100, y: 200, width: 300, height: 50 }
                            }}
                            onSuccess={handleExtractCreated}
                            onCancel={() => setShowClassifier(false)}
                        />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (showDocumentBuilder) {
        return (
            <div className="max-w-6xl mx-auto p-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Compositore Documento Difesa</CardTitle>
                            <Button variant="outline" onClick={() => setShowDocumentBuilder(false)}>
                                Torna alla Lista
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DefenseDocumentBuilder
                            praticaId={praticaId}
                            extracts={extracts}
                            onExtractUpdate={handleExtractUpdate}
                            onDocumentExport={handleDocumentExport}
                        />
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center space-x-2">
                            <span>🛡️</span>
                            <span>Sistema Analisi atti</span>
                            <Badge variant="outline">{extracts.length} estratti</Badge>
                        </CardTitle>

                        <div className="flex space-x-2">
                            <Button
                                onClick={() => setShowClassifier(true)}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                ➕ Nuovo Estratto
                            </Button>

                            {extracts.length > 0 && (
                                <Button
                                    onClick={() => setShowDocumentBuilder(true)}
                                    variant="outline"
                                >
                                    📄 Componi Documento
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Statistiche */}
            {extracts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Statistiche Estratti</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-600">
                                    {extracts.filter(e => e.type === 'reato').length}
                                </div>
                                <div className="text-sm text-gray-600">Reati</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                    {extracts.filter(e => e.type === 'motivazione').length}
                                </div>
                                <div className="text-sm text-gray-600">Motivazioni</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">
                                    {extracts.filter(e => e.type === 'contromotivazione').length}
                                </div>
                                <div className="text-sm text-gray-600">Contro-motivazioni</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-600">
                                    {extracts.filter(e => e.type === 'prova').length}
                                </div>
                                <div className="text-sm text-gray-600">Prove</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-600">
                                    {extracts.filter(e => e.type === 'testimonianza').length}
                                </div>
                                <div className="text-sm text-gray-600">Testimonianze</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-gray-600">
                                    {extracts.filter(e => e.type === 'altro').length}
                                </div>
                                <div className="text-sm text-gray-600">Altro</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lista estratti */}
            {loading ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <div className="text-lg">Caricamento estratti...</div>
                    </CardContent>
                </Card>
            ) : extracts.length > 0 ? (
                <ExtractTreeView
                    estratti={extracts}
                    onExtractSelect={setSelectedExtract}
                    onExtractEdit={setSelectedExtract}
                    onExtractDelete={handleExtractDelete}
                />
            ) : (
                <Card>
                    <CardContent className="p-8 text-center">
                        <div className="text-4xl mb-4">📋</div>
                        <h3 className="text-lg font-medium mb-2">Nessun estratto classificato</h3>
                        <p className="text-gray-600 mb-4">
                            Inizia classificando alcuni estratti dai documenti per creare la memoria difensiva
                        </p>
                        <Button
                            onClick={() => setShowClassifier(true)}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            ➕ Classifica Primo Estratto
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Dettagli estratto selezionato */}
            {selectedExtract && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Dettagli Estratto</CardTitle>
                            <Button variant="outline" onClick={() => setSelectedExtract(null)}>
                                Chiudi
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-medium">Titolo</h4>
                                <p className="text-gray-600">{selectedExtract.title || 'Senza titolo'}</p>
                            </div>

                            <div>
                                <h4 className="font-medium">Contenuto</h4>
                                <p className="text-gray-600">{selectedExtract.content}</p>
                            </div>

                            <div>
                                <h4 className="font-medium">Fonte</h4>
                                <p className="text-gray-600">
                                    {selectedExtract.sourceDocTitle} - Pagina {selectedExtract.page}
                                </p>
                            </div>

                            {(selectedExtract.notesAnalyst || selectedExtract.notesStrategy || selectedExtract.notesDefense) && (
                                <div>
                                    <h4 className="font-medium">Note</h4>
                                    {selectedExtract.notesAnalyst && (
                                        <div className="mb-2">
                                            <strong>Analista:</strong> {selectedExtract.notesAnalyst}
                                        </div>
                                    )}
                                    {selectedExtract.notesStrategy && (
                                        <div className="mb-2">
                                            <strong>Strategia:</strong> {selectedExtract.notesStrategy}
                                        </div>
                                    )}
                                    {selectedExtract.notesDefense && (
                                        <div className="mb-2">
                                            <strong>Difesa:</strong> {selectedExtract.notesDefense}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
