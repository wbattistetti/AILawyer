import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { UploadProgress } from '@/types'
import { formatFileSize } from '@/lib/utils'
import { FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UploadPanelProps {
  uploads: UploadProgress[]
  onClearCompleted: () => void
}

export function UploadPanel({ uploads, onClearCompleted }: UploadPanelProps) {
  if (uploads.length === 0) return null

  const completedUploads = uploads.filter(u => u.status === 'completed').length
  const errorUploads = uploads.filter(u => u.status === 'error').length
  const processingUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'processing').length

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending':
        return <FileText className="w-4 h-4 text-gray-500" />
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusText = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending':
        return 'In attesa'
      case 'uploading':
        return 'Caricamento...'
      case 'processing':
        return 'Elaborazione...'
      case 'completed':
        return 'Completato'
      case 'error':
        return 'Errore'
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Upload in corso ({uploads.length})
          </CardTitle>
          {completedUploads > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCompleted}
              className="h-6 px-2 text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Pulisci
            </Button>
          )}
        </div>
        
        {uploads.length > 0 && (
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            {completedUploads > 0 && (
              <span className="text-green-600">✓ {completedUploads} completati</span>
            )}
            {processingUploads > 0 && (
              <span className="text-blue-600">⟳ {processingUploads} in corso</span>
            )}
            {errorUploads > 0 && (
              <span className="text-red-600">✗ {errorUploads} errori</span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2 max-h-64 overflow-y-auto">
        {uploads.map((upload, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-center space-x-2">
              {getStatusIcon(upload.status)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{upload.file.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{getStatusText(upload.status)}</span>
                  <span>{formatFileSize(upload.file.size)}</span>
                </div>
              </div>
            </div>
            
            {(upload.status === 'uploading' || upload.status === 'processing') && (
              <Progress value={upload.progress} className="h-1" />
            )}
            
            {upload.error && (
              <p className="text-xs text-red-500 mt-1">{upload.error}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}