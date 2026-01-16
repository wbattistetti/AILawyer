import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PreambleData } from '../types/table.types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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

    const handleChange = (field: keyof PreambleData, value: string) => {
        if (readOnly) return
        onUpdate({
            ...preamble,
            [field]: value
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
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="procura">Procura della Repubblica</Label>
                            <Input
                                id="procura"
                                value={preamble.procura || ''}
                                onChange={(e) => handleChange('procura', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Procura della Repubblica di Roma"
                            />
                        </div>
                        <div>
                            <Label htmlFor="tribunale">Tribunale</Label>
                            <Input
                                id="tribunale"
                                value={preamble.tribunale || ''}
                                onChange={(e) => handleChange('tribunale', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Tribunale di Roma"
                            />
                        </div>
                        <div>
                            <Label htmlFor="gip">GIP</Label>
                            <Input
                                id="gip"
                                value={preamble.gip || ''}
                                onChange={(e) => handleChange('gip', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: GIP"
                            />
                        </div>
                        <div>
                            <Label htmlFor="altro">Altro</Label>
                            <Input
                                id="altro"
                                value={preamble.altro || ''}
                                onChange={(e) => handleChange('altro', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Altro"
                            />
                        </div>
                        <div className="col-span-2">
                            <Label htmlFor="numeroProcedimento">Numero Procedimento</Label>
                            <Input
                                id="numeroProcedimento"
                                value={preamble.numeroProcedimento || ''}
                                onChange={(e) => handleChange('numeroProcedimento', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Proc. Penale n. 43334/21 R.G."
                            />
                        </div>
                    </div>

                    {/* Affidamento Incarico */}
                    <div>
                        <Label htmlFor="affidamentoIncarico">Affidamento incarico</Label>
                        <Textarea
                            id="affidamentoIncarico"
                            value={preamble.affidamentoIncarico || ''}
                            onChange={(e) => handleChange('affidamentoIncarico', e.target.value)}
                            readOnly={readOnly}
                            placeholder="(parte dove viene descritto l'incarico dell'avvocato....data ora.....)"
                            rows={3}
                            className="mt-1"
                        />
                    </div>

                    {/* Richiesta Quesito */}
                    <div>
                        <Label htmlFor="richiestaQuesito">Richiesta quesito</Label>
                        <Textarea
                            id="richiestaQuesito"
                            value={preamble.richiestaQuesito || ''}
                            onChange={(e) => handleChange('richiestaQuesito', e.target.value)}
                            readOnly={readOnly}
                            placeholder="Il Consulente legga gli atti del processo e rilevi eventuali anomalia..."
                            rows={3}
                            className="mt-1"
                        />
                    </div>

                    {/* DATI */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="numeroCartelle">Numero Cartelle</Label>
                            <Input
                                id="numeroCartelle"
                                value={preamble.numeroCartelle || ''}
                                onChange={(e) => handleChange('numeroCartelle', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: 30"
                            />
                        </div>
                        <div>
                            <Label htmlFor="numeroDocumenti">Numero Documenti PDF</Label>
                            <Input
                                id="numeroDocumenti"
                                value={preamble.numeroDocumenti || ''}
                                onChange={(e) => handleChange('numeroDocumenti', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: 30"
                            />
                        </div>
                        <div>
                            <Label htmlFor="numeroFogli">Numero Fogli Totali</Label>
                            <Input
                                id="numeroFogli"
                                value={preamble.numeroFogli || ''}
                                onChange={(e) => handleChange('numeroFogli', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: 131"
                            />
                        </div>
                    </div>

                    {/* Tabella Dettagli Caso */}
                    <div>
                        <Label className="text-base font-semibold mb-2 block">Dettagli Caso</Label>
                        <div className="space-y-2 border border-gray-200 rounded p-3 bg-gray-50">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label htmlFor="nomeIndagato" className="text-xs">1. Nome indagato/imputato</Label>
                                    <Input
                                        id="nomeIndagato"
                                        value={preamble.nomeIndagato || ''}
                                        onChange={(e) => handleChange('nomeIndagato', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="numeroProcedimentoDettaglio" className="text-xs">2. Nr. procedimento</Label>
                                    <Input
                                        id="numeroProcedimentoDettaglio"
                                        value={preamble.numeroProcedimentoDettaglio || ''}
                                        onChange={(e) => handleChange('numeroProcedimentoDettaglio', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="ufficioProcede" className="text-xs">3. Ufficio che procede</Label>
                                    <Input
                                        id="ufficioProcede"
                                        value={preamble.ufficioProcede || ''}
                                        onChange={(e) => handleChange('ufficioProcede', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="reatiContestati" className="text-xs">4. Reato/i contestati</Label>
                                    <Input
                                        id="reatiContestati"
                                        value={preamble.reatiContestati || ''}
                                        onChange={(e) => handleChange('reatiContestati', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="dataLuogo" className="text-xs">5. Data e luogo</Label>
                                    <Input
                                        id="dataLuogo"
                                        value={preamble.dataLuogo || ''}
                                        onChange={(e) => handleChange('dataLuogo', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="ufficioPM" className="text-xs">6. Ufficio del P.M.</Label>
                                    <Input
                                        id="ufficioPM"
                                        value={preamble.ufficioPM || ''}
                                        onChange={(e) => handleChange('ufficioPM', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="parteOffesa" className="text-xs">7. Parte offesa</Label>
                                    <Input
                                        id="parteOffesa"
                                        value={preamble.parteOffesa || ''}
                                        onChange={(e) => handleChange('parteOffesa', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="poliziaGiudiziaria" className="text-xs">8. Polizia Giudiziaria</Label>
                                    <Input
                                        id="poliziaGiudiziaria"
                                        value={preamble.poliziaGiudiziaria || ''}
                                        onChange={(e) => handleChange('poliziaGiudiziaria', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="difensori" className="text-xs">9. Difensore/i</Label>
                                    <Input
                                        id="difensori"
                                        value={preamble.difensori || ''}
                                        onChange={(e) => handleChange('difensori', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="altroDettaglio" className="text-xs">10. Altro</Label>
                                    <Input
                                        id="altroDettaglio"
                                        value={preamble.altroDettaglio || ''}
                                        onChange={(e) => handleChange('altroDettaglio', e.target.value)}
                                        readOnly={readOnly}
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
