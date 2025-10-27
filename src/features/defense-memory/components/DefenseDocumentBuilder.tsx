import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentRenderer } from '../services/templateEngine'
import { DocumentTemplate, DocumentRenderData, DEFAULT_TEMPLATES } from '../types/templates'
import { Estratto } from '@/types'
import { api } from '@/lib/api'

interface DefenseDocumentBuilderProps {
    praticaId: string
    extracts: Estratto[]
    onExtractUpdate?: (extractId: string, field: string, value: string) => void
    onDocumentExport?: (format: 'pdf' | 'word') => void
}

export const DefenseDocumentBuilder: React.FC<DefenseDocumentBuilderProps> = ({
    praticaId,
    extracts,
    onExtractUpdate,
    onDocumentExport
}) => {
    const [template, setTemplate] = useState<DocumentTemplate>(DEFAULT_TEMPLATES[0])
    const [documentHtml, setDocumentHtml] = useState<string>('')
    const [isRendering, setIsRendering] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const documentRef = useRef<HTMLDivElement>(null)
    const renderer = useRef<DocumentRenderer>(new DocumentRenderer())

    // Renderizza documento quando cambiano estratti o template
    useEffect(() => {
        renderDocument()
    }, [extracts, template])

    const renderDocument = async () => {
        if (!extracts.length) return

        setIsRendering(true)
        try {
            const renderData: DocumentRenderData = {
                template,
                extracts,
                metadata: {
                    title: 'MEMORIA DIFENSIVA',
                    clientName: 'Cliente da definire', // TODO: ottenere da pratica
                    caseNumber: 'Caso da definire', // TODO: ottenere da pratica
                    date: new Date().toLocaleDateString('it-IT'),
                    analystName: 'Analista',
                    pageNumbers: true
                }
            }

            const html = await renderer.current.renderDocument(renderData)
            setDocumentHtml(html)
        } catch (error) {
            console.error('Errore nel rendering documento:', error)
        } finally {
            setIsRendering(false)
        }
    }

    const handleTemplateChange = (newTemplate: DocumentTemplate) => {
        setTemplate(newTemplate)
    }

    const handleEditModeToggle = () => {
        setIsEditing(!isEditing)
    }

    const handleContentEdit = async (extractId: string, field: string, newValue: string) => {
        try {
            // Aggiorna estratto via API
            await api.updateEstratto(extractId, { [field]: newValue })

            // Notifica componente padre
            onExtractUpdate?.(extractId, field, newValue)

            // Rerenderizza documento
            await renderDocument()
        } catch (error) {
            console.error('Errore nell\'aggiornamento estratto:', error)
        }
    }

    const handleExport = (format: 'pdf' | 'word') => {
        onDocumentExport?.(format)
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* Header con controlli */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center space-x-2">
                            <span>📄</span>
                            <span>Compositore Documento Difesa</span>
                            <Badge variant="outline">{extracts.length} estratti</Badge>
                        </CardTitle>

                        <div className="flex space-x-2">
                            <Button
                                variant={isEditing ? "default" : "outline"}
                                onClick={handleEditModeToggle}
                                size="sm"
                            >
                                {isEditing ? '📝 Modifica' : '👁️ Visualizza'}
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => handleExport('pdf')}
                                size="sm"
                            >
                                📄 Esporta PDF
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => handleExport('word')}
                                size="sm"
                            >
                                📝 Esporta Word
                            </Button>

                            <Button
                                variant="outline"
                                onClick={handlePrint}
                                size="sm"
                            >
                                🖨️ Stampa
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Selettore template */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Template Documento</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {DEFAULT_TEMPLATES.map(templateOption => (
                            <Card
                                key={templateOption.id}
                                className={`cursor-pointer transition-all hover:shadow-md ${template.id === templateOption.id
                                        ? 'ring-2 ring-blue-500 bg-blue-50'
                                        : 'hover:bg-gray-50'
                                    }`}
                                onClick={() => handleTemplateChange(templateOption)}
                            >
                                <CardContent className="p-4">
                                    <h3 className="font-medium mb-2">{templateOption.name}</h3>
                                    <p className="text-sm text-gray-600 mb-2">{templateOption.description}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {templateOption.sections.map(section => (
                                            <Badge key={section.id} variant="outline" className="text-xs">
                                                {section.title}
                                            </Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Documento renderizzato */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Anteprima Documento</CardTitle>
                        {isRendering && (
                            <Badge variant="secondary">Rendering...</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {documentHtml ? (
                        <div className="border rounded-lg overflow-hidden">
                            <div
                                ref={documentRef}
                                className="document-preview"
                                dangerouslySetInnerHTML={{ __html: documentHtml }}
                                style={{
                                    pointerEvents: isEditing ? 'auto' : 'none',
                                    userSelect: isEditing ? 'text' : 'none'
                                }}
                                onInput={(e) => {
                                    if (!isEditing) return

                                    const target = e.target as HTMLElement
                                    if (target.classList.contains('editable')) {
                                        const extractId = target.dataset.extractId
                                        const field = target.dataset.field

                                        if (extractId && field) {
                                            handleContentEdit(extractId, field, target.textContent || '')
                                        }
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <div className="text-4xl mb-2">📄</div>
                            <p>Nessun estratto da visualizzare</p>
                            <p className="text-sm">Classifica alcuni estratti per vedere il documento</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Statistiche documento */}
            {extracts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Statistiche Documento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-600">
                                    {extracts.filter(e => e.type === 'reato').length}
                                </div>
                                <div className="text-sm text-gray-600">Reati</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                    {extracts.filter(e => e.type === 'motivazione').length}
                                </div>
                                <div className="text-sm text-gray-600">Motivazioni</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">
                                    {extracts.filter(e => e.type === 'contromotivazione').length}
                                </div>
                                <div className="text-sm text-gray-600">Contro-motivazioni</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-600">
                                    {extracts.filter(e => e.type === 'prova').length}
                                </div>
                                <div className="text-sm text-gray-600">Prove</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
