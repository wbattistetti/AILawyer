import { useState, useCallback, useRef, useEffect } from 'react'

export interface ColumnWidths {
    number: number
    typeDescription: number
    observations: number
}

// Calcola la larghezza minima necessaria per gli elementi più lunghi delle combo
const calculateMinWidthForCombos = (): number => {
    // Elementi più lunghi da considerare:
    // - "Reato contestato" (tipo select)
    // - Elementi da REATI_PENALI (verranno caricati dinamicamente)
    // - "atto di disapplicazione sostanziale, formale e procedurale" (più lungo di ATTI_COMUNI)

    // Stima approssimativa basata su caratteri
    // Font size: text-xs (12px)
    // Carattere medio: ~7px
    // Padding: 16px (px-2 = 8px * 2)
    // Gap tra elementi: 8px (gap-2)
    // Select trigger min-width: 140px

    const longestText = 'atto di disapplicazione sostanziale, formale e procedurale'
    const typeSelectLabel = 'Reato contestato'

    // Calcola larghezza testo (approssimativa)
    const textWidth = longestText.length * 7 // ~7px per carattere
    const typeLabelWidth = typeSelectLabel.length * 7

    // Larghezza minima: Select (140px) + gap (8px) + combobox più lunga + padding cella (16px) + margine sicurezza (20px)
    const minWidth = Math.max(
        140 + 8 + textWidth + 40 + 16 + 20, // Select + gap + combobox + padding + sicurezza
        140 + 8 + typeLabelWidth + 16 + 20   // Select + gap + label tipo + padding + sicurezza
    )

    return Math.ceil(minWidth)
}

const MIN_TYPE_DESCRIPTION_WIDTH = calculateMinWidthForCombos()

const DEFAULT_WIDTHS: ColumnWidths = {
    number: 40,
    typeDescription: Math.max(450, MIN_TYPE_DESCRIPTION_WIDTH), // Assicura che sia almeno il minimo
    observations: 400
}

export function useResizableColumns() {
    const [widths, setWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS)
    const resizingRef = useRef<{ column: keyof ColumnWidths; startX: number; startWidth: number } | null>(null)

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

            // Calcola minimo width in base alla colonna
            let minWidth: number
            if (currentColumn === 'number') {
                minWidth = 30
            } else if (currentColumn === 'typeDescription') {
                // Per typeDescription, permette la riduzione ma con un minimo ragionevole (250px)
                minWidth = 250
            } else { // For 'observations'
                minWidth = 200
            }

            // Per tutte le colonne, permette riduzione fino al minimo
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
        isResizing: resizingRef.current !== null
    }
}

