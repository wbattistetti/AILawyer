import { DocumentTemplate, DocumentRenderData, TemplateEngine } from '../types/templates'
import { Estratto } from '@/types'

export class HandlebarsTemplateEngine implements TemplateEngine {
    private helpers: Map<string, Function> = new Map()
    private partials: Map<string, string> = new Map()

    constructor() {
        this.registerDefaultHelpers()
    }

    private registerDefaultHelpers() {
        // Helper per formattare date
        this.registerHelper('formatDate', (date: string) => {
            return new Date(date).toLocaleDateString('it-IT')
        })

        // Helper per formattare testo
        this.registerHelper('formatText', (text: string, maxLength: number = 100) => {
            if (text.length <= maxLength) return text
            return text.substring(0, maxLength) + '...'
        })

        // Helper per contare elementi
        this.registerHelper('count', (array: any[]) => {
            return array ? array.length : 0
        })

        // Helper per verificare se un array ha elementi
        this.registerHelper('hasItems', (array: any[]) => {
            return array && array.length > 0
        })

        // Helper per ottenere colore per tipo
        this.registerHelper('getTypeColor', (type: string) => {
            const colors: Record<string, string> = {
                'reato': '#ef4444',
                'motivazione': '#3b82f6',
                'contromotivazione': '#10b981',
                'prova': '#f59e0b',
                'testimonianza': '#8b5cf6',
                'altro': '#6b7280'
            }
            return colors[type] || '#6b7280'
        })

        // Helper per ottenere icona per tipo
        this.registerHelper('getTypeIcon', (type: string) => {
            const icons: Record<string, string> = {
                'reato': '⚖️',
                'motivazione': '📋',
                'contromotivazione': '🛡️',
                'prova': '📄',
                'testimonianza': '👤',
                'altro': '📝'
            }
            return icons[type] || '📝'
        })
    }

    registerHelper(name: string, fn: Function): void {
        this.helpers.set(name, fn)
    }

    registerPartial(name: string, template: string): void {
        this.partials.set(name, template)
    }

    render(template: string, data: any): string {
        let result = template

        // Sostituisce i placeholder {{variable}}
        result = result.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
            const trimmed = expression.trim()

            // Gestisce helper {{helperName arg1 arg2}}
            if (trimmed.includes(' ')) {
                const [helperName, ...args] = trimmed.split(' ')
                const helper = this.helpers.get(helperName)
                if (helper) {
                    try {
                        return helper(...args.map(arg => this.evaluateExpression(arg, data)))
                    } catch (error) {
                        console.warn(`Helper ${helperName} error:`, error)
                        return match
                    }
                }
            }

            // Gestisce condizioni {{#if condition}}...{{/if}}
            if (trimmed.startsWith('#if ')) {
                const condition = trimmed.substring(4)
                const value = this.evaluateExpression(condition, data)
                return value ? '' : ''
            }

            // Gestisce loop {{#each array}}...{{/each}}
            if (trimmed.startsWith('#each ')) {
                const arrayPath = trimmed.substring(6)
                const array = this.evaluateExpression(arrayPath, data)
                if (Array.isArray(array)) {
                    return array.map((item, index) => {
                        const itemData = { ...data, ...item, index }
                        return this.render(template, itemData)
                    }).join('')
                }
                return ''
            }

            // Gestisce chiusura {{/if}} e {{/each}}
            if (trimmed.startsWith('/')) {
                return ''
            }

            // Valuta espressione normale
            return this.evaluateExpression(trimmed, data)
        })

        return result
    }

    private evaluateExpression(expression: string, data: any): any {
        // Gestisce percorsi nested come "metadata.clientName"
        const parts = expression.split('.')
        let result = data

        for (const part of parts) {
            if (result && typeof result === 'object') {
                result = result[part]
            } else {
                return undefined
            }
        }

        return result
    }
}

export class DocumentRenderer {
    private engine: TemplateEngine
    private templates: Map<string, string> = new Map()

    constructor() {
        this.engine = new HandlebarsTemplateEngine()
        this.loadDefaultTemplates()
    }

    private async loadDefaultTemplates() {
        try {
            // Carica template HTML
            const templates = [
                'header-standard.html',
                'reati-standard.html',
                'prove-standard.html',
                'note-standard.html'
            ]

            for (const templateName of templates) {
                try {
                    const response = await fetch(`/src/features/defense-memory/templates/${templateName}`)
                    if (response.ok) {
                        const content = await response.text()
                        this.templates.set(templateName, content)
                    }
                } catch (error) {
                    console.warn(`Could not load template ${templateName}:`, error)
                }
            }
        } catch (error) {
            console.warn('Could not load default templates:', error)
        }
    }

    async renderDocument(data: DocumentRenderData): Promise<string> {
        const { template, extracts, metadata } = data

        // Organizza estratti per tipo e gerarchia
        const organizedData = this.organizeExtracts(extracts)

        // Renderizza ogni sezione
        const sectionsHtml = await Promise.all(
            template.sections.map(async (section) => {
                const sectionTemplate = this.templates.get(section.template) || this.getDefaultTemplate(section.type)
                const sectionData = {
                    section,
                    metadata,
                    ...organizedData
                }
                return this.engine.render(sectionTemplate, sectionData)
            })
        )

        // Combina tutto in un documento completo
        const documentHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${metadata.title || 'Memoria Difensiva'}</title>
          <style>
            ${this.getDocumentStyles(template.styles)}
          </style>
        </head>
        <body class="document-template">
          ${sectionsHtml.join('\n')}
        </body>
      </html>
    `

        return documentHtml
    }

    private organizeExtracts(extracts: Estratto[]) {
        const reati = extracts.filter(e => e.type === 'reato')
        const motivazioni = extracts.filter(e => e.type === 'motivazione')
        const contromotivazioni = extracts.filter(e => e.type === 'contromotivazione')
        const prove = extracts.filter(e => e.type === 'prova')
        const testimonianze = extracts.filter(e => e.type === 'testimonianza')
        const altro = extracts.filter(e => e.type === 'altro')

        // Organizza gerarchia
        const reatiWithChildren = reati.map(reato => ({
            ...reato,
            motivazioni: motivazioni
                .filter(m => m.parentReatoId === reato.id)
                .map(motivazione => ({
                    ...motivazione,
                    contromotivazioni: contromotivazioni.filter(c => c.parentMotivazioneId === motivazione.id)
                }))
        }))

        return {
            reati: reatiWithChildren,
            prove,
            testimonianze,
            altro,
            totalExtracts: extracts.length
        }
    }

    private getDefaultTemplate(type: string): string {
        const templates: Record<string, string> = {
            'header': '<div class="document-header"><h1>{{metadata.title}}</h1></div>',
            'content': '<div class="section"><h2>{{section.title}}</h2><p>Contenuto da implementare</p></div>',
            'notes': '<div class="section"><h2>{{section.title}}</h2><p>Note da implementare</p></div>'
        }
        return templates[type] || '<div class="section"><h2>{{section.title}}</h2></div>'
    }

    private getDocumentStyles(styles: any): string {
        // Carica CSS base
        const baseStyles = `
      .document-template {
        font-family: ${styles.fontFamily || 'Times New Roman, serif'};
        font-size: ${styles.fontSize || '12pt'};
        line-height: ${styles.lineHeight || '1.6'};
        max-width: 800px;
        margin: 0 auto;
        padding: ${styles.marginTop || '2cm'} ${styles.marginRight || '2.5cm'} ${styles.marginBottom || '2cm'} ${styles.marginLeft || '2.5cm'};
        background: white;
        color: #333;
      }

      :root {
        --primary-color: ${styles.primaryColor || '#1e40af'};
        --secondary-color: ${styles.secondaryColor || '#64748b'};
      }
    `

        // Aggiungi CSS specifico per template
        return baseStyles + this.getTemplateSpecificStyles()
    }

    private getTemplateSpecificStyles(): string {
        // CSS per i template specifici
        return `
      .section-title {
        color: var(--primary-color);
        border-bottom: 2px solid var(--primary-color);
        padding-bottom: 0.5rem;
        margin-bottom: 1.5rem;
      }

      .notes-content.editable {
        border: 1px solid #d1d5db;
        border-radius: 4px;
        padding: 0.75rem;
        min-height: 60px;
        cursor: text;
      }

      .notes-content.editable:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(30, 64, 175, 0.1);
      }
    `
    }
}
