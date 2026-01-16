import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ConclusionsData } from '../types/table.types'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ConclusionsAccordionProps {
    conclusions: ConclusionsData
    onUpdate: (conclusions: ConclusionsData) => void
    readOnly?: boolean
    defaultExpanded?: boolean
}

export const ConclusionsAccordion: React.FC<ConclusionsAccordionProps> = ({
    conclusions,
    onUpdate,
    readOnly = false,
    defaultExpanded = false
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    const handleChange = (field: keyof ConclusionsData, value: string) => {
        if (readOnly) return
        onUpdate({
            ...conclusions,
            [field]: value
        })
    }

    return (
        <div className="border border-gray-300 rounded-lg bg-white shadow-sm mt-2">
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => !readOnly && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                    )}
                    <h3 className="text-lg font-semibold text-gray-800">Conclusioni Finali - data e Firma</h3>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 border-t border-gray-200 space-y-4">
                    <div>
                        <Label htmlFor="conclusioni">Conclusioni Finali</Label>
                        <Textarea
                            id="conclusioni"
                            value={conclusions.conclusioni || ''}
                            onChange={(e) => handleChange('conclusioni', e.target.value)}
                            readOnly={readOnly}
                            placeholder="Inserisci le conclusioni finali dell'analisi..."
                            rows={8}
                            className="mt-1"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="data">Data</Label>
                            <Input
                                id="data"
                                type="date"
                                value={conclusions.data || ''}
                                onChange={(e) => handleChange('data', e.target.value)}
                                readOnly={readOnly}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="firma">Firma</Label>
                            <Input
                                id="firma"
                                value={conclusions.firma || ''}
                                onChange={(e) => handleChange('firma', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Nome e cognome"
                                className="mt-1"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
