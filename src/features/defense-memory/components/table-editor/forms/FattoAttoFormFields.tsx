import React from 'react'
import { FattoAttoFormFieldsProps } from '../types/table.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export const FattoAttoFormFields: React.FC<FattoAttoFormFieldsProps> = ({
    description,
    contestationDate,
    eventDate,
    onDescriptionChange,
    onContestationDateChange,
    onEventDateChange,
    errors = [],
    readOnly = false
}) => {
    const [isCalendarOpen, setIsCalendarOpen] = React.useState<'contestation' | 'event' | null>(null)

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

    return (
        <div className="space-y-4">
            {/* Descrizione */}
            <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                    Descrizione *
                </Label>
                <Input
                    id="description"
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    placeholder="Inserisci la descrizione..."
                    className={cn(
                        getFieldError('description') && "border-red-500"
                    )}
                    disabled={readOnly}
                />
                {getFieldError('description') && (
                    <p className="text-sm text-red-500">{getFieldError('description')}</p>
                )}
            </div>

            {/* Data Contestazione (opzionale) */}
            <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-600">
                    Data contestazione (opzionale)
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

            {/* Data Evento (opzionale) */}
            <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-600">
                    Data evento (opzionale)
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
