import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PreambleData } from '../types/table.types'
import { Input } from '@/components/ui/input'
import { HeaderTable } from './HeaderTable'
import { PrefixedTextarea } from './PrefixedTextarea'
import { CaseDetailsTable } from './CaseDetailsTable'
import { cn } from '@/lib/utils'

interface PreambleAccordionProps {
    preamble: PreambleData
    onUpdate: (preamble: PreambleData) => void
    readOnly?: boolean
    defaultExpanded?: boolean
}

export const PreambleAccordion: React.FC<PreambleAccordionProps> = ({
    preamble,
    onUpdate,
    readOnly = false,
    defaultExpanded = false
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    // ✅ Migrazione: se non ci sono caseDetails ma ci sono i campi vecchi, migra i dati
    useEffect(() => {
        if (!preamble.caseDetails || preamble.caseDetails.length === 0) {
            const hasOldFields = preamble.nomeIndagato ||
                                 preamble.numeroProcedimentoDettaglio ||
                                 preamble.ufficioProcede ||
                                 preamble.reatiContestati ||
                                 preamble.dataLuogo ||
                                 preamble.ufficioPM ||
                                 preamble.parteOffesa ||
                                 preamble.poliziaGiudiziaria ||
                                 preamble.difensori ||
                                 preamble.altroDettaglio

            if (hasOldFields) {
                const migratedDetails = []
                let order = 0

                if (preamble.nomeIndagato) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Nome indagato/imputato',
                        value: preamble.nomeIndagato,
                        order: order++
                    })
                }
                if (preamble.numeroProcedimentoDettaglio) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Nr. procedimento',
                        value: preamble.numeroProcedimentoDettaglio,
                        order: order++
                    })
                }
                if (preamble.ufficioProcede) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Ufficio che procede',
                        value: preamble.ufficioProcede,
                        order: order++
                    })
                }
                if (preamble.reatiContestati) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Reato/i contestati',
                        value: preamble.reatiContestati,
                        order: order++
                    })
                }
                if (preamble.dataLuogo) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Data e luogo',
                        value: preamble.dataLuogo,
                        order: order++
                    })
                }
                if (preamble.ufficioPM) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Ufficio del P.M.',
                        value: preamble.ufficioPM,
                        order: order++
                    })
                }
                if (preamble.parteOffesa) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Parte offesa',
                        value: preamble.parteOffesa,
                        order: order++
                    })
                }
                if (preamble.poliziaGiudiziaria) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Polizia Giudiziaria',
                        value: preamble.poliziaGiudiziaria,
                        order: order++
                    })
                }
                if (preamble.difensori) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Difensore/i',
                        value: preamble.difensori,
                        order: order++
                    })
                }
                if (preamble.altroDettaglio) {
                    migratedDetails.push({
                        id: `detail_migrated_${order}`,
                        label: 'Altro',
                        value: preamble.altroDettaglio,
                        order: order++
                    })
                }

                if (migratedDetails.length > 0) {
                    onUpdate({
                        ...preamble,
                        caseDetails: migratedDetails
                    })
                }
            }
        }
    }, []) // Solo al mount

    const handleChange = (field: keyof PreambleData, value: string) => {
        if (readOnly) return
        onUpdate({
            ...preamble,
            [field]: value
        })
    }

    const handleCaseDetailsUpdate = (caseDetails: any[]) => {
        if (readOnly) return
        onUpdate({
            ...preamble,
            caseDetails
        })
    }

    return (
        <div className="border border-gray-300 rounded-lg bg-white shadow-sm mb-2">
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
                    <h3 className="text-lg font-semibold text-gray-800">Preambolo</h3>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 border-t border-gray-200 space-y-4">
                    {/* ✅ Tabella 1: Header (quasi fissa) */}
                    <HeaderTable
                        preamble={preamble}
                        onUpdate={onUpdate}
                        readOnly={readOnly}
                    />

                    {/* ✅ Affidamento Incarico: textarea con prefisso fisso */}
                    <PrefixedTextarea
                        prefix="Affidamento incarico:"
                        value={preamble.affidamentoIncarico || ''}
                        onChange={(value) => handleChange('affidamentoIncarico', value)}
                        readOnly={readOnly}
                        placeholder="(parte dove viene descritto l'incarico dell'avvocato....data ora.....)"
                        rows={3}
                    />

                    {/* ✅ Richiesta Quesito: textarea con prefisso fisso */}
                    <PrefixedTextarea
                        prefix="Richiesta quesito:"
                        value={preamble.richiestaQuesito || ''}
                        onChange={(value) => handleChange('richiestaQuesito', value)}
                        readOnly={readOnly}
                        placeholder="Il Consulente legga gli atti del processo e rilevi eventuali anomalia..."
                        rows={3}
                    />

                    {/* ✅ DATI: textarea libera */}
                    <div className="border border-gray-300 rounded-md">
                        <Input
                            value={preamble.dati || ''}
                            onChange={(e) => handleChange('dati', e.target.value)}
                            readOnly={readOnly}
                            placeholder="Es: Numero 30 cartelle di file contenenti 30 documenti PDF per un totale di 131 fogli."
                            className="border-0 focus-visible:ring-0"
                        />
                    </div>

                    {/* ✅ Tabella 2: Dettagli Caso (dinamica) */}
                    <CaseDetailsTable
                        details={preamble.caseDetails || []}
                        onUpdate={handleCaseDetailsUpdate}
                        readOnly={readOnly}
                    />
                </div>
            )}
        </div>
    )
}
