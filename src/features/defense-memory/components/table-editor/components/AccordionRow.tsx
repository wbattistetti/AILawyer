import React, { useState } from 'react'
import { TableRowProps } from '../../types/table.types'
import { TypeDescriptionCell } from './TypeDescriptionCell'
import { ObservationsCell } from './ObservationsCell'
import { RowActions } from './RowActions'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Scale, FileText, AlertCircle } from 'lucide-react'

const DEFAULT_WIDTHS = {
    number: 40,
    typeDescription: 450,
    observations: 400
}

export const AccordionRow: React.FC<TableRowProps> = ({
    row,
    order,
    onUpdate,
    onDelete,
    onMoveUp,
    onMoveDown,
    readOnly = false,
    errors = [],
    columnWidths = DEFAULT_WIDTHS,
    onMoveMotivation
}) => {
    const [isExpanded, setIsExpanded] = useState(false)
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

    // ✅ Configurazione colore e icona basata sul tipo
    const getTypeConfig = () => {
        switch (row.cellType) {
            case 'reato-contestato':
                return {
                    bgColor: 'bg-red-50',
                    borderColor: 'border-red-200',
                    textColor: 'text-red-900',
                    icon: Scale,
                    typeLabel: 'Reato contestato'
                }
            case 'atto':
                return {
                    bgColor: 'bg-blue-50',
                    borderColor: 'border-blue-200',
                    textColor: 'text-blue-900',
                    icon: FileText,
                    typeLabel: 'Atto'
                }
            case 'fatto':
                return {
                    bgColor: 'bg-amber-50',
                    borderColor: 'border-amber-200',
                    textColor: 'text-amber-900',
                    icon: AlertCircle,
                    typeLabel: 'Fatto'
                }
            default:
                return {
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-200',
                    textColor: 'text-gray-900',
                    icon: FileText,
                    typeLabel: 'Voce'
                }
        }
    }

    const typeConfig = getTypeConfig()
    const IconComponent = typeConfig.icon

    // Genera il titolo completo per l'header
    const getHeaderTitle = (): string => {
        if (row.description?.trim()) {
            return row.description
        }
        return `${typeConfig.typeLabel} (senza descrizione)`
    }

    return (
        <div
            className={cn(
                "border-b transition-colors",
                hasErrors && "bg-red-50 border-red-200",
                !hasErrors && typeConfig.borderColor,
                readOnly && "bg-gray-50",
                isExpanded && "bg-white"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* ✅ Header accordion - sempre visibile con colore pastello */}
            <div
                className={cn(
                    "flex items-center px-3 py-3 cursor-pointer transition-colors border-l-4",
                    typeConfig.bgColor,
                    !hasErrors && typeConfig.borderColor,
                    hasErrors && "bg-red-50 border-l-red-400",
                    isExpanded && "shadow-sm"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Numero d'ordine */}
                <div className={cn("flex-shrink-0 w-8 text-center text-sm font-semibold", typeConfig.textColor)}>
                    {order}.
                </div>

                {/* Icona tipo */}
                <div className={cn("flex-shrink-0 mr-2", typeConfig.textColor)}>
                    <IconComponent className="h-4 w-4" />
                </div>

                {/* Icona expand/collapse */}
                <div className="flex-shrink-0 mr-2 text-gray-400">
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </div>

                {/* Titolo formato: "Tipo - Descrizione" */}
                <div className="flex-1 min-w-0">
                    <div className={cn("text-sm font-medium truncate", typeConfig.textColor)}>
                        <span className="font-semibold">{typeConfig.typeLabel}</span>
                        {row.description?.trim() && (
                            <span className="ml-2 font-normal">- {row.description}</span>
                        )}
                    </div>
                    {row.contestationDate && (
                        <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(row.contestationDate).toLocaleDateString('it-IT')}
                        </div>
                    )}
                </div>

                {/* Pulsanti Azioni - visibili su hover o quando expanded */}
                {(isHovered || isExpanded) && !readOnly && (
                    <div className="flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
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

                {/* Indicatore errori */}
                {hasErrors && (
                    <div className="flex-shrink-0 ml-2 text-red-500" title={errors.map(e => e.message).join(', ')}>
                        <span className="text-xs">⚠️</span>
                    </div>
                )}
            </div>

            {/* ✅ Contenuto accordion - visibile solo quando expanded con animazione */}
            <div
                className={cn(
                    "overflow-hidden transition-all duration-200 ease-in-out",
                    isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
                )}
            >
                <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex gap-4 w-full">
                        {/* Cella sinistra - Tipo e Descrizione - AUTO-SIZE */}
                        <div className="flex-shrink-0 w-auto relative">
                            {/* ✅ Handle di resize sulla linea verticale destra */}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-10 transition-all"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    // Qui puoi aggiungere la logica di resize se vuoi
                                }}
                                style={{
                                    marginRight: '-2px'
                                }}
                                title="Trascina per ridimensionare"
                            />
                            <div className="space-y-3 pr-2">
                                <div className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">Dettagli</div>
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
                        </div>

                        {/* Cella destra - Osservazioni e Motivazioni - RIEMPIE SPAZIO RIMANENTE */}
                        <div className="flex-1 min-w-0">
                            <div className="space-y-3">
                                <div className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">Osservazioni e Motivazioni</div>
                                <ObservationsCell
                                    row={row}
                                    onUpdate={handleUpdate}
                                    readOnly={readOnly}
                                    errors={errors}
                                    onMoveMotivation={onMoveMotivation}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
