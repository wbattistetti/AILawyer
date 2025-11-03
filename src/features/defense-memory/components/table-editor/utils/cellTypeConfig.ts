import { CellType } from '../types/table.types'

export interface DateFieldConfig {
    showContestationDate: boolean
    showEventDate: boolean
    contestationDateLabel: string
    eventDateLabel: string
}

/**
 * Configurazione date per ogni tipo di cella.
 * contestationDate e eventDate vengono riutilizzati con significati diversi per tipo.
 */
export function getDateFieldsConfig(cellType: CellType): DateFieldConfig {
    switch (cellType) {
        case 'reato-contestato':
            return {
                showContestationDate: true,
                showEventDate: true,
                contestationDateLabel: 'Data Contestazione',
                eventDateLabel: 'Data Reato'
            }

        case 'elementi-prova':
            return {
                showContestationDate: true,
                showEventDate: false,
                contestationDateLabel: 'Data',
                eventDateLabel: ''
            }

        case 'verbale-arresto':
            return {
                showContestationDate: true,
                showEventDate: true,
                contestationDateLabel: 'Data Ordinanza',
                eventDateLabel: 'Data Esecuzione'
            }

        case 'verbale-sequestro':
            return {
                showContestationDate: true,
                showEventDate: true,
                contestationDateLabel: 'Data Ordinanza',
                eventDateLabel: 'Data Esecuzione'
            }

        case 'verbale-perquisizione':
            return {
                showContestationDate: true,
                showEventDate: true,
                contestationDateLabel: 'Data Ordinanza',
                eventDateLabel: 'Data Esecuzione'
            }

        case 'interrogatorio':
            return {
                showContestationDate: true,
                showEventDate: true,
                contestationDateLabel: 'Data Ordinanza',
                eventDateLabel: 'Data Esecuzione'
            }

        case 'dichiarazioni-testi':
            return {
                showContestationDate: true,
                showEventDate: false,
                contestationDateLabel: 'Data',
                eventDateLabel: ''
            }

        case 'intercettazioni':
            return {
                showContestationDate: true,
                showEventDate: false,
                contestationDateLabel: 'Data',
                eventDateLabel: ''
            }

        case 'atto':
            return {
                showContestationDate: true,
                showEventDate: false,
                contestationDateLabel: 'Data',
                eventDateLabel: ''
            }

        case 'fatto':
            return {
                showContestationDate: true,
                showEventDate: false,
                contestationDateLabel: 'Data Fatto',
                eventDateLabel: ''
            }

        default:
            return {
                showContestationDate: false,
                showEventDate: false,
                contestationDateLabel: '',
                eventDateLabel: ''
            }
    }
}

/**
 * Restituisce il label leggibile per ogni tipo
 */
export function getCellTypeLabel(cellType: CellType): string {
    const labels: Record<CellType, string> = {
        'reato-contestato': 'Reato contestato',
        'fatto': 'Fatto',
        'atto': 'Atto',
        'elementi-prova': 'Elementi di prova',
        'verbale-arresto': 'Verbale arresto',
        'verbale-sequestro': 'Verbale sequestro',
        'verbale-perquisizione': 'Verbale perquisizione',
        'interrogatorio': 'Interrogatorio',
        'dichiarazioni-testi': 'Dichiarazioni testi',
        'intercettazioni': 'Intercettazioni'
    }
    return labels[cellType] || cellType
}

