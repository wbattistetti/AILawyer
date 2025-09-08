import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { OcrVerify } from '@/components/ocr/OcrVerify'
import { Documento, Comparto } from '@/types'
import { formatFileSize, getFileExtension } from '@/lib/utils'
import { FileText, Image, Calendar, Tag, Target, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DocumentModalProps {
  documento: Documento | null
  comparti: Comparto[]
  isOpen: boolean
  onClose: () => void
  onMoveToComparto: (documentId: string, compartoId: string) => void
}

export function DocumentModal({ 
  documento, 
  comparti, 
  isOpen, 
  onClose, 
  onMoveToComparto 
}: DocumentModalProps) {
  if (!documento) return null

  const extension = getFileExtension(documento.filename)
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(extension)
  const currentComparto = comparti.find(c => c.id === documento.compartoId)

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'secondary'
    if (confidence >= 80) return 'default'
    if (confidence >= 60) return 'secondary'
    return 'destructive'
  }

  const getStatusBadge = () => {
    switch (documento.ocrStatus) {
      case 'pending':
        return <Badge variant="secondary">In coda</Badge>
      case 'processing':
        return <Badge variant="secondary">Elaborazione...</Badge>
      case 'completed':
        return <Badge variant="default">Completato</Badge>
      case 'failed':
        return <Badge variant="destructive">Errore OCR</Badge>
      case 'low_confidence':
        return <Badge variant="destructive">Bassa qualità</Badge>
      default:
        return <Badge variant="secondary">Caricato</Badge>
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {isImage ? (
              <Image className="w-5 h-5 text-blue-500" />
            ) : (
              <FileText className="w-5 h-5 text-gray-500" />
            )}
            <span className="truncate">{documento.filename}</span>
          </DialogTitle>
          <DialogDescription>
            Dettagli del documento e opzioni di gestione
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informazioni base */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Informazioni File</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Tipo: {extension.toUpperCase()}</p>
                <p>Dimensione: {formatFileSize(documento.size)}</p>
                <p className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(documento.createdAt).toLocaleDateString('it-IT')}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Stato Elaborazione</h4>
              <div className="space-y-2">
                {getStatusBadge()}
                {documento.ocrConfidence && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">OCR:</span>
                    <Badge variant={getConfidenceColor(documento.ocrConfidence)}>
                      {documento.ocrConfidence}%
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Classificazione */}
          {documento.classConfidence && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <Target className="w-4 h-4 mr-1" />
                Classificazione Automatica
              </h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Comparto attuale:</span>
                  <Badge variant="outline">{currentComparto?.nome}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Confidenza:</span>
                  <Badge variant={getConfidenceColor(documento.classConfidence)}>
                    {documento.classConfidence}%
                  </Badge>
                </div>
                {documento.classWhy && (
                  <div>
                    <span className="text-sm font-medium">Motivazione:</span>
                    <p className="text-sm text-muted-foreground mt-1">{documento.classWhy}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tag */}
          {Array.isArray(documento.tags) && documento.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <Tag className="w-4 h-4 mr-1" />
                Tag Identificati
              </h4>
              <div className="flex flex-wrap gap-2">
                {documento.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Avvisi */}
          {documento.ocrStatus === 'low_confidence' && (
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg">
              <div className="flex items-center space-x-2 text-orange-800">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Attenzione: Qualità OCR bassa</span>
              </div>
              <p className="text-sm text-orange-700 mt-1">
                Il testo estratto potrebbe non essere accurato. Verifica manualmente il contenuto.
              </p>
            </div>
          )}

          {/* Editor/OCR Verify */}
          {documento.ocrText && documento.ocrLayout && (
            <div>
              <h4 className="text-sm font-medium mb-2">Testo OCR</h4>
              <OcrVerify documento={documento} />
            </div>
          )}

          {/* Azioni */}
          <div>
            <h4 className="text-sm font-medium mb-3">Sposta in altro comparto</h4>
            <div className="grid grid-cols-2 gap-2">
              {comparti
                .filter(c => c.id !== documento.compartoId)
                .sort((a, b) => a.ordine - b.ordine)
                .map((comparto) => (
                  <Button
                    key={comparto.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onMoveToComparto(documento.id, comparto.id)
                      onClose()
                    }}
                    className="justify-start text-xs"
                  >
                    {comparto.nome}
                  </Button>
                ))}
            </div>
            <div className="mt-4 flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => window.open(api.getLocalFileUrl(documento.s3Key), '_blank')}>
                Apri file originale
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
