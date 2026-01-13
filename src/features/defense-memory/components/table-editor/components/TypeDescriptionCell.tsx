import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { CellType, ValidationError } from '../../types/table.types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { getCellTypeLabel, getDateFieldsConfig } from '../utils/cellTypeConfig'

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
    // Stati per modalità edit/view
    // Tipo: parte in editing se non c'è tipo, altrimenti in view
    const [isTypeEditing, setIsTypeEditing] = useState(!cellType)
    // Descrizione: parte in editing se vuota, altrimenti in view
    const [isDescriptionEditing, setIsDescriptionEditing] = useState(!description)
    // Date: parte in editing se vuota, altrimenti in view
    const [isContestationDateEditing, setIsContestationDateEditing] = useState(!contestationDate)
    const [isEventDateEditing, setIsEventDateEditing] = useState(!eventDate)
    const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
    const comboboxRowRef = useRef<HTMLDivElement>(null)
    const typeSelectRef = useRef<HTMLButtonElement>(null)
    const typeMeasureRef = useRef<HTMLSpanElement>(null)
    const [typeSelectWidth, setTypeSelectWidth] = useState<number>(140)

    // Calcola larghezza dinamica del SelectTrigger basata sul contenuto
    useLayoutEffect(() => {
        if (cellType && typeMeasureRef.current && typeSelectRef.current) {
            const label = getCellTypeLabel(cellType)
            typeMeasureRef.current.textContent = label

            const selectStyle = window.getComputedStyle(typeSelectRef.current)
            typeMeasureRef.current.style.font = selectStyle.font
            typeMeasureRef.current.style.fontSize = selectStyle.fontSize
            typeMeasureRef.current.style.fontWeight = selectStyle.fontWeight
            typeMeasureRef.current.style.fontFamily = selectStyle.fontFamily
            typeMeasureRef.current.style.letterSpacing = selectStyle.letterSpacing
            typeMeasureRef.current.style.padding = selectStyle.padding

            const textWidth = typeMeasureRef.current.getBoundingClientRect().width
            // Aggiungi spazio per l'icona chevron (circa 24px) + padding (circa 16px)
            const newWidth = Math.max(textWidth + 40, 100)
            setTypeSelectWidth(newWidth)
        } else if (!cellType && typeMeasureRef.current) {
            // Calcola larghezza per placeholder
            typeMeasureRef.current.textContent = "Seleziona tipo"
            // Usa stili di default se il SelectTrigger non è ancora disponibile
            const defaultFont = '12px system-ui, -apple-system, sans-serif'
            typeMeasureRef.current.style.font = defaultFont
            typeMeasureRef.current.style.fontSize = '12px'
            typeMeasureRef.current.style.padding = '8px 12px'

            const textWidth = typeMeasureRef.current.getBoundingClientRect().width
            const newWidth = Math.max(textWidth + 40, 140)
            setTypeSelectWidth(newWidth)
        }
    }, [cellType])

    // Sincronizza stati edit/view con i props
    useEffect(() => {
        if (!cellType) {
            setIsTypeEditing(true)
        }
    }, [cellType])

    useEffect(() => {
        if (!description) {
            setIsDescriptionEditing(true)
        }
    }, [description])

    useEffect(() => {
        if (!contestationDate) {
            setIsContestationDateEditing(true)
        }
    }, [contestationDate])

    useEffect(() => {
        if (!eventDate) {
            setIsEventDateEditing(true)
        }
    }, [eventDate])

    // Auto-espansione textarea descrizione
    useEffect(() => {
        if (descriptionTextareaRef.current && isDescriptionEditing && cellType === 'fatto') {
            const textarea = descriptionTextareaRef.current
            textarea.style.height = '24px' // Start with single line
            textarea.style.height = `${Math.max(24, textarea.scrollHeight)}px` // Expand as needed
        }
    }, [description, isDescriptionEditing, cellType])

    // Focus sul textarea quando entra in editing
    useEffect(() => {
        if (isDescriptionEditing && descriptionTextareaRef.current && cellType === 'fatto') {
            // Delay per permettere al DOM di renderizzare
            setTimeout(() => {
                descriptionTextareaRef.current?.focus()
            }, 0)
        }
    }, [isDescriptionEditing, cellType])

    const getFieldError = (field: string) => {
        return errors.find(error => error.field === field)?.message
    }

    const handleTypeChange = (newType: CellType) => {
        setIsTypeEditing(false) // Esce dalla modalità editing dopo selezione
        onUpdate({ cellType: newType, description: '', contestationDate: undefined, eventDate: undefined })
    }

    const handleDescriptionChange = (newDescription: string) => {
        onUpdate({ description: newDescription })
    }

    // Handler per Enter nel textarea
    const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            setIsDescriptionEditing(false)
        }
    }

    // Handler per blur
    const handleDescriptionBlur = () => {
        if (description.trim()) {
            setIsDescriptionEditing(false)
        }
    }

    // Handler per blur date
    const handleContestationDateBlur = () => {
        if (contestationDate) {
            setIsContestationDateEditing(false)
        }
    }

    const handleEventDateBlur = () => {
        if (eventDate) {
            setIsEventDateEditing(false)
        }
    }

    // Handler per click sulla label tipo
    const handleTypeLabelClick = () => {
        if (!readOnly) {
            setIsTypeEditing(true)
        }
    }

    // Handler per click sulla label descrizione
    const handleDescriptionLabelClick = () => {
        if (!readOnly) {
            setIsDescriptionEditing(true)
        }
    }

    // Converter per mostrare label tipo - usa helper centralizzato
    const getTypeLabel = (type: CellType) => {
        return getCellTypeLabel(type)
    }

    // Configurazione date per questo tipo
    const dateConfig = cellType ? getDateFieldsConfig(cellType) : null

    // Determina se il tipo usa combobox o textarea per la descrizione
    const usesCombobox = cellType === 'reato-contestato' || cellType === 'atto'
    const usesTextarea = !usesCombobox && cellType !== undefined

    const handleDateChange = (field: 'contestationDate' | 'eventDate', date: Date | undefined) => {
        if (date) {
            onUpdate({ [field]: date.toISOString().split('T')[0] })
            // Esce dalla modalità editing dopo selezione
            if (field === 'contestationDate') {
                setIsContestationDateEditing(false)
            } else {
                setIsEventDateEditing(false)
            }
        } else {
            onUpdate({ [field]: undefined })
        }
    }

    // Handler per click sulle label date
    const handleContestationDateLabelClick = () => {
        if (!readOnly) {
            setIsContestationDateEditing(true)
            setContestationDateOpen(true)
        }
    }

    const handleEventDateLabelClick = () => {
        if (!readOnly) {
            setIsEventDateEditing(true)
            setEventDateOpen(true)
        }
    }

    // Helper per ottenere il label descrizione (solo il valore, senza ripetere il tipo)
    const getDescriptionLabel = () => {
        if (!description) return 'Clicca per inserire descrizione...'
        return description
    }


    // Se non c'è ancora un tipo, mostra solo il dropdown
    if (!cellType) {
        return (
            <div className={cn("p-2", className)}>
                {/* Elemento nascosto per misurare la larghezza del placeholder */}
                <span
                    ref={typeMeasureRef}
                    className="absolute invisible whitespace-nowrap"
                    style={{ position: 'absolute', visibility: 'hidden', top: '-9999px' }}
                />
                <Select
                    value=""
                    onValueChange={(value) => handleTypeChange(value as CellType)}
                    disabled={readOnly}
                >
                    <SelectTrigger
                        ref={typeSelectRef}
                        className="h-8 text-xs flex-shrink-0"
                        style={{ width: `${typeSelectWidth}px` }}
                    >
                        <SelectValue placeholder="Seleziona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        {([
                            'reato-contestato',
                            'elementi-prova',
                            'verbale-arresto',
                            'verbale-sequestro',
                            'verbale-perquisizione',
                            'interrogatorio',
                            'dichiarazioni-testi',
                            'intercettazioni',
                            'atto',
                            'fatto'
                        ] as CellType[]).sort((a, b) => getCellTypeLabel(a).localeCompare(getCellTypeLabel(b))).map(type => (
                            <SelectItem key={type} value={type}>
                                {getCellTypeLabel(type)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        )
    }

    return (
        <div className={cn("p-2 space-y-1", className)}>
            {/* Elemento nascosto per misurare la larghezza del testo */}
            <span
                ref={typeMeasureRef}
                className="absolute invisible whitespace-nowrap"
                style={{ position: 'absolute', visibility: 'hidden', top: '-9999px' }}
            />

            {/* Tipo e Descrizione - stessa riga */}
            <div ref={comboboxRowRef} className="flex items-center gap-3 flex-nowrap">
                {/* Tipo: Label o Select in base a isTypeEditing */}
                {isTypeEditing ? (
                    <Select
                        value={cellType}
                        onValueChange={(value) => handleTypeChange(value as CellType)}
                        disabled={readOnly}
                        onOpenChange={(open) => {
                            if (!open) {
                                setIsTypeEditing(false)
                            }
                        }}
                    >
                        <SelectTrigger
                            ref={typeSelectRef}
                            className="h-8 text-xs flex-shrink-0"
                            style={{ width: `${typeSelectWidth}px` }}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {([
                                'reato-contestato',
                                'elementi-prova',
                                'verbale-arresto',
                                'verbale-sequestro',
                                'verbale-perquisizione',
                                'interrogatorio',
                                'dichiarazioni-testi',
                                'intercettazioni',
                                'atto',
                                'fatto'
                            ] as CellType[]).sort((a, b) => getCellTypeLabel(a).localeCompare(getCellTypeLabel(b))).map(type => (
                                <SelectItem key={type} value={type}>
                                    {getCellTypeLabel(type)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <button
                        onClick={handleTypeLabelClick}
                        disabled={readOnly}
                        className={cn(
                            "text-xs font-medium text-gray-700 whitespace-nowrap text-right flex-shrink-0 border border-transparent rounded px-1",
                            "hover:bg-gray-100 hover:border-gray-300 transition-colors",
                            readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                        )}
                        style={{ width: '120px' }}
                    >
                        {getTypeLabel(cellType)}:
                    </button>
                )}

                {/* Campo descrizione: Label o campo editabile */}
                {isDescriptionEditing ? (
                    <>
                        {cellType === 'reato-contestato' && (
                            <Combobox
                                value={description}
                                onChange={handleDescriptionChange}
                                suggestions={[...REATI_PENALI].sort()}
                                placeholder="Digita il nome del reato..."
                                readOnly={readOnly}
                                aria-label="Seleziona reato contestato"
                                autoOpen={isDescriptionEditing}
                                onBlur={handleDescriptionBlur}
                                onSelection={() => {
                                    // Chiude la modalità editing quando viene selezionato un reato
                                    setIsDescriptionEditing(false)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleDescriptionBlur()
                                    }
                                }}
                            />
                        )}
                        {cellType === 'atto' && (
                            <Combobox
                                value={description}
                                onChange={handleDescriptionChange}
                                suggestions={[...ATTI_COMUNI].sort()}
                                placeholder="Digita il nome dell'atto..."
                                readOnly={readOnly}
                                aria-label="Seleziona atto"
                                autoOpen={isDescriptionEditing}
                                onBlur={handleDescriptionBlur}
                                onSelection={() => {
                                    // Chiude la modalità editing quando viene selezionato un atto
                                    setIsDescriptionEditing(false)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleDescriptionBlur()
                                    }
                                }}
                            />
                        )}
                        {usesTextarea && (
                            <Textarea
                                ref={descriptionTextareaRef}
                                value={description}
                                onChange={(e) => handleDescriptionChange(e.target.value)}
                                onBlur={handleDescriptionBlur}
                                onKeyDown={handleDescriptionKeyDown}
                                placeholder="Inserisci descrizione..."
                                readOnly={readOnly}
                                className={cn(
                                    "text-xs resize-none overflow-hidden",
                                    "whitespace-pre-wrap break-words",
                                    "flex-1 min-w-0"
                                )}
                                style={{
                                    minHeight: '24px',
                                    height: '24px'
                                }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement
                                    target.style.height = '24px' // Reset to single line
                                    target.style.height = `${Math.max(24, target.scrollHeight)}px` // Expand as needed
                                }}
                            />
                        )}
                    </>
                ) : (
                    <button
                        onClick={handleDescriptionLabelClick}
                        disabled={readOnly}
                        className={cn(
                            "px-2 py-1 text-base font-normal rounded border border-transparent text-left",
                            "hover:bg-gray-100 hover:border-gray-300 transition-colors",
                            "whitespace-pre-wrap break-words",
                            "flex-1 min-w-0",
                            !description && "text-gray-400 italic",
                            readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                        )}
                    >
                        {getDescriptionLabel()}
                    </button>
                )}
                {getFieldError('description') && (
                    <p className="text-xs text-red-500 w-full">{getFieldError('description')}</p>
                )}
            </div>

            {/* Date - renderizzate dinamicamente in base al tipo */}
            {dateConfig && dateConfig.showContestationDate && (
                <>
                    {/* Data principale - label allineata a destra con gap uniforme */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-700 whitespace-nowrap text-right flex-shrink-0 flex items-center justify-end h-8" style={{ width: '120px' }}>
                            {dateConfig.contestationDateLabel}:
                        </span>
                        {isContestationDateEditing ? (
                            <Popover open={contestationDateOpen} onOpenChange={(open) => {
                                setContestationDateOpen(open)
                                if (!open) {
                                    handleContestationDateBlur()
                                }
                            }}>
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
                                            `${dateConfig.contestationDateLabel}: ${format(new Date(contestationDate), "dd/MM/yyyy", { locale: it })}`
                                        ) : (
                                            <span>Seleziona data</span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                    sideOffset={0}  // ✅ Riduci il gap a 0 per evitare che il mouse esca
                                    onInteractOutside={(e) => {
                                        // ✅ Previeni la chiusura quando si interagisce con elementi correlati
                                        const target = e.target as HTMLElement
                                        if (target.closest('[data-radix-popper-content-wrapper]') ||
                                            target.closest('[role="dialog"]')) {
                                            e.preventDefault()
                                        }
                                    }}
                                >
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
                        ) : (
                            <button
                                onClick={handleContestationDateLabelClick}
                                disabled={readOnly}
                                className={cn(
                                    "px-2 py-1 text-xs rounded border border-transparent",
                                    "hover:bg-gray-100 hover:border-gray-300 transition-colors",
                                    readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                                )}
                            >
                                {contestationDate
                                    ? `${dateConfig.contestationDateLabel}: ${format(new Date(contestationDate), "dd/MM/yyyy", { locale: it })}`
                                    : 'Clicca per selezionare data'
                                }
                            </button>
                        )}
                        {getFieldError('contestationDate') && (
                            <span className="text-xs text-red-500">{getFieldError('contestationDate')}</span>
                        )}
                    </div>

                    {/* Data secondaria - label allineata a destra con gap uniforme */}
                    {dateConfig.showEventDate && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-gray-700 whitespace-nowrap text-right flex-shrink-0 flex items-center justify-end h-8" style={{ width: '120px' }}>
                                {dateConfig.eventDateLabel}:
                            </span>
                            {isEventDateEditing ? (
                            <Popover open={eventDateOpen} onOpenChange={(open) => {
                                setEventDateOpen(open)
                                if (!open) {
                                    handleEventDateBlur()
                                }
                            }}>
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
                                            `${dateConfig.eventDateLabel}: ${format(new Date(eventDate), "dd/MM/yyyy", { locale: it })}`
                                        ) : (
                                            <span>Seleziona data</span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                    sideOffset={0}  // ✅ Riduci il gap a 0 per evitare che il mouse esca
                                    onInteractOutside={(e) => {
                                        // ✅ Previeni la chiusura quando si interagisce con elementi correlati
                                        const target = e.target as HTMLElement
                                        if (target.closest('[data-radix-popper-content-wrapper]') ||
                                            target.closest('[role="dialog"]')) {
                                            e.preventDefault()
                                        }
                                    }}
                                >
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
                        ) : (
                            <button
                                onClick={handleEventDateLabelClick}
                                disabled={readOnly}
                                className={cn(
                                    "px-2 py-1 text-xs rounded border border-transparent",
                                    "hover:bg-gray-100 hover:border-gray-300 transition-colors",
                                    readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                                )}
                            >
                                {eventDate
                                    ? `${dateConfig.eventDateLabel}: ${format(new Date(eventDate), "dd/MM/yyyy", { locale: it })}`
                                    : 'Clicca per selezionare data'
                                }
                            </button>
                        )}
                        {getFieldError('eventDate') && (
                            <span className="text-xs text-red-500">{getFieldError('eventDate')}</span>
                        )}
                    </div>
                    )}
                </>
            )}
        </div>
    )
}
