import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    ExtractType,
    ExtractTypeConfig,
    EXTRACT_TYPE_CONFIGS,
    ExtractClassificationData,
    DefenseMemoryState
} from '../types'
import { api } from '@/lib/api'
import { Estratto } from '@/types'

interface ExtractClassifierProps {
    praticaId: string
    extractContent: string
    sourceDoc: {
        id: string
        title: string
        page: number
        bbox?: { x: number; y: number; width: number; height: number }
    }
    onSuccess: (estratto: Estratto) => void
    onCancel: () => void
}

export const ExtractClassifier: React.FC<ExtractClassifierProps> = ({
    praticaId,
    extractContent,
    sourceDoc,
    onSuccess,
    onCancel
}) => {
    const [state, setState] = useState<DefenseMemoryState>({
        selectedExtractType: null,
        availableReati: [],
        availableMotivazioni: [],
        classificationData: {
            title: '',
            description: '',
            extractDate: new Date()
        },
        isSubmitting: false,
        error: null
    })

    // Carica dati iniziali
    useEffect(() => {
        loadExistingExtracts()
    }, [praticaId])

    const loadExistingExtracts = async () => {
        try {
            const response = await api.getEstrattiByPratica(praticaId)
            const estratti = response.estratti

            // Filtra reati esistenti
            const reati = estratti
                .filter(e => e.type === 'reato')
                .map(e => ({ id: e.id, title: e.title || e.content.slice(0, 50) + '...' }))

            // Filtra motivazioni esistenti
            const motivazioni = estratti
                .filter(e => e.type === 'motivazione')
                .map(e => ({
                    id: e.id,
                    title: e.title || e.content.slice(0, 50) + '...',
                    parentReatoId: e.parentReatoId!
                }))

            setState(prev => ({
                ...prev,
                availableReati: reati,
                availableMotivazioni: motivazioni
            }))
        } catch (error) {
            console.error('Errore nel caricamento estratti esistenti:', error)
        }
    }

    const handleTypeSelect = (type: ExtractType) => {
        setState(prev => ({
            ...prev,
            selectedExtractType: type,
            classificationData: {
                ...prev.classificationData,
                type,
                parentReatoId: undefined,
                parentMotivazioneId: undefined
            }
        }))
    }

    const handleInputChange = (field: keyof ExtractClassificationData, value: any) => {
        setState(prev => ({
            ...prev,
            classificationData: {
                ...prev.classificationData,
                [field]: value
            }
        }))
    }

    const handleSubmit = async () => {
        if (!state.selectedExtractType || !state.classificationData.title?.trim()) {
            setState(prev => ({ ...prev, error: 'Tipo e titolo sono obbligatori' }))
            return
        }

        // Validazione gerarchica
        if (state.selectedExtractType === 'motivazione' && !state.classificationData.parentReatoId) {
            setState(prev => ({ ...prev, error: 'Seleziona un reato per la motivazione' }))
            return
        }

        if (state.selectedExtractType === 'contromotivazione' && !state.classificationData.parentMotivazioneId) {
            setState(prev => ({ ...prev, error: 'Seleziona una motivazione per la contro-motivazione' }))
            return
        }

        setState(prev => ({ ...prev, isSubmitting: true, error: null }))

        try {
            const estrattoData = {
                praticaId,
                sourceDoc: sourceDoc.id,
                sourceDocTitle: sourceDoc.title,
                page: sourceDoc.page,
                start: 0, // TODO: calcolare dalla selezione
                end: extractContent.length,
                type: state.selectedExtractType,
                parentReatoId: state.classificationData.parentReatoId,
                parentMotivazioneId: state.classificationData.parentMotivazioneId,
                title: state.classificationData.title,
                content: extractContent,
                bbox: sourceDoc.bbox,
                extractDate: state.classificationData.extractDate,
                notesAnalyst: state.classificationData.notesAnalyst,
                notesDescription: state.classificationData.notesDescription,
                notesStrategy: state.classificationData.notesStrategy,
                notesDefense: state.classificationData.notesDefense,
                analystId: 'current-user' // TODO: ottenere dal contesto utente
            }

            const newEstratto = await api.createEstratto(estrattoData)
            onSuccess(newEstratto)
        } catch (error) {
            console.error('Errore nel salvataggio estratto:', error)
            setState(prev => ({
                ...prev,
                error: 'Errore nel salvataggio dell\'estratto',
                isSubmitting: false
            }))
        }
    }

    const getTypeConfig = (type: ExtractType): ExtractTypeConfig => {
        return EXTRACT_TYPE_CONFIGS.find(config => config.type === type)!
    }

    const renderTypeSelector = () => (
        <div className="space-y-4">
            <Label className="text-lg font-semibold">Seleziona Tipo di Estratto</Label>
            <div className="grid grid-cols-2 gap-3">
                {EXTRACT_TYPE_CONFIGS.map(config => (
                    <Card
                        key={config.type}
                        className={`cursor-pointer transition-all hover:shadow-md ${state.selectedExtractType === config.type
                                ? 'ring-2 ring-blue-500 bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                        onClick={() => handleTypeSelect(config.type)}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                                <div
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: config.color }}
                                />
                                <span className="text-2xl">{config.icon}</span>
                                <div>
                                    <div className="font-medium">{config.label}</div>
                                    <div className="text-sm text-gray-600">{config.description}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )

    const renderDynamicFields = () => {
        if (!state.selectedExtractType) return null

        const config = getTypeConfig(state.selectedExtractType)

        return (
            <div className="space-y-4">
                <div className="flex items-center space-x-2">
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: config.color }}
                    />
                    <span className="text-lg font-semibold">{config.label}</span>
                    <Badge variant="outline">{config.icon}</Badge>
                </div>

                {/* Campo titolo obbligatorio */}
                <div>
                    <Label htmlFor="title">Titolo *</Label>
                    <Input
                        id="title"
                        value={state.classificationData.title || ''}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder={`Inserisci il titolo per ${config.label.toLowerCase()}`}
                        className="mt-1"
                    />
                </div>

                {/* Campo descrizione */}
                <div>
                    <Label htmlFor="description">Descrizione</Label>
                    <Input
                        id="description"
                        value={state.classificationData.description || ''}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Breve descrizione dell'estratto"
                        className="mt-1"
                    />
                </div>

                {/* Campi gerarchici dinamici */}
                {state.selectedExtractType === 'motivazione' && (
                    <div>
                        <Label htmlFor="parentReato">Reato di Riferimento *</Label>
                        <select
                            id="parentReato"
                            value={state.classificationData.parentReatoId || ''}
                            onChange={(e) => handleInputChange('parentReatoId', e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="">Seleziona un reato...</option>
                            {state.availableReati.map(reato => (
                                <option key={reato.id} value={reato.id}>
                                    {reato.title}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {state.selectedExtractType === 'contromotivazione' && (
                    <div>
                        <Label htmlFor="parentMotivazione">Motivazione di Riferimento *</Label>
                        <select
                            id="parentMotivazione"
                            value={state.classificationData.parentMotivazioneId || ''}
                            onChange={(e) => handleInputChange('parentMotivazioneId', e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="">Seleziona una motivazione...</option>
                            {state.availableMotivazioni.map(motivazione => (
                                <option key={motivazione.id} value={motivazione.id}>
                                    {motivazione.title}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Note editabili */}
                <div className="space-y-3">
                    <Label className="text-base font-medium">Note Analitiche</Label>

                    <div>
                        <Label htmlFor="notesAnalyst" className="text-sm">Note Analista</Label>
                        <textarea
                            id="notesAnalyst"
                            value={state.classificationData.notesAnalyst || ''}
                            onChange={(e) => handleInputChange('notesAnalyst', e.target.value)}
                            placeholder="Note personali dell'analista..."
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md h-20"
                        />
                    </div>

                    <div>
                        <Label htmlFor="notesStrategy" className="text-sm">Commenti Strategici</Label>
                        <textarea
                            id="notesStrategy"
                            value={state.classificationData.notesStrategy || ''}
                            onChange={(e) => handleInputChange('notesStrategy', e.target.value)}
                            placeholder="Osservazioni strategiche per la difesa..."
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md h-20"
                        />
                    </div>

                    <div>
                        <Label htmlFor="notesDefense" className="text-sm">Osservazioni Difesa</Label>
                        <textarea
                            id="notesDefense"
                            value={state.classificationData.notesDefense || ''}
                            onChange={(e) => handleInputChange('notesDefense', e.target.value)}
                            placeholder="Elementi chiave per la strategia difensiva..."
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md h-20"
                        />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <span>🔍</span>
                        <span>Classificazione Estratto</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Contenuto estratto */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <Label className="text-sm font-medium text-gray-600">Contenuto Estratto</Label>
                        <div className="mt-2 text-sm text-gray-800 max-h-32 overflow-y-auto">
                            {extractContent}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                            Fonte: {sourceDoc.title} - Pagina {sourceDoc.page}
                        </div>
                    </div>

                    {/* Selezione tipo */}
                    {renderTypeSelector()}

                    {/* Campi dinamici */}
                    {renderDynamicFields()}

                    {/* Errore */}
                    {state.error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                            {state.error}
                        </div>
                    )}

                    {/* Azioni */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                        <Button variant="outline" onClick={onCancel}>
                            Annulla
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={state.isSubmitting || !state.selectedExtractType}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {state.isSubmitting ? 'Salvataggio...' : 'Salva Estratto'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
