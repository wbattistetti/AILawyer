import React, { useRef, useEffect, useState } from 'react'
import { TableRowProps } from '../../types/table.types'
import { RowNumberCell } from './RowNumberCell'
import { TypeDescriptionCell } from './TypeDescriptionCell'
import { ObservationsCell } from './ObservationsCell'
import { RowActions } from './RowActions'
import { cn } from '@/lib/utils'

const DEFAULT_WIDTHS = {
    number: 40,
    typeDescription: 450,
    observations: 400
}

export const TableRow: React.FC<TableRowProps> = ({
    row,
    order,
    onUpdate,
    onDelete,
    onMoveUp,
    onMoveDown,
    readOnly = false,
    errors = [],
    columnWidths = DEFAULT_WIDTHS,
    onMoveMotivation,
    onResizeStart // ✅ Funzione per resize colonne
}) => {
    const cellRef = useRef<HTMLDivElement>(null)
    const [isHovered, setIsHovered] = useState(false)

    const handleUpdate = (data: Partial<{ cellType: any; description: string; contestationDate?: string; eventDate?: string; observations?: string; extract?: any }>) => {
        onUpdate(row.id, data)
    }

    const handleDelete = () => {
        if (window.confirm('Sei sicuro di voler eliminare questa riga?')) {
            onDelete(row.id)
        }
    }

    const hasErrors = errors.length > 0

    return (
        <div
            className={cn(
                "flex border-b border-gray-200 hover:bg-gray-50 transition-colors relative w-full",
                hasErrors && "bg-red-50 border-red-200",
                readOnly && "bg-gray-50"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Numero d'ordine */}
            <div
                className="flex-shrink-0 px-2"
                style={{ width: columnWidths.number }}
            >
                <RowNumberCell order={order} />
            </div>

            {/* Tipo e Descrizione - Editabile in-place - con handle di resize - larghezza fissa ma ridimensionabile */}
            <div
                ref={cellRef}
                className="border-r border-gray-300 flex-shrink-0 relative"
                style={{ width: columnWidths.typeDescription, minWidth: '300px', flex: `0 0 ${columnWidths.typeDescription}px` }}
            >
                {/* ✅ Handle di resize sulla linea verticale destra - sempre visibile e trascinabile */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-10 transition-all"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (onResizeStart) {
                            onResizeStart('typeDescription', e)
                        }
                    }}
                    style={{
                        marginRight: '-1px'
                    }}
                    title="Trascina per ridimensionare"
                />
                <TypeDescriptionCell
                    cellType={row.cellType}
                    description={row.description}
                    contestationDate={row.contestationDate}
                    eventDate={row.eventDate}
                    errors={errors}
                    onUpdate={handleUpdate}
                    readOnly={readOnly}
                />
            </div>

            {/* Osservazioni - Editabile in-place - con flex per riempire spazio rimanente */}
            <div
                className="flex-1 relative min-w-0"
                style={{ minWidth: columnWidths.observations }}
            >
                {/* Pulsante Azioni - appare solo su hover, posizionato in alto a destra */}
                {isHovered && !readOnly && (
                    <div className="absolute top-2 right-2 z-50">
                        <RowActions
                            onDelete={handleDelete}
                            onMoveUp={onMoveUp}
                            onMoveDown={onMoveDown}
                            canMoveUp={onMoveUp ? true : false}
                            canMoveDown={onMoveDown ? true : false}
                            readOnly={readOnly}
                        />
                    </div>
                )}

                <ObservationsCell
                    row={row}
                    onUpdate={handleUpdate}
                    readOnly={readOnly}
                    errors={errors}
                    onMoveMotivation={onMoveMotivation}
                />
            </div>
        </div>
    )
}
