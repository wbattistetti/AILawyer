import React, { useState, useRef, useEffect, useCallback } from 'react'
import { TableRowProps, CellType } from '../../types/table.types'
import { ObservationsCell } from './ObservationsCell'
import { Combobox } from './Combobox'
import { REATI_PENALI } from '../utils/reatoSuggestions'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Scale, FileText, AlertCircle, Calendar as CalendarIcon, MoreVertical, Plus, Trash2, Shield, Gavel, Lock, Search, MessageSquare, Users, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getCellTypeLabel, getDateFieldsConfig } from '../utils/cellTypeConfig'
import { CellTypeSelect } from './shared'

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
    onAddRowAbove,
    onAddRowBelow,
    readOnly = false,
    errors = [],
    columnWidths = DEFAULT_WIDTHS,
    onMoveMotivation,
    defaultExpanded = false,
    onExpandChange
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    // ✅ Aggiorna lo stato quando defaultExpanded cambia
    useEffect(() => {
        setIsExpanded(defaultExpanded)
    }, [defaultExpanded])

    // ✅ Handler per toggle espansione
    const handleToggleExpand = useCallback(() => {
        const newExpanded = !isExpanded
        setIsExpanded(newExpanded)
        if (onExpandChange) {
            onExpandChange(row.id, newExpanded)
        }
    }, [isExpanded, onExpandChange, row.id])
    const [isHovered, setIsHovered] = useState(false)
    const [contestationDateOpen, setContestationDateOpen] = useState(false)
    const [eventDateOpen, setEventDateOpen] = useState(false)
    const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)

    // ✅ Ref per i container dei campi editabili (per verificare mouse dentro/fuori)
    const typeContainerRef = useRef<HTMLDivElement>(null)
    const descriptionContainerRef = useRef<HTMLDivElement>(null)
    const contestationDateContainerRef = useRef<HTMLDivElement>(null)
    const eventDateContainerRef = useRef<HTMLDivElement>(null)

    // ✅ Ref per misurare larghezze quando le combobox sono espande
    const typeSelectRef = useRef<HTMLButtonElement | null>(null)
    const typeButtonRef = useRef<HTMLButtonElement | null>(null)
    const descriptionComboboxRef = useRef<HTMLDivElement | null>(null)

    // ✅ Stati per larghezze calcolate (per spacing dinamico)
    const [typeWidth, setTypeWidth] = useState(140) // Min width iniziale
    const [descriptionWidth, setDescriptionWidth] = useState(200)

    // ✅ Stati editing per ogni campo (edit-on-click/hover)
    const [isTypeEditing, setIsTypeEditing] = useState(!row.cellType)
    const [isDescriptionEditing, setIsDescriptionEditing] = useState(false)
    const [isContestationDateEditing, setIsContestationDateEditing] = useState(false)
    const [isEventDateEditing, setIsEventDateEditing] = useState(false)

    const handleUpdate = (data: Partial<{ cellType: any; description: string; contestationDate?: string; eventDate?: string; observations?: string; extract?: any }>) => {
        onUpdate(row.id, data)
    }

    const handleDelete = () => {
        onDelete(row.id)
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
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'atto':
                return {
                    bgColor: 'bg-blue-50',
                    borderColor: 'border-blue-200',
                    textColor: 'text-blue-900',
                    icon: FileText,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'fatto':
                return {
                    bgColor: 'bg-amber-50',
                    borderColor: 'border-amber-200',
                    textColor: 'text-amber-900',
                    icon: AlertCircle,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'elementi-prova':
                return {
                    bgColor: 'bg-green-50',
                    borderColor: 'border-green-200',
                    textColor: 'text-green-900',
                    icon: Shield,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'verbale-arresto':
                return {
                    bgColor: 'bg-purple-50',
                    borderColor: 'border-purple-200',
                    textColor: 'text-purple-900',
                    icon: Gavel,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'verbale-sequestro':
                return {
                    bgColor: 'bg-indigo-50',
                    borderColor: 'border-indigo-200',
                    textColor: 'text-indigo-900',
                    icon: Lock,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'verbale-perquisizione':
                return {
                    bgColor: 'bg-cyan-50',
                    borderColor: 'border-cyan-200',
                    textColor: 'text-cyan-900',
                    icon: Search,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'interrogatorio':
                return {
                    bgColor: 'bg-orange-50',
                    borderColor: 'border-orange-200',
                    textColor: 'text-orange-900',
                    icon: MessageSquare,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'dichiarazioni-testi':
                return {
                    bgColor: 'bg-pink-50',
                    borderColor: 'border-pink-200',
                    textColor: 'text-pink-900',
                    icon: Users,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            case 'intercettazioni':
                return {
                    bgColor: 'bg-teal-50',
                    borderColor: 'border-teal-200',
                    textColor: 'text-teal-900',
                    icon: Phone,
                    typeLabel: getCellTypeLabel(row.cellType)
                }
            default:
                return {
                    bgColor: 'bg-gray-50',
                    borderColor: 'border-gray-200',
                    textColor: 'text-gray-900',
                    icon: FileText,
                    typeLabel: row.cellType ? getCellTypeLabel(row.cellType) : 'Voce'
                }
        }
    }

    const typeConfig = getTypeConfig()
    const IconComponent = typeConfig.icon

    // ✅ Sincronizza stati editing con props
    useEffect(() => {
        if (!row.cellType) {
            setIsTypeEditing(true)
        }
    }, [row.cellType])

    // ✅ Calcola larghezza tipo quando la Select è attiva (per spacing descrizione)
    useEffect(() => {
        if (isTypeEditing && typeSelectRef.current) {
            // Quando la Select è aperta, misura la larghezza del trigger
            const measureWidth = () => {
                const trigger = typeSelectRef.current
                if (trigger) {
                    const width = trigger.getBoundingClientRect().width
                    setTypeWidth(Math.max(width, 140)) // Min 140px
                }
            }
            // Usa setTimeout per permettere al DOM di renderizzare
            const timeoutId = setTimeout(measureWidth, 0)
            return () => clearTimeout(timeoutId)
        } else if (!isTypeEditing && typeButtonRef.current) {
            // Quando è una label, misura la larghezza della label
            const measureWidth = () => {
                const button = typeButtonRef.current
                if (button) {
                    const width = button.getBoundingClientRect().width
                    setTypeWidth(Math.max(width, 140))
                }
            }
            const timeoutId = setTimeout(measureWidth, 0)
            return () => clearTimeout(timeoutId)
        }
    }, [isTypeEditing, row.cellType])

    // ✅ Calcola larghezza descrizione quando la combobox è attiva (per spacing date)
    useEffect(() => {
        if (isDescriptionEditing && descriptionComboboxRef.current) {
            const measureWidth = () => {
                const combobox = descriptionComboboxRef.current
                if (combobox) {
                    const width = combobox.getBoundingClientRect().width
                    setDescriptionWidth(Math.max(width, 200))
                }
            }
            const timeoutId = setTimeout(measureWidth, 100)
            return () => clearTimeout(timeoutId)
        } else if (!isDescriptionEditing && descriptionContainerRef.current) {
            // Quando è una label, misura la larghezza della label
            const measureWidth = () => {
                const container = descriptionContainerRef.current
                if (container) {
                    const button = container.querySelector('button')
                    if (button) {
                        const width = button.getBoundingClientRect().width
                        setDescriptionWidth(Math.max(width, 200))
                    }
                }
            }
            const timeoutId = setTimeout(measureWidth, 0)
            return () => clearTimeout(timeoutId)
        }
    }, [isDescriptionEditing, row.description])

    // ✅ Gestione cambio tipo
    const handleTypeChange = (newType: CellType) => {
        setIsTypeEditing(false)
        handleUpdate({
            cellType: newType,
            description: '',
            contestationDate: undefined,
            eventDate: undefined
        })
    }

    // ✅ Gestione cambio descrizione
    const handleDescriptionChange = (newDescription: string) => {
        handleUpdate({ description: newDescription })
    }

    const handleDescriptionBlur = () => {
        setIsDescriptionEditing(false)
    }

    // ✅ Gestione date
    const handleDateChange = (field: 'contestationDate' | 'eventDate', date: Date | undefined) => {
        if (date) {
            handleUpdate({ [field]: date.toISOString().split('T')[0] })
            if (field === 'contestationDate') {
                setContestationDateOpen(false)
                setIsContestationDateEditing(false)
            } else {
                setEventDateOpen(false)
                setIsEventDateEditing(false)
            }
        } else {
            handleUpdate({ [field]: undefined })
        }
    }

    // ✅ Helper per labels
    const getTypeLabel = (type: CellType | null): string => {
        if (!type) return 'Seleziona tipo'
        return getCellTypeLabel(type)
    }

    const getDescriptionLabel = (): string => {
        if (row.description?.trim()) return row.description
        if (row.cellType === 'reato-contestato') return 'Clicca per selezionare reato...'
        if (row.cellType === 'atto') return 'Clicca per selezionare atto...'
        return 'Clicca per inserire descrizione...'
    }

    // Configurazione date per questo tipo
    const dateConfig = row.cellType ? getDateFieldsConfig(row.cellType) : null

    // Determina se il tipo usa combobox o textarea
    const usesCombobox = row.cellType === 'reato-contestato' || row.cellType === 'atto'
    const usesTextarea = !usesCombobox && row.cellType !== undefined

    // ✅ Auto-espansione textarea per tipi che la usano
    useEffect(() => {
        if (descriptionTextareaRef.current && usesTextarea) {
            const textarea = descriptionTextareaRef.current
            textarea.style.height = '24px'
            textarea.style.height = `${Math.max(24, textarea.scrollHeight)}px`
        }
    }, [row.description, row.cellType, usesTextarea])

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
            {/* ✅ Header accordion - sempre visibile con controlli inline */}
            <div
                className={cn(
                    "flex items-center px-3 py-2 gap-2 transition-colors border-l-4",
                    typeConfig.bgColor,
                    !hasErrors && typeConfig.borderColor,
                    hasErrors && "bg-red-50 border-l-red-400",
                    isExpanded && "shadow-sm"
                )}
                style={{ gap: '8px' }} // ✅ Gap fisso tra tutti gli elementi
            >
                {/* Icona expand/collapse - tutta a sinistra, prima del numero */}
                <div
                    className="flex-shrink-0 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={handleToggleExpand}
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </div>

                {/* Numero d'ordine */}
                <div className={cn("flex-shrink-0 w-8 text-center text-sm font-semibold", typeConfig.textColor)}>
                    {order}.
                </div>

                {/* Icona tipo */}
                <div className={cn("flex-shrink-0", typeConfig.textColor)}>
                    <IconComponent className="h-4 w-4" />
                </div>

                {/* ✅ Tipo - Label o Select (edit-on-click/hover, chiusura gestita solo da onOpenChange del Select) */}
                <div
                    ref={typeContainerRef}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0"
                >
                    {isTypeEditing ? (
                        <CellTypeSelect
                            value={row.cellType || ''}
                            onValueChange={(value) => {
                                handleTypeChange(value)
                            }}
                            disabled={readOnly}
                            triggerRef={typeSelectRef}
                            triggerClassName={cn(
                                row.cellType ? typeConfig.textColor : 'text-gray-500'
                            )}
                            onOpenChange={(open) => {
                                if (!open && row.cellType) {
                                    setIsTypeEditing(false)
                                }
                                if (open && typeSelectRef.current) {
                                    setTimeout(() => {
                                        const trigger = typeSelectRef.current
                                        if (trigger) {
                                            const width = trigger.getBoundingClientRect().width
                                            setTypeWidth(Math.max(width, 140))
                                        }
                                    }, 100)
                                }
                            }}
                        />
                    ) : (
                        <button
                            ref={typeButtonRef}
                            onClick={() => {
                                console.log('[AccordionRow] Button onClick, readOnly:', readOnly, 'cellType:', row.cellType)
                                if (!readOnly) {
                                    console.log('[AccordionRow] Imposto isTypeEditing a true')
                                    setIsTypeEditing(true)
                                }
                            }}
                            onMouseEnter={() => {
                                console.log('[AccordionRow] Button onMouseEnter, readOnly:', readOnly)
                                if (!readOnly) {
                                    setIsTypeEditing(true)
                                }
                            }}
                            disabled={readOnly}
                            className={cn(
                                "h-8 text-xs px-2 py-1 rounded border border-transparent text-left",
                                "hover:bg-white/50 hover:border-gray-300 transition-colors",
                                row.cellType ? typeConfig.textColor : "text-gray-500",
                                readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                            )}
                            style={{ minWidth: '140px' }}
                        >
                            {getTypeLabel(row.cellType)}
                        </button>
                    )}
                </div>

                {/* ✅ Campo Dettagli - Label o Combobox/Textarea (edit-on-click/hover, torna label su mouse leave) */}
                {row.cellType && (
                    <>
                        <div
                            ref={descriptionContainerRef}
                            onClick={(e) => e.stopPropagation()}
                            onMouseLeave={(e) => {
                                if (isDescriptionEditing && !readOnly) {
                                    const relatedTarget = e.relatedTarget as HTMLElement | null

                                    // ✅ Verifica che relatedTarget sia un Node valido prima di chiamare contains
                                    // Se il mouse si è spostato dentro il container stesso (combobox, dropdown), non chiudere
                                    if (relatedTarget && relatedTarget instanceof Node && descriptionContainerRef.current?.contains(relatedTarget)) {
                                        return
                                    }

                                    setTimeout(() => {
                                        // Verifica di nuovo se il mouse è ancora dentro
                                        if (descriptionContainerRef.current && !descriptionContainerRef.current.matches(':hover')) {
                                            setIsDescriptionEditing(false)
                                        }
                                    }, 200)
                                }
                            }}
                            className="flex-shrink-0"
                            style={{ minWidth: '200px', maxWidth: '400px' }}
                        >
                            {isDescriptionEditing ? (
                                <>
                                    {row.cellType === 'reato-contestato' && (
                                        <div ref={descriptionComboboxRef}>
                                            <Combobox
                                                value={row.description || ''}
                                                onChange={handleDescriptionChange}
                                                suggestions={[...REATI_PENALI].sort()}
                                                placeholder="Digita il nome del reato..."
                                                readOnly={readOnly}
                                                aria-label="Seleziona reato contestato"
                                                className="w-full"
                                                autoOpen={isDescriptionEditing}
                                                onBlur={handleDescriptionBlur}
                                                onSelection={() => setIsDescriptionEditing(false)}
                                            />
                                        </div>
                                    )}
                                    {usesTextarea && (
                                        <div ref={descriptionComboboxRef}>
                                            <Textarea
                                                ref={descriptionTextareaRef}
                                                value={row.description || ''}
                                                onChange={(e) => handleDescriptionChange(e.target.value)}
                                                onBlur={handleDescriptionBlur}
                                                placeholder="Inserisci descrizione..."
                                                readOnly={readOnly}
                                                className={cn(
                                                    "text-xs resize-none overflow-hidden border rounded-md px-2 py-1 w-full",
                                                    "min-h-[24px] max-h-[72px]",
                                                    "focus:outline-none focus:ring-1"
                                                )}
                                                style={{
                                                    minHeight: '24px',
                                                    height: 'auto'
                                                }}
                                                onInput={(e) => {
                                                    const target = e.target as HTMLTextAreaElement
                                                    target.style.height = '24px'
                                                    target.style.height = `${Math.max(24, Math.min(target.scrollHeight, 72))}px`
                                                }}
                                            />
                                        </div>
                                    )}
                                    {row.cellType === 'atto' && (
                                        <div ref={descriptionComboboxRef}>
                                            <Combobox
                                                value={row.description || ''}
                                                onChange={handleDescriptionChange}
                                                suggestions={[...ATTI_COMUNI].sort()}
                                                placeholder="Digita il nome dell'atto..."
                                                readOnly={readOnly}
                                                aria-label="Seleziona atto"
                                                className="w-full"
                                                autoOpen={isDescriptionEditing}
                                                onBlur={handleDescriptionBlur}
                                                onSelection={() => setIsDescriptionEditing(false)}
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => !readOnly && setIsDescriptionEditing(true)}
                                    onMouseEnter={() => !readOnly && setIsDescriptionEditing(true)}
                                    disabled={readOnly}
                                    className={cn(
                                        "h-8 text-xs px-2 py-1 rounded border border-transparent text-left",
                                        "hover:bg-white/50 hover:border-gray-300 transition-colors",
                                        row.description ? "text-gray-900" : "text-gray-400 italic",
                                        readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                                    )}
                                    style={{ width: '100%' }}
                                >
                                    {getDescriptionLabel()}
                                </button>
                            )}
                        </div>

                        {/* ✅ Date - renderizzate dinamicamente in base al tipo */}
                        {dateConfig && dateConfig.showContestationDate && (
                        <div
                            ref={contestationDateContainerRef}
                            onClick={(e) => e.stopPropagation()}
                            onMouseLeave={(e) => {
                                if (isContestationDateEditing && !readOnly) {
                                    const relatedTarget = e.relatedTarget as HTMLElement | null

                                    // ✅ Verifica che relatedTarget sia un Node valido prima di chiamare contains
                                    // Se il mouse si è spostato dentro il container stesso (popover, calendar), non chiudere
                                    if (relatedTarget && relatedTarget instanceof Node && contestationDateContainerRef.current?.contains(relatedTarget)) {
                                        return
                                    }

                                    setTimeout(() => {
                                        // Verifica di nuovo se il mouse è ancora dentro
                                        if (contestationDateContainerRef.current && !contestationDateContainerRef.current.matches(':hover')) {
                                            setIsContestationDateEditing(false)
                                            setContestationDateOpen(false)
                                        }
                                    }, 200)
                                }
                            }}
                            className="flex-shrink-0"
                        >
                            {isContestationDateEditing ? (
                                <Popover open={contestationDateOpen} onOpenChange={(open) => {
                                    setContestationDateOpen(open)
                                    if (!open) {
                                        setIsContestationDateEditing(false)
                                    }
                                }}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            disabled={readOnly}
                                            className={cn(
                                                "inline-flex items-center justify-start text-left font-normal rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background hover:bg-accent hover:text-accent-foreground h-8 whitespace-nowrap",
                                                !row.contestationDate && "text-muted-foreground"
                                            )}
                                            onClick={() => setContestationDateOpen(true)}
                                        >
                                            <CalendarIcon className="mr-1 h-3 w-3" />
                                            {row.contestationDate ? (
                                                format(new Date(row.contestationDate), "dd/MM/yyyy", { locale: it })
                                            ) : (
                                                <span>Seleziona data</span>
                                            )}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={row.contestationDate ? new Date(row.contestationDate) : undefined}
                                            onSelect={(date) => handleDateChange('contestationDate', date)}
                                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            ) : (
                                <button
                                    onClick={() => !readOnly && setIsContestationDateEditing(true)}
                                    onMouseEnter={() => !readOnly && setIsContestationDateEditing(true)}
                                    disabled={readOnly}
                                    className={cn(
                                        "inline-flex items-center justify-start text-left font-normal rounded-md border border-transparent px-2 py-1 text-xs h-8 whitespace-nowrap",
                                        "hover:bg-white/50 hover:border-gray-300 transition-colors",
                                        row.contestationDate ? "text-gray-900" : "text-gray-400 italic",
                                        readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                                    )}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {row.contestationDate ? (
                                        format(new Date(row.contestationDate), "dd/MM/yyyy", { locale: it })
                                    ) : (
                                        <span>{dateConfig.contestationDateLabel}</span>
                                    )}
                                </button>
                            )}
                        </div>
                        )}

                        {/* Data secondaria (es. Esecuzione) */}
                        {dateConfig && dateConfig.showEventDate && (
                        <div
                            ref={eventDateContainerRef}
                            onClick={(e) => e.stopPropagation()}
                            onMouseLeave={(e) => {
                                if (isEventDateEditing && !readOnly) {
                                    const relatedTarget = e.relatedTarget as HTMLElement | null

                                    // ✅ Verifica che relatedTarget sia un Node valido prima di chiamare contains
                                    // Se il mouse si è spostato dentro il container stesso (popover, calendar), non chiudere
                                    if (relatedTarget && relatedTarget instanceof Node && eventDateContainerRef.current?.contains(relatedTarget)) {
                                        return
                                    }

                                    setTimeout(() => {
                                        // Verifica di nuovo se il mouse è ancora dentro
                                        if (eventDateContainerRef.current && !eventDateContainerRef.current.matches(':hover')) {
                                            setIsEventDateEditing(false)
                                            setEventDateOpen(false)
                                        }
                                    }, 200)
                                }
                            }}
                            className="flex-shrink-0"
                        >
                            {isEventDateEditing ? (
                                <Popover open={eventDateOpen} onOpenChange={(open) => {
                                    setEventDateOpen(open)
                                    if (!open) {
                                        setIsEventDateEditing(false)
                                    }
                                }}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            disabled={readOnly}
                                            className={cn(
                                                "inline-flex items-center justify-start text-left font-normal rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background hover:bg-accent hover:text-accent-foreground h-8 whitespace-nowrap",
                                                !row.eventDate && "text-muted-foreground"
                                            )}
                                            onClick={() => setEventDateOpen(true)}
                                        >
                                            <CalendarIcon className="mr-1 h-3 w-3" />
                                            {row.eventDate ? (
                                                format(new Date(row.eventDate), "dd/MM/yyyy", { locale: it })
                                            ) : (
                                                <span>Seleziona data</span>
                                            )}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={row.eventDate ? new Date(row.eventDate) : undefined}
                                            onSelect={(date) => handleDateChange('eventDate', date)}
                                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            ) : (
                                <button
                                    onClick={() => !readOnly && setIsEventDateEditing(true)}
                                    onMouseEnter={() => !readOnly && setIsEventDateEditing(true)}
                                    disabled={readOnly}
                                    className={cn(
                                        "inline-flex items-center justify-start text-left font-normal rounded-md border border-transparent px-2 py-1 text-xs h-8 whitespace-nowrap",
                                        "hover:bg-white/50 hover:border-gray-300 transition-colors",
                                        row.eventDate ? "text-gray-900" : "text-gray-400 italic",
                                        readOnly && "cursor-default hover:bg-transparent hover:border-transparent"
                                    )}
                                >
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {row.eventDate ? (
                                        format(new Date(row.eventDate), "dd/MM/yyyy", { locale: it })
                                    ) : (
                                        <span>{dateConfig.eventDateLabel}</span>
                                    )}
                                </button>
                            )}
                        </div>
                        )}
                    </>
                )}

                {/* ✅ Spazio flessibile per spingere il menu a destra */}
                <div className="flex-1" />

                {/* ✅ Puntini verticali con menu - sempre occupano spazio, visibili su hover */}
                <div
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                >
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-8 w-8 p-0 opacity-0 transition-opacity",
                                    (isHovered || isExpanded) && !readOnly && "opacity-100"
                                )}
                                onClick={(e) => e.stopPropagation()}
                                disabled={readOnly}
                            >
                                <MoreVertical className="h-4 w-4 text-gray-500" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            {onAddRowAbove && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onAddRowAbove(row.id)
                                    }}
                                    disabled={readOnly}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Aggiungi riga sopra
                                </DropdownMenuItem>
                            )}
                            {onAddRowBelow && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onAddRowBelow(row.id)
                                    }}
                                    disabled={readOnly}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Aggiungi riga sotto
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleDelete()
                                }}
                                disabled={readOnly}
                                className="text-red-600 focus:text-red-600"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Elimina
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

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
                    {/* Contenuto espanso - solo Osservazioni e Motivazioni (i controlli sono già nell'header) */}
                    <div className="space-y-3">
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
    )
}
