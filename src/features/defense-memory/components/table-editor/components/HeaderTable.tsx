import React from 'react'
import { Input } from '@/components/ui/input'
import { PreambleData } from '../types/table.types'
import { cn } from '@/lib/utils'

interface HeaderTableProps {
    preamble: PreambleData
    onUpdate: (preamble: PreambleData) => void
    readOnly?: boolean
}

export const HeaderTable: React.FC<HeaderTableProps> = ({
    preamble,
    onUpdate,
    readOnly = false
}) => {
    const handleChange = (field: keyof PreambleData, value: string) => {
        if (readOnly) return
        onUpdate({
            ...preamble,
            [field]: value
        })
    }

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full">
                <tbody className="divide-y divide-gray-200">
                    {/* Riga 1: Procura | Numero Procedimento */}
                    <tr className={cn("bg-white")}>
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 w-3/5 border-r border-gray-200">
                            Procura della Repubblica
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200">
                            <Input
                                value={preamble.procura || ''}
                                onChange={(e) => handleChange('procura', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Procura della Repubblica di Roma"
                                className="h-8 text-sm border-0 focus-visible:ring-0"
                            />
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 w-2/5 border-l border-r border-gray-200">
                            Numero Procedimento
                        </td>
                        <td className="px-3 py-2 w-3/5">
                            <Input
                                value={preamble.numeroProcedimento || ''}
                                onChange={(e) => handleChange('numeroProcedimento', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Proc. Penale n. 43334/21 R.G."
                                className="h-8 text-sm border-0 focus-visible:ring-0 font-bold"
                            />
                        </td>
                    </tr>
                    {/* Riga 2: Tribunale | (vuoto) */}
                    <tr className={cn("bg-gray-50")}>
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 w-3/5 border-r border-gray-200">
                            Tribunale
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200">
                            <Input
                                value={preamble.tribunale || ''}
                                onChange={(e) => handleChange('tribunale', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: Tribunale di Roma"
                                className="h-8 text-sm border-0 focus-visible:ring-0 bg-transparent"
                            />
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200"></td>
                        <td className="px-3 py-2 w-3/5"></td>
                    </tr>
                    {/* Riga 3: GIP | (vuoto) */}
                    <tr className={cn("bg-white")}>
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 w-3/5 border-r border-gray-200">
                            GIP
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200">
                            <Input
                                value={preamble.gip || ''}
                                onChange={(e) => handleChange('gip', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Es: GIP"
                                className="h-8 text-sm border-0 focus-visible:ring-0"
                            />
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200"></td>
                        <td className="px-3 py-2 w-3/5"></td>
                    </tr>
                    {/* Riga 4: Altro | (vuoto) */}
                    <tr className={cn("bg-gray-50")}>
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 w-3/5 border-r border-gray-200">
                            Altro
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200">
                            <Input
                                value={preamble.altro || ''}
                                onChange={(e) => handleChange('altro', e.target.value)}
                                readOnly={readOnly}
                                placeholder="Altro"
                                className="h-8 text-sm border-0 focus-visible:ring-0 bg-transparent"
                            />
                        </td>
                        <td className="px-3 py-2 w-2/5 border-l border-gray-200"></td>
                        <td className="px-3 py-2 w-3/5"></td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}
