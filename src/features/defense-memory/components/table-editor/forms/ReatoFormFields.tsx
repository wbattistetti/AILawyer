import React from 'react'
import { ReatoFormFieldsProps } from '../types/table.types'
import { useReatoSuggestions } from '../hooks/useReatoSuggestions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export const ReatoFormFields: React.FC<ReatoFormFieldsProps> = ({
    description,
    contestationDate,
    eventDate,
    onDescriptionChange,
    onContestationDateChange,
    onEventDateChange,
    errors = [],
    readOnly = false
}) => {
    const {
        query,
        suggestions,
        isLoading,
        isValidReato,
        hasSuggestions,
        updateQuery,
        clearSuggestions,
        selectSuggestion
    } = useReatoSuggestions()

    const [isCalendarOpen, setIsCalendarOpen] = React.useState<'contestation' | 'event' | null>(null)
    const [showSuggestions, setShowSuggestions] = React.useState(false)

    // Sincronizza query con description
    React.useEffect(() => {
        if (query !== description) {
            updateQuery(description)
        }
    }, [description, query, updateQuery])

    const handleDescriptionChange = (value: string) => {
        onDescriptionChange(value)
        updateQuery(value)
        setShowSuggestions(value.length >= 2)
    }

    const handleSuggestionSelect = (suggestion: string) => {
        selectSuggestion(suggestion)
        onDescriptionChange(suggestion)
        setShowSuggestions(false)
    }

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

    return (
        <div className="space-y-4">
            {/* Descrizione Reato */}
            <div className="space-y-2">
                <Label htmlFor="reato-description" className="text-sm font-medium">
                    Reato contestato *
                </Label>
                <div className="relative">
                    <Input
                        id="reato-description"
                        value={description}
                        onChange={(e) => handleDescriptionChange(e.target.value)}
                        placeholder="Inserisci il reato contestato..."
                        className={cn(
                            "pr-8",
                            getFieldError('description') && "border-red-500"
                        )}
                        disabled={readOnly}
                    />
                    {isValidReato && (
                        <Check className="absolute right-2 top-2.5 h-4 w-4 text-green-500" />
                    )}
                </div>
                {getFieldError('description') && (
                    <p className="text-sm text-red-500">{getFieldError('description')}</p>
                )}

                {/* Suggerimenti */}
                {showSuggestions && hasSuggestions && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                                onClick={() => handleSuggestionSelect(suggestion)}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Data Contestazione */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">
                    Data contestazione *
                </Label>
                <Popover open={isCalendarOpen === 'contestation'} onOpenChange={(open) => setIsCalendarOpen(open ? 'contestation' : null)}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !contestationDate && "text-muted-foreground",
                                getFieldError('contestationDate') && "border-red-500"
                            )}
                            disabled={readOnly}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {contestationDate ? format(new Date(contestationDate), "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={contestationDate ? new Date(contestationDate) : undefined}
                            onSelect={(date) => {
                                if (date) {
                                    onContestationDateChange(date.toISOString().split('T')[0])
                                    setIsCalendarOpen(null)
                                }
                            }}
                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
                {getFieldError('contestationDate') && (
                    <p className="text-sm text-red-500">{getFieldError('contestationDate')}</p>
                )}
            </div>

            {/* Data Evento */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">
                    Data evento *
                </Label>
                <Popover open={isCalendarOpen === 'event'} onOpenChange={(open) => setIsCalendarOpen(open ? 'event' : null)}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !eventDate && "text-muted-foreground",
                                getFieldError('eventDate') && "border-red-500"
                            )}
                            disabled={readOnly}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {eventDate ? format(new Date(eventDate), "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={eventDate ? new Date(eventDate) : undefined}
                            onSelect={(date) => {
                                if (date) {
                                    onEventDateChange(date.toISOString().split('T')[0])
                                    setIsCalendarOpen(null)
                                }
                            }}
                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
                {getFieldError('eventDate') && (
                    <p className="text-sm text-red-500">{getFieldError('eventDate')}</p>
                )}
            </div>
        </div>
    )
}
