import React, { useState } from 'react'
import { CellType, ValidationError } from '../../types/table.types'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox } from './Combobox'
import { REATI_PENALI } from '../utils/reatoSuggestions'
import { getDrawerOptionsSorted } from '@/features/drawers/drawerRegistry'
import { cn } from '@/lib/utils'
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface TypeDescriptionCellProps {
    cellType: CellType
    description: string
    contestationDate?: string
    eventDate?: string
    errors?: ValidationError[]
    onUpdate: (data: Partial<{ cellType: CellType; description: string; contestationDate?: string; eventDate?: string }>) => void
    readOnly?: boolean
    className?: string
}

export const TypeDescriptionCell: React.FC<TypeDescriptionCellProps> = ({
    cellType,
    description,
    contestationDate,
    eventDate,
    errors = [],
    onUpdate,
    readOnly = false,
    className = ''
}) => {
    const [contestationDateOpen, setContestationDateOpen] = useState(false)
    const [eventDateOpen, setEventDateOpen] = useState(false)

    // Lista reati per suggerimenti
    const reatoSuggestions = REATI_PENALI

    // Lista atti dai drawer
    const attiSuggestions = getDrawerOptionsSorted().map(d => d.label)

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

    const handleTypeChange = (newType: CellType) => {
        onUpdate({ cellType: newType, description: '', contestationDate: undefined, eventDate: undefined })
    }

    const handleDescriptionChange = (newDescription: string) => {
        onUpdate({ description: newDescription })
    }

    const handleDateChange = (field: 'contestationDate' | 'eventDate', date: Date | undefined) => {
        if (date) {
            onUpdate({ [field]: date.toISOString().split('T')[0] })
        } else {
            onUpdate({ [field]: undefined })
        }
    }

    // Se non c'è ancora un tipo, mostra solo il dropdown
    if (!cellType) {
        return (
            <div className={cn("p-2", className)}>
                <Select
                    value=""
                    onValueChange={(value) => handleTypeChange(value as CellType)}
                    disabled={readOnly}
                >
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]">
                        <SelectValue placeholder="Seleziona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="reato-contestato">Reato contestato</SelectItem>
                        <SelectItem value="fatto">Fatto</SelectItem>
                        <SelectItem value="atto">Atto</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        )
    }

    return (
        <div className={cn("p-2 space-y-1", className)}>
            {/* Tipo e Descrizione - stessa riga */}
            <div className="flex items-center gap-2 flex-wrap">
                <Select
                    value={cellType}
                    onValueChange={(value) => handleTypeChange(value as CellType)}
                    disabled={readOnly}
                >
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="reato-contestato">Reato contestato</SelectItem>
                        <SelectItem value="fatto">Fatto</SelectItem>
                        <SelectItem value="atto">Atto</SelectItem>
                    </SelectContent>
                </Select>

                {/* Campo descrizione - subito a destra */}
                {cellType === 'reato-contestato' && (
                    <Combobox
                        value={description}
                        onChange={handleDescriptionChange}
                        suggestions={reatoSuggestions}
                        placeholder="Digita il nome del reato..."
                        readOnly={readOnly}
                    />
                )}
                {cellType === 'atto' && (
                    <Combobox
                        value={description}
                        onChange={handleDescriptionChange}
                        suggestions={attiSuggestions}
                        placeholder="Digita il nome dell'atto..."
                        readOnly={readOnly}
                    />
                )}
                {cellType === 'fatto' && (
                    <Input
                        value={description}
                        onChange={(e) => handleDescriptionChange(e.target.value)}
                        placeholder="Inserisci descrizione..."
                        readOnly={readOnly}
                        className="h-8 text-xs flex-1 min-w-[200px]"
                    />
                )}
                {getFieldError('description') && (
                    <p className="text-xs text-red-500 w-full">{getFieldError('description')}</p>
                )}
            </div>

            {/* Date - solo per Reato e Fatto */}
            {cellType === 'reato-contestato' && (
                <>
                    {/* Data contestazione - label e picker attaccati */}
                    <div className="flex items-center gap-1">
                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">data contestazione</label>
                        <Popover open={contestationDateOpen} onOpenChange={setContestationDateOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    disabled={readOnly}
                                    className={cn(
                                        "inline-flex items-center justify-start text-left font-normal rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background hover:bg-accent hover:text-accent-foreground h-8 whitespace-nowrap",
                                        !contestationDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {contestationDate ? (
                                        format(new Date(contestationDate), "dd/MM/yyyy", { locale: it })
                                    ) : (
                                        <span>Seleziona data</span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={contestationDate ? new Date(contestationDate) : undefined}
                                    onSelect={(date) => {
                                        handleDateChange('contestationDate', date)
                                        setContestationDateOpen(false)
                                    }}
                                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        {getFieldError('contestationDate') && (
                            <span className="text-xs text-red-500">{getFieldError('contestationDate')}</span>
                        )}
                    </div>

                    {/* Data evento - label e picker attaccati */}
                    <div className="flex items-center gap-1">
                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">data fatto:</label>
                        <Popover open={eventDateOpen} onOpenChange={setEventDateOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    disabled={readOnly}
                                    className={cn(
                                        "inline-flex items-center justify-start text-left font-normal rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background hover:bg-accent hover:text-accent-foreground h-8 whitespace-nowrap",
                                        !eventDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {eventDate ? (
                                        format(new Date(eventDate), "dd/MM/yyyy", { locale: it })
                                    ) : (
                                        <span>Seleziona data</span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={eventDate ? new Date(eventDate) : undefined}
                                    onSelect={(date) => {
                                        handleDateChange('eventDate', date)
                                        setEventDateOpen(false)
                                    }}
                                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        {getFieldError('eventDate') && (
                            <span className="text-xs text-red-500">{getFieldError('eventDate')}</span>
                        )}
                    </div>
                </>
            )}

            {cellType === 'fatto' && (
                <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-gray-700 whitespace-nowrap">data fatto:</label>
                    <Popover open={contestationDateOpen} onOpenChange={setContestationDateOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                disabled={readOnly}
                                className={cn(
                                    "inline-flex items-center justify-start text-left font-normal rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background hover:bg-accent hover:text-accent-foreground h-8 whitespace-nowrap",
                                    !contestationDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                {contestationDate ? (
                                    format(new Date(contestationDate), "dd/MM/yyyy", { locale: it })
                                ) : (
                                    <span>Seleziona data</span>
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={contestationDate ? new Date(contestationDate) : undefined}
                                onSelect={(date) => {
                                    handleDateChange('contestationDate', date)
                                    setContestationDateOpen(false)
                                }}
                                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            )}
        </div>
    )
}
