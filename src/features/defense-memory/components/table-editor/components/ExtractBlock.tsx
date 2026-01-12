/**
 * ExtractBlock - Blocco estratto (non editabile) con titolo e osservazione
 * Step 4: Componente per visualizzare estratti nelle card
 */

import React, { useState, useEffect } from 'react'
import { ExtractBlockProps } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { FileText, Image as ImageIcon, X, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export const ExtractBlock: React.FC<ExtractBlockProps> = ({
  block,
  onUpdate,
  onRemove,
  onDragStart,
  onDragEnd,
  readOnly
}) => {
  const { extract, title, observation, hasObservation = false, collapsed = false } = block
  const [isCollapsed, setIsCollapsed] = useState(collapsed)
  const [localTitle, setLocalTitle] = useState(title || `${extract.source} Pag. ${extract.page}`)
  const [localObservation, setLocalObservation] = useState(observation || '')

  // ✅ Sincronizza stato locale con props quando cambiano
  useEffect(() => {
    setIsCollapsed(collapsed)
  }, [collapsed])

  useEffect(() => {
    setLocalTitle(title || `${extract.source} Pag. ${extract.page}`)
  }, [title, extract.source, extract.page])

  useEffect(() => {
    setLocalObservation(observation || '')
  }, [observation])

  // ✅ Se hasObservation diventa false, resetta anche localObservation
  useEffect(() => {
    if (!hasObservation) {
      setLocalObservation('')
    }
  }, [hasObservation])

  const hasImage = !!extract.imageDataUrl
  const hasText = !!extract.content && extract.content.trim().length > 0

  // ✅ Aggiorna il blocco quando cambiano titolo o osservazione
  const handleTitleChange = (newTitle: string) => {
    setLocalTitle(newTitle)
    if (onUpdate) {
      onUpdate({ ...block, title: newTitle })
    }
  }

  const handleObservationChange = (newObservation: string) => {
    setLocalObservation(newObservation)
    if (onUpdate) {
      onUpdate({ ...block, observation: newObservation, hasObservation: true })
    }
  }

  const handleAddObservation = () => {
    if (onUpdate) {
      onUpdate({ ...block, hasObservation: true, observation: observation || '' })
    }
  }

  const handleRemoveObservation = () => {
    setLocalObservation('')
    if (onUpdate) {
      onUpdate({ ...block, hasObservation: false, observation: '' })
    }
  }

  const handleToggleCollapse = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    if (onUpdate) {
      onUpdate({ ...block, collapsed: newCollapsed })
    }
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'bg-white border border-gray-300 rounded-lg shadow-sm',
        !readOnly && 'cursor-move hover:shadow-md transition-all'
      )}
    >
      {/* ✅ Header con titolo editabile e chevron */}
      <div
        className={cn(
          'flex items-center justify-between p-3 border-b border-gray-200',
          !readOnly && 'cursor-pointer hover:bg-gray-50'
        )}
        onClick={!readOnly ? handleToggleCollapse : undefined}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleToggleCollapse()
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}

          {readOnly ? (
            <p className="text-sm font-medium text-gray-900 truncate">
              {localTitle || `${extract.source} Pag. ${extract.page}`}
            </p>
          ) : (
            <Input
              value={localTitle}
              onChange={(e) => {
                e.stopPropagation()
                handleTitleChange(e.target.value)
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Titolo estratto"
              className="text-sm font-medium border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* ✅ Icona "+" per aggiungere osservazione (solo se non c'è già) */}
          {!readOnly && !hasObservation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleAddObservation()
              }}
              className="text-red-500 hover:text-red-600 transition-colors flex-shrink-0"
              title="Aggiungi osservazione"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}

          {!readOnly && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ✅ Contenuto estratto (visibile solo se non collassato) */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Icona e info documento */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {hasImage ? (
              <ImageIcon className="h-3 w-3 text-blue-500 flex-shrink-0" />
            ) : (
              <FileText className="h-3 w-3 text-gray-500 flex-shrink-0" />
            )}
            <span>{extract.source} - Pag. {extract.page}</span>
          </div>

          {/* Immagine estratto */}
          {hasImage && extract.imageDataUrl && (
            <div className="rounded overflow-hidden border border-gray-200">
              <img
                src={extract.imageDataUrl}
                alt="Estratto"
                className="w-full h-auto max-h-48 object-contain"
              />
            </div>
          )}

          {/* Testo estratto */}
          {hasText && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
              {extract.content}
            </div>
          )}

          {/* ✅ Campo osservazione editabile (solo se hasObservation === true) */}
          {hasObservation && (
            <div className="pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">
                  Osservazione
                </label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveObservation()
                    }}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                    title="Rimuovi osservazione"
                  >
                    Rimuovi
                  </button>
                )}
              </div>
              {readOnly ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {localObservation || <span className="text-gray-400 italic">Nessuna osservazione</span>}
                </p>
              ) : (
                <Textarea
                  value={localObservation}
                  onChange={(e) => {
                    e.stopPropagation()
                    handleObservationChange(e.target.value)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Inserisci un'osservazione sull'estratto..."
                  className="min-h-[80px] text-sm resize-y"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
