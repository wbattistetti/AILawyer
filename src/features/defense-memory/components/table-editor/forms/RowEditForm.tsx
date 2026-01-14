import React, { useState, useEffect } from 'react'
import { RowEditFormProps, TableRowFormData, CellType } from '../types/table.types'
import { ReatoFormFields } from './ReatoFormFields'
import { FattoAttoFormFields } from './FattoAttoFormFields'
import { ExtractFormFields } from './ExtractFormFields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createEmptyRow } from '../utils/tableSerialization'

import { getCellTypeLabel, getSortedCellTypes } from '../utils/cellTypeConfig'

// ✅ Usa la lista centralizzata da cellTypeConfig
const CELL_TYPE_OPTIONS: { value: CellType; label: string }[] = [
    // Nota libera sempre prima
    { value: 'nota-libera', label: getCellTypeLabel('nota-libera') },
    // Poi tutte le altre in ordine alfabetico
    ...getSortedCellTypes().map(type => ({
        value: type,
        label: getCellTypeLabel(type)
    }))
]

export const RowEditForm: React.FC<RowEditFormProps> = ({
    row,
    onSave,
    onCancel,
    isOpen,
    readOnly = false
}) => {
    const [formData, setFormData] = useState<TableRowFormData>(() => {
        if (row) {
            return {
                cellType: row.cellType,
                description: row.description,
                contestationDate: row.contestationDate,
                eventDate: row.eventDate,
                extract: row.extract,
                observations: row.observations
            }
        }
        return {
            cellType: 'fatto',
            description: '',
            observations: ''
        }
    })

    const [errors, setErrors] = useState<Record<string, string>>({})

    // Reset form quando si apre/chiude
    useEffect(() => {
        if (isOpen) {
            if (row) {
                setFormData({
                    cellType: row.cellType,
                    description: row.description,
                    contestationDate: row.contestationDate,
                    eventDate: row.eventDate,
                    extract: row.extract,
                    observations: row.observations
                })
            } else {
                setFormData({
                    cellType: 'fatto',
                    description: '',
                    observations: ''
                })
            }
            setErrors({})
        }
    }, [isOpen, row])

    const handleFieldChange = (field: keyof TableRowFormData, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))

        // Clear error when field changes
        if (errors[field]) {
            setErrors(prev => ({
                ...prev,
                [field]: ''
            }))
        }
    }

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {}

        // Validazione descrizione
        if (!formData.description.trim()) {
            newErrors.description = 'Descrizione obbligatoria'
        }

        // Validazione specifica per reato contestato
        if (formData.cellType === 'reato-contestato') {
            if (!formData.contestationDate) {
                newErrors.contestationDate = 'Data contestazione obbligatoria'
            }
            if (!formData.eventDate) {
                newErrors.eventDate = 'Data evento obbligatoria'
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSave = () => {
        if (validateForm()) {
            onSave(formData)
        }
    }

    const handleExtractChange = (extract: any) => {
        handleFieldChange('extract', extract)
    }

    const handleExtractRemove = () => {
        handleFieldChange('extract', undefined)
    }

    const isReatoContestato = formData.cellType === 'reato-contestato'

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {row ? 'Modifica riga' : 'Aggiungi riga'} - Analisi atti
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Tipo di cella */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Tipo di cella *</Label>
                        <Select
                            value={formData.cellType}
                            onValueChange={(value: CellType) => handleFieldChange('cellType', value)}
                            disabled={readOnly}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleziona tipo di cella" />
                            </SelectTrigger>
                            <SelectContent>
                                {CELL_TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Campi specifici per tipo */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                {isReatoContestato ? 'Dettagli Reato Contestato' : 'Dettagli'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isReatoContestato ? (
                                <ReatoFormFields
                                    description={formData.description}
                                    contestationDate={formData.contestationDate}
                                    eventDate={formData.eventDate}
                                    onDescriptionChange={(value) => handleFieldChange('description', value)}
                                    onContestationDateChange={(value) => handleFieldChange('contestationDate', value)}
                                    onEventDateChange={(value) => handleFieldChange('eventDate', value)}
                                    errors={Object.entries(errors).map(([field, message]) => ({ field, message }))}
                                    readOnly={readOnly}
                                />
                            ) : (
                                <FattoAttoFormFields
                                    description={formData.description}
                                    contestationDate={formData.contestationDate}
                                    eventDate={formData.eventDate}
                                    onDescriptionChange={(value) => handleFieldChange('description', value)}
                                    onContestationDateChange={(value) => handleFieldChange('contestationDate', value)}
                                    onEventDateChange={(value) => handleFieldChange('eventDate', value)}
                                    errors={Object.entries(errors).map(([field, message]) => ({ field, message }))}
                                    readOnly={readOnly}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Estratto (solo per reato contestato) */}
                    {isReatoContestato && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Estratto Motivazione</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ExtractFormFields
                                    extract={formData.extract}
                                    onExtractChange={handleExtractChange}
                                    onExtractRemove={handleExtractRemove}
                                    readOnly={readOnly}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Osservazioni */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Osservazioni</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    {isReatoContestato ? 'Osservazioni:' : 'Osservazioni:'}
                                </Label>
                                <Textarea
                                    value={formData.observations}
                                    onChange={(e) => handleFieldChange('observations', e.target.value)}
                                    placeholder="Inserisci le tue osservazioni..."
                                    className="min-h-[100px]"
                                    disabled={readOnly}
                                />
                                {errors.observations && (
                                    <p className="text-sm text-red-500">{errors.observations}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        Annulla
                    </Button>
                    {!readOnly && (
                        <Button onClick={handleSave}>
                            {row ? 'Salva modifiche' : 'Aggiungi riga'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
