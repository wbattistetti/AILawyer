import { useState, useCallback } from 'react'
import { useToast } from '../../../../hooks/use-toast'
import { api } from '../../../../lib/api'
import { Pratica, Comparto } from '../../../../types'

export interface UseErrorHandlingReturn {
    isLoading: boolean
    setIsLoading: (loading: boolean) => void
    loadPraticaData: (id: string) => Promise<void>
    handleRefresh: (id: string) => Promise<void>
    showError: (title: string, description: string) => void
    showSuccess: (title: string, description?: string) => void
}

export function useErrorHandling(): UseErrorHandlingReturn {
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(true)

    const showError = useCallback((title: string, description: string) => {
        toast({ title, description, variant: 'destructive' })
    }, [toast])

    const showSuccess = useCallback((title: string, description?: string) => {
        toast({ title, description })
    }, [toast])

    const loadPraticaData = useCallback(async (id: string) => {
        try {
            setIsLoading(true)
            const [pratica, comparti] = await Promise.all([
                api.getPratica(id),
                api.getComparti(id)
            ])
            return { pratica, comparti }
        } catch (error) {
            console.error('Failed to load pratica:', error)
            showError('Errore', 'Impossibile caricare la pratica')
            throw error
        } finally {
            setIsLoading(false)
        }
    }, [showError])

    const handleRefresh = useCallback(async (id: string) => {
        try {
            const [pratica, comparti] = await Promise.all([
                api.getPratica(id),
                api.getComparti(id)
            ])
            showSuccess('Pratica aggiornata')
            return { pratica, comparti }
        } catch (error) {
            console.error('Failed to refresh pratica:', error)
            showError('Errore', 'Impossibile aggiornare la pratica')
            throw error
        }
    }, [showSuccess, showError])

    return {
        isLoading,
        setIsLoading,
        loadPraticaData,
        handleRefresh,
        showError,
        showSuccess
    }
}

