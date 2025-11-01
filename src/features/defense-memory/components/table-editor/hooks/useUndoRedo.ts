import { useState, useCallback, useRef, useEffect } from 'react'
import { DefenseMemoryTableData } from '../types/table.types'

interface UseUndoRedoProps {
    tableData: DefenseMemoryTableData
    onStateChange: (data: DefenseMemoryTableData) => void
    maxHistorySize?: number
}

export const useUndoRedo = ({ tableData, onStateChange, maxHistorySize = 50 }: UseUndoRedoProps) => {
    const [history, setHistory] = useState<DefenseMemoryTableData[]>(() => [tableData])
    const [historyIndex, setHistoryIndex] = useState(0)
    const isUndoRedoRef = useRef(false)
    const lastStateRef = useRef<string>(JSON.stringify(tableData))
    const historyIndexRef = useRef(0)

    // Sincronizza ref con state
    useEffect(() => {
        historyIndexRef.current = historyIndex
    }, [historyIndex])

    // Quando cambia tableData esternamente (non da undo/redo), aggiungi alla history
    useEffect(() => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false
            lastStateRef.current = JSON.stringify(tableData)
            return
        }

        // Confronta con lo stato precedente per evitare duplicati
        const currentState = JSON.stringify(tableData)

        if (currentState === lastStateRef.current) {
            return // Nessun cambiamento reale
        }

        lastStateRef.current = currentState

        // Usa il setState con funzione per evitare dependency issues
        setHistory(prevHistory => {
            const currentIndex = historyIndexRef.current
            // Rimuovi tutti gli stati futuri se siamo nel mezzo della history
            const newHistory = prevHistory.slice(0, currentIndex + 1)

            // Aggiungi il nuovo stato
            const updatedHistory = [...newHistory, tableData]

            // Limita la dimensione della history
            const trimmedHistory = updatedHistory.slice(-maxHistorySize)

            setHistoryIndex(trimmedHistory.length - 1)
            return trimmedHistory
        })
    }, [tableData, maxHistorySize])

    const canUndo = historyIndex > 0
    const canRedo = historyIndex < history.length - 1

    const undo = useCallback(() => {
        if (!canUndo) return

        const newIndex = historyIndex - 1
        const previousState = history[newIndex]

        // Evita loop evitando che il cambiamento triggeri l'aggiunta alla history
        isUndoRedoRef.current = true
        setHistoryIndex(newIndex)
        onStateChange(previousState)
    }, [historyIndex, history, canUndo, onStateChange])

    const redo = useCallback(() => {
        if (!canRedo) return

        const newIndex = historyIndex + 1
        const nextState = history[newIndex]

        // Evita loop evitando che il cambiamento triggeri l'aggiunta alla history
        isUndoRedoRef.current = true
        setHistoryIndex(newIndex)
        onStateChange(nextState)
    }, [historyIndex, history, canRedo, onStateChange])

    // Gestione shortcut da tastiera (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignora se siamo in un input o textarea (per non interferire con editing testo)
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                // Solo se non è un campo editabile nella tabella (combobox, textarea)
                const isEditableField = target.closest('.flex-1') || target.closest('[role="combobox"]')
                if (isEditableField && target.isContentEditable !== true) {
                    return // Lascia gestire i normali shortcut di editing
                }
            }

            // Ctrl+Z o Cmd+Z per undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                undo()
            }
            // Ctrl+Y o Ctrl+Shift+Z per redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault()
                redo()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo])

    return {
        undo,
        redo,
        canUndo,
        canRedo
    }
}

