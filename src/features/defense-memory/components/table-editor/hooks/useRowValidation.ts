import { useState, useCallback, useMemo } from 'react'
import { TableRow, ValidationError, TableValidationResult } from '../types/table.types'
import { validateTable, validateTableRow, getRowErrors, getFieldError } from '../utils/tableValidation'

interface UseRowValidationProps {
    rows: TableRow[]
    validateOnChange?: boolean
    validateOnBlur?: boolean
}

export const useRowValidation = ({
    rows,
    validateOnChange = true,
    validateOnBlur = true
}: UseRowValidationProps) => {
    const [errors, setErrors] = useState<ValidationError[]>([])
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())

    // Validazione completa della tabella
    const validationResult = useMemo((): TableValidationResult => {
        return validateTable(rows)
    }, [rows])

    // Validazione di una singola riga
    const validateSingleRow = useCallback((row: TableRow): ValidationError[] => {
        return validateTableRow(row)
    }, [])

    // Validazione di un campo specifico
    const validateField = useCallback((row: TableRow, field: string): string | null => {
        const rowErrors = validateSingleRow(row)
        return getFieldError(field, row.id, rowErrors)
    }, [validateSingleRow])

    // Aggiorna errori per una riga
    const updateRowErrors = useCallback((row: TableRow) => {
        const rowErrors = validateSingleRow(row)
        setErrors(prev => {
            const otherErrors = prev.filter(error => error.rowId !== row.id)
            return [...otherErrors, ...rowErrors]
        })
    }, [validateSingleRow])

    // Rimuove errori per una riga
    const clearRowErrors = useCallback((rowId: string) => {
        setErrors(prev => prev.filter(error => error.rowId !== rowId))
    }, [])

    // Rimuove errori per un campo specifico
    const clearFieldError = useCallback((rowId: string, field: string) => {
        setErrors(prev => prev.filter(error => !(error.rowId === rowId && error.field === field)))
    }, [])

    // Marca un campo come toccato
    const touchField = useCallback((rowId: string, field: string) => {
        const fieldKey = `${rowId}.${field}`
        setTouchedFields(prev => new Set([...prev, fieldKey]))
    }, [])

    // Verifica se un campo è stato toccato
    const isFieldTouched = useCallback((rowId: string, field: string): boolean => {
        const fieldKey = `${rowId}.${field}`
        return touchedFields.has(fieldKey)
    }, [touchedFields])

    // Gestisce il cambio di un campo con validazione
    const handleFieldChange = useCallback((row: TableRow, field: string, value: any) => {
        if (validateOnChange) {
            touchField(row.id, field)
            updateRowErrors(row)
        }
    }, [validateOnChange, touchField, updateRowErrors])

    // Gestisce il blur di un campo con validazione
    const handleFieldBlur = useCallback((row: TableRow, field: string) => {
        if (validateOnBlur) {
            touchField(row.id, field)
            updateRowErrors(row)
        }
    }, [validateOnBlur, touchField, updateRowErrors])

    // Ottiene errori per una riga
    const getRowErrorsForRow = useCallback((rowId: string): ValidationError[] => {
        return getRowErrors(rowId, errors)
    }, [errors])

    // Ottiene errore per un campo
    const getFieldErrorForField = useCallback((rowId: string, field: string): string | null => {
        return getFieldError(field, rowId, errors)
    }, [errors])

    // Verifica se una riga ha errori
    const hasRowErrors = useCallback((rowId: string): boolean => {
        return getRowErrorsForRow(rowId).length > 0
    }, [getRowErrorsForRow])

    // Verifica se un campo ha errori
    const hasFieldError = useCallback((rowId: string, field: string): boolean => {
        return getFieldErrorForField(rowId, field) !== null
    }, [getFieldErrorForField])

    // Valida tutta la tabella
    const validateAll = useCallback(() => {
        const result = validateTable(rows)
        setErrors(result.errors)
        return result
    }, [rows])

    // Pulisce tutti gli errori
    const clearAllErrors = useCallback(() => {
        setErrors([])
        setTouchedFields(new Set())
    }, [])

    // Pulisce i campi toccati
    const clearTouchedFields = useCallback(() => {
        setTouchedFields(new Set())
    }, [])

    return {
        errors,
        validationResult,
        validateSingleRow,
        validateField,
        updateRowErrors,
        clearRowErrors,
        clearFieldError,
        touchField,
        isFieldTouched,
        handleFieldChange,
        handleFieldBlur,
        getRowErrors: getRowErrorsForRow,
        getFieldError: getFieldErrorForField,
        hasRowErrors,
        hasFieldError,
        validateAll,
        clearAllErrors,
        clearTouchedFields
    }
}
