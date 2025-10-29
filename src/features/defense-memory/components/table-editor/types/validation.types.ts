import { CellType, TableRow, ValidationError } from './table.types'

export interface ValidationRule<T = any> {
  field: keyof TableRow
  validator: (value: T, row: TableRow) => string | null
  required?: boolean
}

export interface CellTypeValidationRules {
  [K in CellType]: ValidationRule[]
}

export const VALIDATION_RULES: CellTypeValidationRules = {
  'reato-contestato': [
    {
      field: 'description',
      validator: (value: string) => value.trim().length === 0 ? 'Descrizione obbligatoria' : null,
      required: true
    },
    {
      field: 'contestationDate',
      validator: (value: string) => !value ? 'Data contestazione obbligatoria' : null,
      required: true
    },
    {
      field: 'eventDate',
      validator: (value: string) => !value ? 'Data evento obbligatoria' : null,
      required: true
    }
  ],
  'fatto': [
    {
      field: 'description',
      validator: (value: string) => value.trim().length === 0 ? 'Descrizione obbligatoria' : null,
      required: true
    }
  ],
  'atto': [
    {
      field: 'description',
      validator: (value: string) => value.trim().length === 0 ? 'Descrizione obbligatoria' : null,
      required: true
    }
  ]
}

export interface ValidationConfig {
  validateOnChange: boolean
  validateOnBlur: boolean
  showInlineErrors: boolean
  stopOnFirstError: boolean
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  validateOnChange: true,
  validateOnBlur: true,
  showInlineErrors: true,
  stopOnFirstError: false
}
