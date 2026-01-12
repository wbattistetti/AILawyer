/**
 * ExtractDrawer - Cassetto estratti
 * Step 2: Componente modulare e riutilizzabile
 *
 * Mostra tutti gli estratti copiati in un layout intelligente
 * Permette drag & drop per trascinarli nelle card
 */

import React, { useState, useEffect, useRef } from 'react'
import { ExtractDrawerProps, ExtractData } from '../types/blocks.types'
import { extractClipboardManager } from '@/utils/extractClipboard'
import { addExtractFromClipboard, reorderExtracts, convertClipboardToExtract } from '../../../services/ExtractDrawerService'
import { cn } from '@/lib/utils'
import { X, FileText, Image as ImageIcon } from 'lucide-react'

export const ExtractDrawer: React.FC<ExtractDrawerProps> = ({
  extracts,
  onExtractAdd,
  onExtractRemove,
  onExtractReorder,
  className
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // ✅ Ref per accedere agli extracts correnti senza causare re-subscribe
  const extractsRef = useRef(extracts)
  const onExtractAddRef = useRef(onExtractAdd)

  // ✅ Aggiorna i ref quando cambiano
  useEffect(() => {
    extractsRef.current = extracts
    onExtractAddRef.current = onExtractAdd
  }, [extracts, onExtractAdd])

  // ✅ Subscribe alla clipboard per aggiungere automaticamente gli estratti
  // ✅ IMPORTANTE: Nessuna dipendenza da extracts/onExtractAdd per evitare re-subscribe
  useEffect(() => {
    console.log('[ExtractDrawer] 🔄 useEffect montato, extracts iniziali:', extracts.length)

    const unsubscribe = extractClipboardManager.subscribe((clipboardData) => {
      console.log('[ExtractDrawer] 📬 Evento clipboard ricevuto:', {
        hasData: !!clipboardData,
        source: clipboardData?.source,
        page: clipboardData?.page
      })

      // ✅ Aggiungi automaticamente quando viene copiato un nuovo estratto
      if (clipboardData) {
        const extract = convertClipboardToExtract(clipboardData)

        // ✅ Usa i ref per accedere agli extracts correnti senza dipendenze
        const currentExtracts = extractsRef.current
        const currentOnExtractAdd = onExtractAddRef.current

        console.log('[ExtractDrawer] 🔍 Controllo duplicati, extracts attuali:', currentExtracts.length)

        const isDuplicate = currentExtracts.some(e =>
          e.source === extract.source &&
          e.page === extract.page &&
          e.bbox.x0Pct === extract.bbox.x0Pct &&
          e.bbox.y0Pct === extract.bbox.y0Pct
        )

        if (!isDuplicate) {
          console.log('[ExtractDrawer] ➕ Aggiungo estratto al cassetto:', extract.id)
          currentOnExtractAdd(extract)
          extractClipboardManager.clear()
          console.log('[ExtractDrawer] ✅ Estratto aggiunto automaticamente al cassetto:', extract.id, {
            source: extract.source,
            page: extract.page,
            hasImage: !!extract.imageDataUrl
          })
        } else {
          console.log('[ExtractDrawer] ⚠️ Estratto già presente nel cassetto, ignorato')
          extractClipboardManager.clear()
        }
      } else {
        console.log('[ExtractDrawer] 📭 Clipboard vuota o cancellata')
      }
    })

    // ✅ Controlla se c'è già un estratto all'avvio o quando viene rimontato
    const checkAndAddPendingExtract = () => {
      const hasExtract = extractClipboardManager.hasExtract()
      console.log('[ExtractDrawer] 🔍 Controllo estratto all\'avvio/rimount:', hasExtract)
      if (hasExtract) {
        const clipboardData = extractClipboardManager.paste()
        if (clipboardData) {
          const extract = convertClipboardToExtract(clipboardData)
          const currentExtracts = extractsRef.current
          const currentOnExtractAdd = onExtractAddRef.current
          const isDuplicate = currentExtracts.some(e =>
            e.source === extract.source &&
            e.page === extract.page &&
            e.bbox.x0Pct === extract.bbox.x0Pct &&
            e.bbox.y0Pct === extract.bbox.y0Pct
          )
          if (!isDuplicate) {
            console.log('[ExtractDrawer] ➕ Aggiungo estratto pendente al cassetto:', extract.id)
            currentOnExtractAdd(extract)
            extractClipboardManager.clear()
            console.log('[ExtractDrawer] ✅ Estratto aggiunto automaticamente all\'avvio/rimount:', extract.id)
          } else {
            console.log('[ExtractDrawer] ⚠️ Estratto pendente già presente, ignorato')
            extractClipboardManager.clear()
          }
        }
      }
    }

    // ✅ Controlla immediatamente all'avvio
    checkAndAddPendingExtract()

    return () => {
      console.log('[ExtractDrawer] 🗑️ Unsubscribe dalla clipboard')
      unsubscribe()
    }
  }, []) // ✅ Nessuna dipendenza - subscribe solo una volta al mount

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Se è un drag interno (riorganizzazione)
    const dragData = e.dataTransfer.getData('application/json')
    if (dragData) {
      try {
        const data = JSON.parse(dragData)
        if (data.type === 'extract-reorder' && typeof data.index === 'number' && onExtractReorder) {
          const targetIndex = extracts.length // Aggiungi in fondo
          onExtractReorder(data.index, targetIndex)
          return
        }
      } catch (err) {
        console.warn('[ExtractDrawer] Errore parsing drag data:', err)
      }
    }

    // Se è un estratto dalla clipboard
    addExtractFromClipboard(extracts, onExtractAdd)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleExtractDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'extract',
      extract: extracts[index]
    }))
    e.dataTransfer.effectAllowed = 'move'

    // Crea drag image personalizzata
    const dragImage = document.createElement('div')
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    dragImage.textContent = extracts[index].source
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  const handleExtractDragEnd = () => {
    setDraggedIndex(null)
  }

  // ✅ Aggiunta automatica - nessun pulsante manuale necessario

  // ✅ Mostra sempre il cassetto (anche se vuoto)
  return (
    <div
      ref={containerRef}
      className={cn(
        'border-t border-gray-300 bg-gray-50 p-4 space-y-3 min-h-[120px]',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          📋 Cassetto Estratti {extracts.length > 0 && `(${extracts.length})`}
        </h3>
        {/* ✅ Rimossa aggiunta manuale - ora è automatica */}
      </div>

      {extracts.length === 0 ? (
        <div
          className={cn(
            'p-4 border-2 border-dashed rounded-lg text-center transition-colors',
            'border-gray-300 bg-white'
          )}
        >
          <p className="text-sm text-gray-500">
            ✅ Gli estratti copiati vengono aggiunti automaticamente qui
          </p>
          <p className="text-xs text-gray-400 mt-1">
            (Puoi eliminarli se non ti servono)
          </p>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-3',
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            isDragOver && 'ring-2 ring-blue-500 rounded-lg p-2'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {extracts.map((extract, index) => (
            <ExtractCard
              key={extract.id}
              extract={extract}
              index={index}
              isDragging={draggedIndex === index}
              onDragStart={(e) => handleExtractDragStart(e, index)}
              onDragEnd={handleExtractDragEnd}
              onRemove={() => onExtractRemove(extract.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Card singolo estratto
 */
interface ExtractCardProps {
  extract: ExtractData
  index: number
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onRemove: () => void
}

const ExtractCard: React.FC<ExtractCardProps> = ({
  extract,
  isDragging,
  onDragStart,
  onDragEnd,
  onRemove
}) => {
  const hasImage = !!extract.imageDataUrl
  const hasText = !!extract.content && extract.content.trim().length > 0

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'bg-white border border-gray-300 rounded-lg p-3 shadow-sm',
        'cursor-move hover:shadow-md transition-all',
        isDragging && 'opacity-50 scale-95'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasImage ? (
            <ImageIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-900 truncate">
              {extract.source}
            </p>
            <p className="text-xs text-gray-500">
              Pag. {extract.page}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {hasImage && extract.imageDataUrl && (
        <div className="mb-2 rounded overflow-hidden border border-gray-200">
          <img
            src={extract.imageDataUrl}
            alt="Estratto"
            className="w-full h-auto max-h-32 object-contain"
          />
        </div>
      )}

      {hasText && (
        <div className="text-xs text-gray-700 line-clamp-3">
          {extract.content}
        </div>
      )}
    </div>
  )
}
