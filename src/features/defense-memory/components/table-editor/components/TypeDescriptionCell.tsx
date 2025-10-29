import React, { useState, useRef, useEffect } from 'react'
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

// Lista di atti comuni nel sistema giudiziario
const ATTI_COMUNI = [
    'decreto di archiviazione',
    'decreto di citazione',
    'decreto di rinvio a giudizio',
    'mandato di comparizione',
    'mandato di cattura',
    'mandato di perquisizione',
    'mandato di sequestro',
    'ordinanza di custodia cautelare',
    'ordinanza di applicazione della misura cautelare',
    'ordinanza di proroga della misura cautelare',
    'ordinanza di revoca della misura cautelare',
    'ordinanza di scarcerazione',
    'ordinanza di controllo',
    'ordinanza di sorveglianza speciale',
    'ordinanza di allontanamento dalla casa familiare',
    'ordinanza di divieto di avvicinamento',
    'ordinanza di divieto di comunicazione',
    'ordinanza di obbligo di dimora',
    'ordinanza di obbligo di presentazione',
    'sentenza',
    'sentenza di primo grado',
    'sentenza di secondo grado',
    'sentenza di condanna',
    'sentenza di assoluzione',
    'sentenza di non luogo a procedere',
    'sentenza di estinzione del reato',
    'sentenza di archiviazione',
    'verbale di interrogatorio',
    'verbale di audizione',
    'verbale di perquisizione',
    'verbale di sequestro',
    'verbale di arresto',
    'verbale di fermo',
    'verbale di identificazione',
    'verbale di accertamento',
    'verbale di constatazione',
    'verbale di consegna',
    'verbale di notifica',
    'verbale di garanzia',
    'verbale di contestazione',
    'notifica di avviso di garanzia',
    'notifica di avviso di conclusione delle indagini',
    'notifica di avviso di udienza',
    'notifica di avviso di sentenza',
    'procura',
    'procura generale',
    'procura speciale',
    'procura a procedere',
    'procura a querelare',
    'ricorso',
    'ricorso per cassazione',
    'ricorso per revisione',
    'ricorso per impugnazione',
    'atto di citazione',
    'atto di opposizione',
    'atto di costituzione di parte civile',
    'atto di querela',
    'atto di denuncia',
    'atto di precisazione',
    'atto di integrazione',
    'atto di deposito',
    'atto di notifica',
    'atto di cancellazione',
    'atto di archiviazione',
    'atto di rinvio',
    'atto di stralcio',
    'atto di separazione',
    'atto di riunione',
    'atto di rimessione',
    'atto di remissione',
    'atto di rinuncia',
    'atto di transazione',
    'atto di composizione',
    'atto di conciliazione',
    'atto di mediazione',
    'atto di arbitrato',
    'atto di compromesso',
    'atto di lodo',
    'atto di esecuzione',
    'atto di pignoramento',
    'atto di sequestro',
    'atto di vendita',
    'atto di assegnazione',
    'atto di divisione',
    'atto di unione',
    'atto di fusione',
    'atto di scissione',
    'atto di trasformazione',
    'atto di modifica',
    'atto di variazione',
    'atto di integrazione',
    'atto di rettifica',
    'atto di correzione',
    'atto di annullamento',
    'atto di revoca',
    'atto di risoluzione',
    'atto di rescissione',
    'atto di nullità',
    'atto di inesistenza',
    'atto di inefficacia',
    'atto di invalidità',
    'atto di illegittimità',
    'atto di incostituzionalità',
    'atto di disapplicazione',
    'atto di disapplicazione parziale',
    'atto di disapplicazione totale',
    'atto di disapplicazione integrale',
    'atto di disapplicazione sostanziale',
    'atto di disapplicazione formale',
    'atto di disapplicazione procedurale',
    'atto di disapplicazione sostanziale e formale',
    'atto di disapplicazione sostanziale e procedurale',
    'atto di disapplicazione formale e procedurale',
    'atto di disapplicazione sostanziale, formale e procedurale'
]

interface TypeDescriptionCellProps {
    cellType: CellType
    description: string
    contestationDate?: string
    eventDate?: string
    errors?: ValidationError[]
    onUpdate: (data: Partial<{ cellType: CellType; description: string; contestationDate?: string; eventDate?: string }>) => void
    readOnly?: boolean
    className?: string
    onWidthChange?: (width: number) => void
}

export const TypeDescriptionCell: React.FC<TypeDescriptionCellProps> = ({
    cellType,
    description,
    contestationDate,
    eventDate,
    errors = [],
    onUpdate,
    readOnly = false,
    className = '',
    onWidthChange
}) => {
    const [contestationDateOpen, setContestationDateOpen] = useState(false)
    const [eventDateOpen, setEventDateOpen] = useState(false)
    const comboboxRowRef = useRef<HTMLDivElement>(null)
    const onWidthChangeRef = useRef(onWidthChange)
    const lastMeasuredWidthRef = useRef<number>(0)

    // Aggiorna il ref quando cambia la funzione
    useEffect(() => {
        onWidthChangeRef.current = onWidthChange
    }, [onWidthChange])

    // Misura la larghezza della riga con le combobox e notifica il cambiamento
    useEffect(() => {
        if (comboboxRowRef.current && cellType) {
            const measureWidth = () => {
                if (!comboboxRowRef.current) return

                // Salva la larghezza originale della cella per ripristinarla dopo
                const originalWidth = comboboxRowRef.current.parentElement?.style.width

                // Temporaneamente rimuovi la larghezza fissa per permettere al contenuto di espandersi
                if (comboboxRowRef.current.parentElement) {
                    comboboxRowRef.current.parentElement.style.width = 'auto'
                    comboboxRowRef.current.parentElement.style.maxWidth = 'none'
                }

                // Forza il layout per ottenere le dimensioni corrette
                comboboxRowRef.current.getBoundingClientRect()

                // Misura la larghezza naturale del contenuto usando scrollWidth
                const width = comboboxRowRef.current.scrollWidth || comboboxRowRef.current.offsetWidth || 0

                // Ripristina la larghezza originale
                if (comboboxRowRef.current.parentElement && originalWidth) {
                    comboboxRowRef.current.parentElement.style.width = originalWidth
                }

                // Aggiungi solo 10px di margine + padding della cella (16px totale)
                const totalWidth = width + 10 + 16

                // Limite massimo ragionevole
                const MAX_WIDTH = 1000
                const clampedWidth = Math.min(totalWidth, MAX_WIDTH)

                // Solo notifica se la larghezza è cambiata significativamente (> 5px)
                if (Math.abs(clampedWidth - lastMeasuredWidthRef.current) > 5) {
                    console.log('🟢 [TypeDescriptionCell] Misurando larghezza:', {
                        scrollWidth: width,
                        totalWidth,
                        clampedWidth,
                        cellType,
                        description,
                        differenza: clampedWidth - lastMeasuredWidthRef.current
                    })
                    lastMeasuredWidthRef.current = clampedWidth
                    onWidthChangeRef.current?.(clampedWidth)
                }
            }

            // Misura dopo un breve delay per permettere al DOM di renderizzare
            const timeoutId = setTimeout(measureWidth, 100)

            // Usa ResizeObserver per monitorare cambiamenti, ma con debounce
            let resizeTimeout: NodeJS.Timeout | null = null
            const resizeObserver = new ResizeObserver(() => {
                if (resizeTimeout) clearTimeout(resizeTimeout)
                resizeTimeout = setTimeout(() => {
                    console.log('🟢 [TypeDescriptionCell] ResizeObserver triggered')
                    measureWidth()
                }, 200) // Debounce di 200ms
            })

            resizeObserver.observe(comboboxRowRef.current)

            return () => {
                clearTimeout(timeoutId)
                if (resizeTimeout) clearTimeout(resizeTimeout)
                resizeObserver.disconnect()
            }
        }
    }, [cellType, description]) // Rimuovo onWidthChange dalla dependency array

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
            <div ref={comboboxRowRef} className="flex items-center gap-2 flex-nowrap">
                <Select
                    value={cellType}
                    onValueChange={(value) => handleTypeChange(value as CellType)}
                    disabled={readOnly}
                >
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[140px] flex-shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="reato-contestato">Reato contestato</SelectItem>
                        <SelectItem value="fatto">Fatto</SelectItem>
                        <SelectItem value="atto">Atto</SelectItem>
                    </SelectContent>
                </Select>

                {/* Campo descrizione - subito a destra, auto-size */}
                {cellType === 'reato-contestato' && (
                    <Combobox
                        value={description}
                        onChange={handleDescriptionChange}
                        suggestions={REATI_PENALI}
                        placeholder="Digita il nome del reato..."
                        readOnly={readOnly}
                    />
                )}
                {cellType === 'atto' && (
                    <Combobox
                        value={description}
                        onChange={handleDescriptionChange}
                        suggestions={ATTI_COMUNI}
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
                        className="h-8 text-xs w-auto"
                        style={{ width: `${Math.max(description.length || 20, 15)}ch` }}
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
