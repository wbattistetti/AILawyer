import React from 'react'
import { CompartoColumn } from './CompartoColumn'
import { Comparto, Documento } from '@/types'

interface KanbanBoardProps {
  comparti: Comparto[]
  documenti: Documento[]
  onFileDrop: (files: File[], compartoId: string) => void
  onDocumentClick: (documento: Documento) => void
}

export function KanbanBoard({ 
  comparti, 
  documenti, 
  onFileDrop, 
  onDocumentClick 
}: KanbanBoardProps) {
  const getDocumentiByComparto = (compartoId: string) => {
    return documenti.filter(doc => doc.compartoId === compartoId)
  }

  return (
    <div className="grid gap-3 md:gap-4 pb-4 h-full grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
      {comparti
        .sort((a, b) => a.ordine - b.ordine)
        .map((comparto) => (
          <CompartoColumn
            key={comparto.id}
            comparto={comparto}
            documenti={getDocumentiByComparto(comparto.id)}
            onFileDrop={onFileDrop}
            onDocumentClick={onDocumentClick}
          />
        ))}
    </div>
  )
}