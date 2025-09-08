import React from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentCard } from './DocumentCard'
import { Comparto, Documento } from '@/types'
import { formatFileSize } from '@/lib/utils'
import { Upload, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CompartoColumnProps {
  comparto: Comparto
  documenti: Documento[]
  onFileDrop: (files: File[], compartoId: string) => void
  onDocumentClick: (documento: Documento) => void
}

export function CompartoColumn({ 
  comparto, 
  documenti, 
  onFileDrop, 
  onDocumentClick 
}: CompartoColumnProps) {
  const totalSize = documenti.reduce((sum, doc) => sum + doc.size, 0)
  const newDocuments = documenti.filter(doc => 
    doc.ocrStatus === 'pending' || doc.ocrStatus === 'processing'
  ).length

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onFileDrop(files, comparto.id),
    noClick: true,
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "w-full h-full",
        isDragActive && "ring-2 ring-blue-500 ring-offset-2 rounded-lg"
      )}
    >
      <input {...getInputProps()} />
      
      <Card className={cn(
        "h-full flex flex-col transition-all duration-200",
        isDragActive && "bg-blue-50 border-blue-300 shadow-lg",
        comparto.key === 'da_classificare' && "border-orange-300 bg-orange-50/50"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="truncate">{comparto.nome}</span>
            {newDocuments > 0 && (
              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                {newDocuments} nuovi
              </span>
            )}
          </CardTitle>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center">
              <FileText className="w-3 h-3 mr-1" />
              {documenti.length} doc
            </span>
            <span>{formatFileSize(totalSize)}</span>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto space-y-2 pb-4">
          {documenti.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Upload className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs text-center">
                {isDragActive ? 'Rilascia i file qui' : 'Trascina i file qui'}
              </p>
            </div>
          ) : (
            documenti.map((documento) => (
              <DocumentCard
                key={documento.id}
                documento={documento}
                onClick={() => onDocumentClick(documento)}
              />
            ))
          )}
          
          {isDragActive && (
            <div className="absolute inset-0 bg-blue-100/80 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Upload className="w-12 h-12 mx-auto mb-2 text-blue-500" />
                <p className="text-blue-700 font-medium">Rilascia per caricare in "{comparto.nome}"</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}