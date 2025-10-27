import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Estratto } from '@/types'
import { ExtractType, ExtractClassificationData, DefenseMemoryState } from '../types'

interface UseExtractClassificationProps {
    praticaId: string
}

export const useExtractClassification = ({ praticaId }: UseExtractClassificationProps) => {
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

    const [estratti, setEstratti] = useState<Estratto[]>([])

    // Carica estratti esistenti
    const loadExtracts = useCallback(async () => {
        try {
            const response = await api.getEstrattiByPratica(praticaId)
            const estrattiData = response.estratti
            setEstratti(estrattiData)

            // Organizza per tipo
            const reati = estrattiData
                .filter(e => e.type === 'reato')
                .map(e => ({ id: e.id, title: e.title || e.content.slice(0, 50) + '...' }))

            const motivazioni = estrattiData
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
            console.error('Errore nel caricamento estratti:', error)
            setState(prev => ({ ...prev, error: 'Errore nel caricamento degli estratti' }))
        }
    }, [praticaId])

    // Carica dati iniziali
    useEffect(() => {
        loadExtracts()
    }, [loadExtracts])

    // Seleziona tipo di estratto
    const selectExtractType = useCallback((type: ExtractType) => {
        setState(prev => ({
            ...prev,
            selectedExtractType: type,
            classificationData: {
                ...prev.classificationData,
                type,
                parentReatoId: undefined,
                parentMotivazioneId: undefined
            },
            error: null
        }))
    }, [])

    // Aggiorna dati di classificazione
    const updateClassificationData = useCallback((field: keyof ExtractClassificationData, value: any) => {
        setState(prev => ({
            ...prev,
            classificationData: {
                ...prev.classificationData,
                [field]: value
            },
            error: null
        }))
    }, [])

    // Valida dati di classificazione
    const validateClassification = useCallback((): string | null => {
        if (!state.selectedExtractType) {
            return 'Seleziona un tipo di estratto'
        }

        if (!state.classificationData.title?.trim()) {
            return 'Il titolo è obbligatorio'
        }

        if (state.selectedExtractType === 'motivazione' && !state.classificationData.parentReatoId) {
            return 'Seleziona un reato per la motivazione'
        }

        if (state.selectedExtractType === 'contromotivazione' && !state.classificationData.parentMotivazioneId) {
            return 'Seleziona una motivazione per la contro-motivazione'
        }

        return null
    }, [state.selectedExtractType, state.classificationData])

    // Salva estratto
    const saveExtract = useCallback(async (extractData: {
        content: string
        sourceDoc: {
            id: string
            title: string
            page: number
            bbox?: { x: number; y: number; width: number; height: number }
        }
    }): Promise<Estratto> => {
        const validationError = validateClassification()
        if (validationError) {
            setState(prev => ({ ...prev, error: validationError }))
            throw new Error(validationError)
        }

        setState(prev => ({ ...prev, isSubmitting: true, error: null }))

        try {
            const estrattoData = {
                praticaId,
                sourceDoc: extractData.sourceDoc.id,
                sourceDocTitle: extractData.sourceDoc.title,
                page: extractData.sourceDoc.page,
                start: 0, // TODO: calcolare dalla selezione
                end: extractData.content.length,
                type: state.selectedExtractType!,
                parentReatoId: state.classificationData.parentReatoId,
                parentMotivazioneId: state.classificationData.parentMotivazioneId,
                title: state.classificationData.title!,
                content: extractData.content,
                bbox: extractData.sourceDoc.bbox,
                extractDate: state.classificationData.extractDate,
                notesAnalyst: state.classificationData.notesAnalyst,
                notesDescription: state.classificationData.description,
                notesStrategy: state.classificationData.notesStrategy,
                notesDefense: state.classificationData.notesDefense,
                analystId: 'current-user' // TODO: ottenere dal contesto utente
            }

            const newEstratto = await api.createEstratto(estrattoData)

            // Aggiorna lista locale
            setEstratti(prev => [newEstratto, ...prev])

            // Ricarica dati per aggiornare le opzioni gerarchiche
            await loadExtracts()

            setState(prev => ({ ...prev, isSubmitting: false }))
            return newEstratto
        } catch (error) {
            console.error('Errore nel salvataggio estratto:', error)
            setState(prev => ({
                ...prev,
                error: 'Errore nel salvataggio dell\'estratto',
                isSubmitting: false
            }))
            throw error
        }
    }, [praticaId, state.selectedExtractType, state.classificationData, validateClassification, loadExtracts])

    // Reset form
    const resetForm = useCallback(() => {
        setState(prev => ({
            ...prev,
            selectedExtractType: null,
            classificationData: {
                title: '',
                description: '',
                extractDate: new Date()
            },
            error: null,
            isSubmitting: false
        }))
    }, [])

    // Ottieni gerarchia estratti
    const getExtractHierarchy = useCallback(() => {
        const reati = estratti.filter(e => e.type === 'reato')
        const motivazioni = estratti.filter(e => e.type === 'motivazione')
        const contromotivazioni = estratti.filter(e => e.type === 'contromotivazione')

        return {
            reati: reati.map(reato => ({
                ...reato,
                motivazioni: motivazioni.filter(m => m.parentReatoId === reato.id).map(motivazione => ({
                    ...motivazione,
                    contromotivazioni: contromotivazioni.filter(c => c.parentMotivazioneId === motivazione.id)
                }))
            }))
        }
    }, [estratti])

    return {
        state,
        estratti,
        selectExtractType,
        updateClassificationData,
        saveExtract,
        resetForm,
        loadExtracts,
        getExtractHierarchy,
        validateClassification
    }
}
