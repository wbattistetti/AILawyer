import { CellType } from '../types/table.types'

/**
 * Restituisce il label leggibile per ogni tipo
 */
export function getCellTypeLabel(cellType: CellType): string {
    const labels: Record<CellType, string> = {
        'nota-libera': 'Nota libera',
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

/**
 * ✅ Lista completa di tutti i tipi disponibili (esclusa nota-libera che va sempre prima)
 * SINGLE SOURCE OF TRUTH: modifica questa lista per aggiungere/rimuovere tipi
 */
export const ALL_CELL_TYPES: readonly CellType[] = [
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
] as const

/**
 * ✅ Restituisce tutti i tipi ordinati alfabeticamente (esclusa nota-libera)
 */
export function getSortedCellTypes(): CellType[] {
    return [...ALL_CELL_TYPES].sort((a, b) =>
        getCellTypeLabel(a).localeCompare(getCellTypeLabel(b))
    )
}

/**
 * ✅ Restituisce tutti i tipi disponibili per il dropdown, con nota-libera sempre prima
 * Utile per ottenere la lista completa in ordine corretto
 */
export function getAllCellTypesForDropdown(): CellType[] {
    return ['nota-libera', ...getSortedCellTypes()]
}

/**
 * ✅ Helper per filtri: restituisce tutti i tipi di verbali
 */
export function getVerbaliTypes(): CellType[] {
    return ['verbale-arresto', 'verbale-sequestro', 'verbale-perquisizione']
}

/**
 * ✅ Helper per filtri: restituisce tutti i tipi principali (esclusa nota-libera)
 */
export function getMainCellTypes(): CellType[] {
    return [...ALL_CELL_TYPES]
}

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

        case 'nota-libera':
            return {
                showContestationDate: false,
                showEventDate: false,
                contestationDateLabel: '',
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

