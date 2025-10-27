export interface DocumentTemplate {
    id: string
    name: string
    description: string
    sections: DocumentSection[]
    styles: DocumentStyles
    metadata: MetadataConfig
    createdAt: string
    updatedAt: string
}

export interface DocumentSection {
    id: string
    type: 'header' | 'content' | 'notes' | 'custom'
    title?: string
    extractTypes?: ExtractType[]
    order: number
    editable: boolean
    template: string // HTML template con handlebars
    styles?: SectionStyles
    conditions?: SectionConditions
}

export interface DocumentStyles {
    primaryColor: string
    secondaryColor: string
    fontSize: string
    lineHeight: string
    fontFamily: string
    marginTop: string
    marginBottom: string
    marginLeft: string
    marginRight: string
    pageBreakBefore?: boolean
    pageBreakAfter?: boolean
}

export interface SectionStyles {
    backgroundColor?: string
    borderColor?: string
    borderWidth?: string
    padding?: string
    margin?: string
    borderRadius?: string
}

export interface SectionConditions {
    showIfEmpty?: boolean
    minExtracts?: number
    maxExtracts?: number
    requiredExtractTypes?: ExtractType[]
}

export interface MetadataConfig {
    showClientName: boolean
    showCaseNumber: boolean
    showDate: boolean
    showAnalyst: boolean
    showPageNumbers: boolean
    showTableOfContents: boolean
    customFields?: CustomField[]
}

export interface CustomField {
    id: string
    label: string
    value: string
    editable: boolean
    type: 'text' | 'date' | 'number' | 'select'
    options?: string[] // per tipo select
}

export interface DocumentRenderData {
    template: DocumentTemplate
    extracts: Estratto[]
    metadata: {
        clientName: string
        caseNumber: string
        date: string
        analystName: string
        pageNumbers: boolean
    }
    customData?: Record<string, any>
}

export interface TemplateEngine {
    render(template: string, data: any): string
    registerHelper(name: string, fn: Function): void
    registerPartial(name: string, template: string): void
}

// Template predefiniti
export const DEFAULT_TEMPLATES: DocumentTemplate[] = [
    {
        id: 'standard',
        name: 'Memoria Difensiva Standard',
        description: 'Layout standard per memorie difensive',
        sections: [
            {
                id: 'header',
                type: 'header',
                title: 'MEMORIA DIFENSIVA',
                order: 1,
                editable: false,
                template: 'header-standard.html'
            },
            {
                id: 'reati',
                type: 'content',
                title: 'REATI CONTESTATI',
                extractTypes: ['reato'],
                order: 2,
                editable: true,
                template: 'reati-standard.html'
            },
            {
                id: 'motivazioni',
                type: 'content',
                title: 'MOTIVAZIONI',
                extractTypes: ['motivazione'],
                order: 3,
                editable: true,
                template: 'motivazioni-standard.html'
            },
            {
                id: 'contromotivazioni',
                type: 'content',
                title: 'CONTRO-MOTIVAZIONI',
                extractTypes: ['contromotivazione'],
                order: 4,
                editable: true,
                template: 'contromotivazioni-standard.html'
            },
            {
                id: 'prove',
                type: 'content',
                title: 'PROVE',
                extractTypes: ['prova'],
                order: 5,
                editable: true,
                template: 'prove-standard.html'
            },
            {
                id: 'testimonianze',
                type: 'content',
                title: 'TESTIMONIANZE',
                extractTypes: ['testimonianza'],
                order: 6,
                editable: true,
                template: 'testimonianze-standard.html'
            },
            {
                id: 'note',
                type: 'notes',
                title: 'NOTE STRATEGICHE',
                order: 7,
                editable: true,
                template: 'note-standard.html'
            }
        ],
        styles: {
            primaryColor: '#1e40af',
            secondaryColor: '#64748b',
            fontSize: '12pt',
            lineHeight: '1.6',
            fontFamily: 'Times New Roman, serif',
            marginTop: '2cm',
            marginBottom: '2cm',
            marginLeft: '2.5cm',
            marginRight: '2.5cm'
        },
        metadata: {
            showClientName: true,
            showCaseNumber: true,
            showDate: true,
            showAnalyst: true,
            showPageNumbers: true,
            showTableOfContents: true
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
]
