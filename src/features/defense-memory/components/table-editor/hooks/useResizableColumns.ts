import { useState, useCallback, useRef, useEffect } from 'react'

export interface ColumnWidths {
    number: number
    typeDescription: number
    observations: number
    actions: number
}

const DEFAULT_WIDTHS: ColumnWidths = {
    number: 60,
    typeDescription: 450, // Larghezza maggiore per ospitare due combobox affiancate
    observations: 400,
    actions: 80
}

export function useResizableColumns() {
    const [widths, setWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS)
    const resizingRef = useRef<{ column: keyof ColumnWidths; startX: number; startWidth: number } | null>(null)
    const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const resizeObserverRef = useRef<ResizeObserver | null>(null)
    const cellWidths = useRef<Map<string, number>>(new Map())

    // Registra la larghezza misurata da una cella
    const registerCellWidth = useCallback((width: number) => {
        console.log('🔵 [useResizableColumns] registerCellWidth chiamato con width:', width)

        // Limita la larghezza massima per evitare loop infiniti
        const MAX_WIDTH = 1000 // Larghezza massima ragionevole
        const clampedWidth = Math.min(width, MAX_WIDTH)

        // Usa un ref per evitare dipendenze cicliche
        setWidths(prev => {
            // Controlla se la nuova larghezza è significativamente maggiore della corrente
            // Solo aggiorna se la differenza è > 10px per evitare loop infiniti
            if (clampedWidth > prev.typeDescription + 10 && clampedWidth <= MAX_WIDTH) {
                console.log('🔵 [useResizableColumns] Aggiornando da', prev.typeDescription, 'a', clampedWidth)
                return {
                    ...prev,
                    typeDescription: clampedWidth
                }
            }
            console.log('🔵 [useResizableColumns] Nessun aggiornamento necessario (diff:', clampedWidth - prev.typeDescription, 'px, clamped:', width, '->', clampedWidth, ')')
            return prev
        })
    }, [])

    // Funzione per calcolare la larghezza massima
    const calculateMaxWidth = useCallback(() => {
        let maxWidth = DEFAULT_WIDTHS.typeDescription

        // Prendi il massimo tra le larghezze misurate dalle celle
        cellWidths.current.forEach((cellWidth) => {
            if (cellWidth > maxWidth) {
                maxWidth = cellWidth
            }
        })

        // Oppure usa scrollWidth come fallback
        columnRefs.current.forEach((element) => {
            const scrollWidth = element.scrollWidth
            if (scrollWidth > maxWidth) {
                maxWidth = scrollWidth + 20
            }
        })

        // Aggiorna solo se la larghezza calcolata è maggiore della corrente
        setWidths(prev => {
            if (maxWidth > prev.typeDescription) {
                return {
                    ...prev,
                    typeDescription: maxWidth
                }
            }
            return prev
        })
    }, [])

    // Funzione per registrare un ref di una cella
    const registerCellRef = useCallback((rowId: string, element: HTMLDivElement | null) => {
        if (element) {
            columnRefs.current.set(rowId, element)

            // Crea ResizeObserver se non esiste
            if (!resizeObserverRef.current) {
                resizeObserverRef.current = new ResizeObserver(() => {
                    calculateMaxWidth()
                })
            }

            // Osserva la cella per cambiamenti di dimensioni
            resizeObserverRef.current.observe(element)
        } else {
            const oldElement = columnRefs.current.get(rowId)
            if (oldElement && resizeObserverRef.current) {
                resizeObserverRef.current.unobserve(oldElement)
            }
            columnRefs.current.delete(rowId)
        }
    }, [calculateMaxWidth])

    // Calcola la larghezza iniziale dopo il mount
    useEffect(() => {
        // Delay per permettere al DOM di renderizzare
        const timeoutId = setTimeout(() => {
            calculateMaxWidth()
        }, 100)

        return () => clearTimeout(timeoutId)
    }, [calculateMaxWidth])

    // Cleanup ResizeObserver
    useEffect(() => {
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect()
            }
        }
    }, [])

    const handleResizeStart = useCallback((column: keyof ColumnWidths, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const startWidth = widths[column]
        resizingRef.current = {
            column,
            startX: e.clientX,
            startWidth
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!resizingRef.current) return

            const { column: currentColumn, startX, startWidth: startW } = resizingRef.current
            const delta = moveEvent.clientX - startX
            const minWidth = currentColumn === 'number' ? 50 : currentColumn === 'actions' ? 60 : 200
            const newWidth = Math.max(minWidth, startW + delta)

            setWidths(prev => ({
                ...prev,
                [currentColumn]: newWidth
            }))
        }

        const handleMouseUp = () => {
            resizingRef.current = null
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [widths])

    return {
        widths,
        handleResizeStart,
        isResizing: resizingRef.current !== null,
        registerCellRef,
        registerCellWidth
    }
}

