import React from 'react'
import { ExtractFormFieldsProps } from '../types/table.types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ExtractFormFields: React.FC<ExtractFormFieldsProps> = ({
    extract,
    onExtractChange,
    onExtractRemove,
    readOnly = false
}) => {
    const [isExtractVisible, setIsExtractVisible] = React.useState(extract?.isHidden === false)

    const handleExtractChange = (field: keyof NonNullable<ExtractFormFieldsProps['extract']>, value: any) => {
        if (!extract) return

        onExtractChange({
            ...extract,
            [field]: value
        })
    }

    const handleVisibilityToggle = (visible: boolean) => {
        setIsExtractVisible(visible)
        handleExtractChange('isHidden', !visible)
    }

    if (!extract) {
        return (
            <div className="text-center py-4 text-gray-500">
                <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p>Nessun estratto disponibile</p>
            </div>
        )
    }

    return (
        <Card className="w-full">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Estratto</CardTitle>
                    <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="extract-visibility" className="text-xs text-gray-600">
                                Visibile
                            </Label>
                            <Switch
                                id="extract-visibility"
                                checked={isExtractVisible}
                                onCheckedChange={handleVisibilityToggle}
                                disabled={readOnly}
                                size="sm"
                            />
                        </div>
                        {!readOnly && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onExtractRemove}
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Contenuto Estratto */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Contenuto estratto</Label>
                    <Textarea
                        value={extract.content}
                        onChange={(e) => handleExtractChange('content', e.target.value)}
                        placeholder="Incolla qui il contenuto dell'estratto..."
                        className="min-h-[100px] resize-none"
                        disabled={readOnly}
                    />
                </div>

                {/* Fonte */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Fonte</Label>
                    <Input
                        value={extract.source}
                        onChange={(e) => handleExtractChange('source', e.target.value)}
                        placeholder="Es. Sentenza del 15/03/2023"
                        disabled={readOnly}
                    />
                </div>

                {/* Pagina */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Pagina</Label>
                    <Input
                        type="number"
                        value={extract.page}
                        onChange={(e) => handleExtractChange('page', parseInt(e.target.value) || 0)}
                        placeholder="Es. 15"
                        min="1"
                        disabled={readOnly}
                        className="w-24"
                    />
                </div>

                {/* Anteprima estratto (se visibile) */}
                {isExtractVisible && extract.content && (
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Anteprima</Label>
                        <div className="p-3 bg-gray-50 rounded-md border text-sm">
                            <div className="flex items-start space-x-2">
                                <Eye className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-gray-700 whitespace-pre-wrap">{extract.content}</p>
                                    {extract.source && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            <strong>Fonte:</strong> {extract.source}
                                            {extract.page > 0 && ` - Pagina ${extract.page}`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Anteprima estratto nascosto */}
                {!isExtractVisible && extract.content && (
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Anteprima (nascosta)</Label>
                        <div className="p-3 bg-gray-100 rounded-md border text-sm">
                            <div className="flex items-start space-x-2">
                                <EyeOff className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-gray-500 italic">Estratto nascosto</p>
                                    {extract.source && (
                                        <p className="text-xs text-gray-400 mt-1">
                                            <strong>Fonte:</strong> {extract.source}
                                            {extract.page > 0 && ` - Pagina ${extract.page}`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
