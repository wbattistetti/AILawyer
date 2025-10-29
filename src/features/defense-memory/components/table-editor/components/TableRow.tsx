import React from 'react'
import { TableRowProps } from '../../types/table.types'
import { RowNumberCell } from './RowNumberCell'
import { TypeDescriptionCell } from './TypeDescriptionCell'
import { ObservationsCell } from './ObservationsCell'
import { RowActions } from './RowActions'
import { cn } from '@/lib/utils'

export const TableRow: React.FC<TableRowProps> = ({
    row,
    order,
    onUpdate,
    onDelete,
    onMoveUp,
    onMoveDown,
    readOnly = false,
    errors = []
}) => {
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
        <div className={cn(
            "grid grid-cols-12 border-b border-gray-200 hover:bg-gray-50 transition-colors",
            hasErrors && "bg-red-50 border-red-200",
            readOnly && "bg-gray-50"
        )}>
            {/* Numero d'ordine */}
            <div className="col-span-1">
                <RowNumberCell order={order} />
            </div>

            {/* Tipo e Descrizione - Editabile in-place */}
            <div className="col-span-5">
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

            {/* Osservazioni - Editabile in-place */}
            <div className="col-span-5">
                <ObservationsCell
                    row={row}
                    onUpdate={handleUpdate}
                    readOnly={readOnly}
                    errors={errors}
                />
            </div>

            {/* Azioni */}
            <div className="col-span-1">
                <RowActions
                    onDelete={handleDelete}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                    canMoveUp={onMoveUp ? true : false}
                    canMoveDown={onMoveDown ? true : false}
                    readOnly={readOnly}
                />
            </div>
        </div>
    )
}
