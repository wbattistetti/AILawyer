import { TableRow, ValidationError, TableValidationResult } from '../types/table.types'
import { VALIDATION_RULES } from '../types/validation.types'

export const validateTableRow = (row: TableRow): ValidationError[] => {
    const errors: ValidationError[] = []
    const rules = VALIDATION_RULES[row.cellType] || []

    for (const rule of rules) {
        const value = row[rule.field]
        const error = rule.validator(value, row)

        if (error) {
            errors.push({
                field: rule.field as string,
                message: error,
                rowId: row.id
            })
        }
    }

    return errors
}

export const validateTable = (rows: TableRow[]): TableValidationResult => {
    const allErrors: ValidationError[] = []

    for (const row of rows) {
        const rowErrors = validateTableRow(row)
        allErrors.push(...rowErrors)
    }

    return {
        isValid: allErrors.length === 0,
        errors: allErrors
    }
}

export const getRowErrors = (rowId: string, errors: ValidationError[]): ValidationError[] => {
    return errors.filter(error => error.rowId === rowId)
}

export const getFieldError = (field: string, rowId: string, errors: ValidationError[]): string | null => {
    const error = errors.find(e => e.field === field && e.rowId === rowId)
    return error?.message || null
}

export const hasRowErrors = (rowId: string, errors: ValidationError[]): boolean => {
    return errors.some(error => error.rowId === rowId)
}

export const validateDate = (date: string): boolean => {
    if (!date) return false
    const dateObj = new Date(date)
    return !isNaN(dateObj.getTime()) && dateObj <= new Date()
}

export const validateDateRange = (startDate: string, endDate: string): boolean => {
    if (!startDate || !endDate) return true
    return new Date(startDate) <= new Date(endDate)
}
