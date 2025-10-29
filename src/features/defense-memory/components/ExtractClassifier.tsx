import React, { useState, useEffect, useCallback } from 'react'
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
    console.log('🎬🎬🎬 [ExtractClassifier] COMPONENTE MONTATO! 🎬🎬🎬')
    console.log('🎬 [ExtractClassifier] praticaId:', praticaId)
    console.log('🎬 [ExtractClassifier] extractContent length:', extractContent?.length)

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

    // Carica dati iniziali - RICARICA SEMPRE quando il componente viene montato
    useEffect(() => {
        console.log('🔄🔄🔄 [ExtractClassifier] USEEFFECT TRIGGER! CARICAMENTO ESTRATTI... 🔄🔄🔄')
        loadExistingExtracts()
    }, []) // ✅ RIMOSSO praticaId dalla dipendenza per ricaricare sempre

    // Ascolta eventi per aggiornamenti real-time
    useEffect(() => {
        const handleExtractUpdate = () => {
            loadExistingExtracts()
        }

        window.addEventListener('app:extract-added', handleExtractUpdate)
        window.addEventListener('app:extract-updated', handleExtractUpdate)

        return () => {
            window.removeEventListener('app:extract-added', handleExtractUpdate)
            window.removeEventListener('app:extract-updated', handleExtractUpdate)
        }
    }, [])

    const loadExistingExtracts = useCallback(async () => {
        try {
            console.log('🔍 [ExtractClassifier] Caricamento estratti per pratica:', praticaId)

            // Carica da memoria globale (estratti temporanei + mock)
            const pendingExtracts = (window as any).__pendingExtracts as Array<any> || []
            console.log('📝 [ExtractClassifier] Estratti in memoria:', pendingExtracts.length)

            // Carica da database (estratti persistenti) - per ora vuoto
            const { api } = await import('@/lib/api')
            const response = await api.getEstrattiByPratica(praticaId)
            const dbExtracts = response.estratti
            console.log('💾 [ExtractClassifier] Estratti da database:', dbExtracts.length)

            // Combina estratti temporanei e persistenti
            const allExtracts = [...pendingExtracts, ...dbExtracts]
            console.log('🔄 [ExtractClassifier] Totale estratti:', allExtracts.length)

            // Organizza per tipo
            const reati = allExtracts
                .filter(e => e.type === 'reato')
                .map(e => ({
                    id: e.id,
                    title: e.title || e.content?.slice(0, 50) + '...' || 'Reato senza titolo'
                }))
            console.log('⚖️ [ExtractClassifier] Reati trovati:', reati.length, reati)

            const motivazioni = allExtracts
                .filter(e => e.type === 'motivazione')
                .map(e => ({
                    id: e.id,
                    title: e.title || e.content?.slice(0, 50) + '...' || 'Motivazione senza titolo',
                    parentReatoId: e.parentReatoId!
                }))
            console.log('🎯 [ExtractClassifier] Motivazioni trovate:', motivazioni.length)

            setState(prev => ({
                ...prev,
                availableReati: reati,
                availableMotivazioni: motivazioni
            }))

            console.log('✅ [ExtractClassifier] Stato aggiornato - Reati:', reati.length, 'Motivazioni:', motivazioni.length)
        } catch (error) {
            console.error('❌ [ExtractClassifier] Errore nel caricamento estratti:', error)
            setState(prev => ({ ...prev, error: 'Errore nel caricamento degli estratti' }))
        }
    }, [praticaId]) // ✅ Dipendenze del useCallback

    const handleTypeSelect = (type: ExtractType) => {
        console.log('🎯 [ExtractClassifier] Tipo selezionato:', type, 'Reati disponibili:', state.availableReati.length)

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
            console.log('💾 [ExtractClassifier] Inizio salvataggio estratto...')
            console.log('💾 [ExtractClassifier] Tipo estratto:', state.selectedExtractType)
            console.log('💾 [ExtractClassifier] Dati classificazione:', state.classificationData)

            // Genera ID temporaneo
            const tempId = `tmp:${state.selectedExtractType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            console.log('🆔 [ExtractClassifier] ID temporaneo generato:', tempId)

            // Crea estratto temporaneo in memoria
            const tempEstratto = {
                id: tempId,
                praticaId,
                sourceDocId: sourceDoc.id,
                sourceDocTitle: sourceDoc.title,
                page: sourceDoc.page,
                start: 0,
                end: extractContent.length,
                type: state.selectedExtractType,
                parentReatoId: state.classificationData.parentReatoId,
                parentMotivazioneId: state.classificationData.parentMotivazioneId,
                title: state.classificationData.title,
                content: extractContent,
                bbox: sourceDoc.bbox,
                extractDate: state.classificationData.extractDate,
                notesAnalyst: state.classificationData.notesAnalyst,
                notesDescription: state.classificationData.description,
                notesStrategy: state.classificationData.notesStrategy,
                notesDefense: state.classificationData.notesDefense,
                analystId: 'current-user',
                createdAt: new Date(),
                updatedAt: new Date(),
                // Metadati per compatibilità con sistema esistente
                meta: {
                    title: state.classificationData.title,
                    text: extractContent,
                    content: extractContent,
                    source: {
                        docId: sourceDoc.id,
                        title: sourceDoc.title,
                        page: sourceDoc.page,
                        bbox: sourceDoc.bbox
                    },
                    kind: 'EXTRACT'
                }
            }
            console.log('📝 [ExtractClassifier] Estratto temporaneo creato:', tempEstratto)

            // Aggiungi alla memoria globale
            const pendingExtracts = (window as any).__pendingExtracts as Array<any> || []
            console.log('📝 [ExtractClassifier] Estratti esistenti in memoria:', pendingExtracts.length)
                ; (window as any).__pendingExtracts = [tempEstratto, ...pendingExtracts]
            console.log('📝 [ExtractClassifier] Estratti aggiornati in memoria:', (window as any).__pendingExtracts.length)

            // Emetti evento per aggiornare altri componenti
            window.dispatchEvent(new CustomEvent('app:extract-added', {
                detail: { estratto: tempEstratto }
            }))
            console.log('📡 [ExtractClassifier] Evento app:extract-added emesso')

            // Aggiorna lista locale immediatamente
            await loadExistingExtracts()

            // Chiama callback di successo
            onSuccess(tempEstratto as any)
            console.log('✅ [ExtractClassifier] Salvataggio completato con successo')

            setState(prev => ({ ...prev, isSubmitting: false }))
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
                        {console.log('🎨 [RENDER] Dropdown Reati - availableReati:', state.availableReati)}
                        {console.log('🎨 [RENDER] Dropdown Reati - Numero reati:', state.availableReati.length)}
                        <select
                            id="parentReato"
                            value={state.classificationData.parentReatoId || ''}
                            onChange={(e) => handleInputChange('parentReatoId', e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="">Seleziona un reato... ({state.availableReati.length} disponibili)</option>
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
