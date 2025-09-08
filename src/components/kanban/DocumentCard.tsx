import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Documento } from '@/types'
import { formatFileSize, getFileExtension, truncateText } from '@/lib/utils'
import { FileText, Image, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocumentCardProps {
  documento: Documento
  onClick: () => void
}

export function DocumentCard({ documento, onClick }: DocumentCardProps) {
  const extension = getFileExtension(documento.filename)
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(extension)
  
  const getStatusIcon = () => {
    switch (documento.ocrStatus) {
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-500" />
      case 'processing':
        return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-500" />
      case 'low_confidence':
        return <AlertCircle className="w-3 h-3 text-orange-500" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (documento.ocrStatus) {
      case 'pending':
        return 'In coda'
      case 'processing':
        return 'Elaborazione...'
      case 'completed':
        return 'Completato'
      case 'failed':
        return 'Errore'
      case 'low_confidence':
        return 'Bassa qualità'
      default:
        return 'Caricato'
    }
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500'
    if (confidence >= 80) return 'text-green-600'
    if (confidence >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const safeTags = Array.isArray(documento.tags) ? documento.tags : []

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow duration-200 border-l-4 border-l-blue-500"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0">
            {isImage ? (
              <Image className="w-4 h-4 text-blue-500" />
            ) : (
              <FileText className="w-4 h-4 text-gray-500" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-medium truncate">
                {truncateText(documento.filename, 25)}
              </h4>
              {getStatusIcon()}
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>{extension.toUpperCase()}</span>
              <span>{formatFileSize(documento.size)}</span>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1">
                {getStatusIcon()}
                <span>{getStatusText()}</span>
              </span>
              
              {documento.classConfidence && (
                <span className={cn("font-medium", getConfidenceColor(documento.classConfidence))}>
                  {documento.classConfidence}%
                </span>
              )}
            </div>

            {documento.ocrStatus !== 'completed' && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-slate-100 rounded">
                  <div
                    className="h-1.5 bg-blue-500 rounded"
                    style={{ width: `${Math.min(99, Math.floor((documento.ocrConfidence || 0)))}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                  <span>Scansione...</span>
                  <span>~{Math.max(1, 100 - Math.floor(documento.ocrConfidence || 0))}s</span>
                </div>
              </div>
            )}
            
            {safeTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {safeTags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-block bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
                {safeTags.length > 2 && (
                  <span className="text-xs text-muted-foreground">
                    +{safeTags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}