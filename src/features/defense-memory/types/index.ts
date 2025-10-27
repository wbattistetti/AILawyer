export type ExtractType = 'reato' | 'motivazione' | 'contromotivazione' | 'prova' | 'testimonianza' | 'altro'

export interface ExtractTypeConfig {
    type: ExtractType
    label: string
    color: string
    icon: string
    description: string
}

export const EXTRACT_TYPE_CONFIGS: ExtractTypeConfig[] = [
    {
        type: 'reato',
        label: 'Reato',
        color: '#ef4444', // Rosso
        icon: '⚖️',
        description: 'Reati contestati nel procedimento'
    },
    {
        type: 'motivazione',
        label: 'Motivazione',
        color: '#3b82f6', // Blu
        icon: '📋',
        description: 'Motivazioni dell\'accusa'
    },
    {
        type: 'contromotivazione',
        label: 'Contro-motivazione',
        color: '#10b981', // Verde
        icon: '🛡️',
        description: 'Elementi di difesa e contro-motivazioni'
    },
    {
        type: 'prova',
        label: 'Prova',
        color: '#f59e0b', // Giallo
        icon: '📄',
        description: 'Prove documentali e testimoniali'
    },
    {
        type: 'testimonianza',
        label: 'Testimonianza',
        color: '#8b5cf6', // Viola
        icon: '👤',
        description: 'Testimonianze e dichiarazioni'
    },
    {
        type: 'altro',
        label: 'Altro',
        color: '#6b7280', // Grigio
        icon: '📝',
        description: 'Altri elementi rilevanti'
    }
]

export interface ExtractClassificationData {
    type: ExtractType
    title: string
    description: string
    parentReatoId?: string
    parentMotivazioneId?: string
    notesAnalyst?: string
    notesDescription?: string
    notesStrategy?: string
    notesDefense?: string
    extractDate?: Date
}

export interface ExtractHierarchy {
    reati: Array<{
        id: string
        title: string
        content: string
        motivazioni: Array<{
            id: string
            title: string
            content: string
            contromotivazioni: Array<{
                id: string
                title: string
                content: string
            }>
        }>
    }>
}

export interface DefenseMemoryState {
    selectedExtractType: ExtractType | null
    availableReati: Array<{ id: string; title: string }>
    availableMotivazioni: Array<{ id: string; title: string; parentReatoId: string }>
    classificationData: Partial<ExtractClassificationData>
    isSubmitting: boolean
    error: string | null
}
