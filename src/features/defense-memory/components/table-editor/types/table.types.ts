// Import types per blocchi
import { Block } from './blocks.types'

export type CellType =
    | 'nota-libera'
    | 'reato-contestato'
    | 'fatto'
    | 'atto'
    | 'elementi-prova'
    | 'verbale-arresto'
    | 'verbale-sequestro'
    | 'verbale-perquisizione'
    | 'interrogatorio'
    | 'dichiarazioni-testi'
    | 'intercettazioni'

export interface ExtractData {
    content: string
    source: string
    page: number
    isHidden: boolean
}

export interface Motivation {
    id: string
    text: string
    imageDataUrl?: string  // Per snippet immagine OCR (base64 data URL)
    source?: string
    page?: number
    isHidden: boolean
    observation: string
}

export interface TableRow {
    id: string
    order: number
    cellType: CellType
    description: string
    contestationDate?: string
    eventDate?: string
    extract?: ExtractData
    motivations?: Motivation[]
    observations: string
    blocks?: Block[]  // ✅ NUOVO: Blocchi riorganizzabili (estratti + osservazioni)
}

// ✅ Interfaccia per un dettaglio caso (riga nella tabella)
export interface CaseDetail {
    id: string
    label: string // Etichetta (predefinita o personalizzata)
    value: string // Valore
    order: number // Ordine nella tabella
}

export interface PreambleData {
    procura?: string
    tribunale?: string
    gip?: string
    altro?: string
    numeroProcedimento?: string
    affidamentoIncarico?: string
    richiestaQuesito?: string
    dati?: string // ✅ Box DATI: testo libero
    numeroCartelle?: string
    numeroDocumenti?: string
    numeroFogli?: string
    // ✅ NUOVO: Array di dettagli caso (sostituisce i campi fissi)
    caseDetails?: CaseDetail[]
    // ✅ DEPRECATO: Campi fissi mantenuti per retrocompatibilità
    nomeIndagato?: string
    numeroProcedimentoDettaglio?: string
    ufficioProcede?: string
    reatiContestati?: string
    dataLuogo?: string
    ufficioPM?: string
    parteOffesa?: string
    poliziaGiudiziaria?: string
    difensori?: string
    altroDettaglio?: string
}

export interface ConclusionsData {
    conclusioni?: string
    data?: string
    firma?: string
}

export interface DefenseMemoryTableData {
    rows: TableRow[]
    lastUpdated: string
    version: number
    preamble?: PreambleData
    conclusions?: ConclusionsData
}

export interface TableRowFormData {
    cellType: CellType
    description: string
    contestationDate?: string
    eventDate?: string
    extract?: ExtractData
    motivations?: Motivation[]
    observations: string
}

export interface ValidationError {
    field: string
    message: string
    rowId?: string
}

export interface TableValidationResult {
    isValid: boolean
    errors: ValidationError[]
}

export interface DefenseMemoryTableEditorProps {
    praticaId: string
    clienteId?: string
    clienteNome?: string
    initialData?: DefenseMemoryTableData
    onSave?: (data: DefenseMemoryTableData) => void
    onCancel?: () => void
    readOnly?: boolean
    className?: string
}

export interface TableRowProps {
    row: TableRow
    order: number
    onUpdate: (rowId: string, data: Partial<TableRowFormData>) => void
    onDelete: (rowId: string) => void
    onMoveUp?: (rowId: string) => void
    onMoveDown?: (rowId: string) => void
    onAddRowAbove?: (rowId: string) => void
    onAddRowBelow?: (rowId: string) => void
    readOnly?: boolean
    errors?: ValidationError[]
    columnWidths?: {
        number: number
        typeDescription: number
        observations: number
        actions: number
    }
    onCellRefChange?: (rowId: string, element: HTMLDivElement | null) => void
    onCellWidthChange?: (width: number) => void
    onMoveMotivation?: (fromRowId: string, toRowId: string, motivationId: string, toIndex: number) => void
    onResizeStart?: (column: 'typeDescription' | 'observations', e: React.MouseEvent) => void // ✅ Funzione per resize colonne
    defaultExpanded?: boolean // ✅ Se true, la riga parte espansa
    onExpandChange?: (rowId: string, isExpanded: boolean) => void // ✅ Callback quando la riga viene espansa/collassata
}

export interface RowEditFormProps {
    row?: TableRow
    onSave: (data: TableRowFormData) => void
    onCancel: () => void
    isOpen: boolean
    readOnly?: boolean
}

export interface ReatoFormFieldsProps {
    description: string
    contestationDate?: string
    eventDate?: string
    onDescriptionChange: (value: string) => void
    onContestationDateChange: (value: string) => void
    onEventDateChange: (value: string) => void
    errors?: ValidationError[]
    readOnly?: boolean
}

export interface FattoAttoFormFieldsProps {
    description: string
    contestationDate?: string
    eventDate?: string
    onDescriptionChange: (value: string) => void
    onContestationDateChange: (value: string) => void
    onEventDateChange: (value: string) => void
    errors?: ValidationError[]
    readOnly?: boolean
}

export interface ExtractFormFieldsProps {
    extract?: ExtractData
    onExtractChange: (extract: ExtractData) => void
    onExtractRemove: () => void
    readOnly?: boolean
}

export interface ObservationsCellProps {
    row: TableRow
    onUpdate: (data: Partial<TableRowFormData>) => void
    readOnly?: boolean
    errors?: ValidationError[]
    onMoveMotivation?: (fromRowId: string, toRowId: string, motivationId: string, toIndex: number) => void
}
