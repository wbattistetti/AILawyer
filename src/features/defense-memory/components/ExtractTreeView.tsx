import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    ExtractType,
    EXTRACT_TYPE_CONFIGS,
    ExtractHierarchy
} from '../types'
import { Estratto } from '@/types'

interface ExtractTreeViewProps {
    estratti: Estratto[]
    onExtractSelect?: (estratto: Estratto) => void
    onExtractEdit?: (estratto: Estratto) => void
    onExtractDelete?: (estrattoId: string) => void
}

export const ExtractTreeView: React.FC<ExtractTreeViewProps> = ({
    estratti,
    onExtractSelect,
    onExtractEdit,
    onExtractDelete
}) => {
    const getTypeConfig = (type: ExtractType) => {
        return EXTRACT_TYPE_CONFIGS.find(config => config.type === type)!
    }

    const buildHierarchy = (): ExtractHierarchy => {
        const reati = estratti.filter(e => e.type === 'reato')
        const motivazioni = estratti.filter(e => e.type === 'motivazione')
        const contromotivazioni = estratti.filter(e => e.type === 'contromotivazione')

        return {
            reati: reati.map(reato => ({
                id: reato.id,
                title: reato.title || reato.content.slice(0, 50) + '...',
                content: reato.content,
                motivazioni: motivazioni
                    .filter(m => m.parentReatoId === reato.id)
                    .map(motivazione => ({
                        id: motivazione.id,
                        title: motivazione.title || motivazione.content.slice(0, 50) + '...',
                        content: motivazione.content,
                        contromotivazioni: contromotivazioni
                            .filter(c => c.parentMotivazioneId === motivazione.id)
                            .map(contromotivazione => ({
                                id: contromotivazione.id,
                                title: contromotivazione.title || contromotivazione.content.slice(0, 50) + '...',
                                content: contromotivazione.content
                            }))
                    }))
            }))
        }
    }

    const hierarchy = buildHierarchy()

    const renderExtractCard = (estratto: Estratto, level: number = 0) => {
        const config = getTypeConfig(estratto.type as ExtractType)
        const marginLeft = level * 20

        return (
            <Card
                key={estratto.id}
                className="mb-3 cursor-pointer hover:shadow-md transition-shadow"
                style={{ marginLeft: `${marginLeft}px` }}
                onClick={() => onExtractSelect?.(estratto)}
            >
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: config.color }}
                                />
                                <Badge variant="outline" className="text-xs">
                                    {config.icon} {config.label}
                                </Badge>
                                <span className="text-sm text-gray-500">
                                    {new Date(estratto.extractDate).toLocaleDateString('it-IT')}
                                </span>
                            </div>

                            <h4 className="font-medium text-gray-900 mb-1">
                                {estratto.title || 'Senza titolo'}
                            </h4>

                            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                                {estratto.content}
                            </p>

                            <div className="text-xs text-gray-500">
                                Fonte: {estratto.sourceDocTitle} - Pagina {estratto.page}
                            </div>

                            {/* Note indicator */}
                            {(estratto.notesAnalyst || estratto.notesStrategy || estratto.notesDefense) && (
                                <div className="mt-2">
                                    <Badge variant="secondary" className="text-xs">
                                        📝 Ha note
                                    </Badge>
                                </div>
                            )}
                        </div>

                        <div className="flex space-x-1 ml-2">
                            {onExtractEdit && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onExtractEdit(estratto)
                                    }}
                                >
                                    ✏️
                                </Button>
                            )}
                            {onExtractDelete && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onExtractDelete(estratto.id)
                                    }}
                                >
                                    🗑️
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const renderHierarchy = () => {
        if (hierarchy.reati.length === 0) {
            return (
                <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Nessun estratto classificato</p>
                    <p className="text-sm">Inizia classificando alcuni estratti dal documento</p>
                </div>
            )
        }

        return (
            <div className="space-y-4">
                {hierarchy.reati.map(reato => (
                    <div key={reato.id}>
                        {/* Reato */}
                        {renderExtractCard(estratti.find(e => e.id === reato.id)!, 0)}

                        {/* Motivazioni */}
                        {reato.motivazioni.map(motivazione => (
                            <div key={motivazione.id}>
                                {renderExtractCard(estratti.find(e => e.id === motivazione.id)!, 1)}

                                {/* Contromotivazioni */}
                                {motivazione.contromotivazioni.map(contromotivazione => (
                                    <div key={contromotivazione.id}>
                                        {renderExtractCard(estratti.find(e => e.id === contromotivazione.id)!, 2)}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                    <span>🌳</span>
                    <span>Gerarchia Estratti</span>
                    <Badge variant="outline">{estratti.length} estratti</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {renderHierarchy()}
            </CardContent>
        </Card>
    )
}
