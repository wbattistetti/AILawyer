/**
 * ExtractBlock - Blocco estratto (non editabile) con titolo e osservazione
 * Step 4: Componente per visualizzare estratti nelle card
 */

import React, { useState, useEffect } from 'react'
import { ExtractBlockProps } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { FileText, Image as ImageIcon, X, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
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
  const [localTitle, setLocalTitle] = useState(title || '')
  const [localObservation, setLocalObservation] = useState(observation || '')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isHoveringTitle, setIsHoveringTitle] = useState(false)

  // ✅ Sincronizza stato locale con props quando cambiano
  useEffect(() => {
    setIsCollapsed(collapsed)
  }, [collapsed])

  useEffect(() => {
    setLocalTitle(title || '')
    setIsEditingTitle(false) // ✅ Reset editing quando cambia il titolo esternamente
  }, [title])

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

  const handleDeleteTitle = () => {
    setLocalTitle('')
    setIsEditingTitle(false)
    if (onUpdate) {
      onUpdate({ ...block, title: '' })
    }
  }

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
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
        'bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col',
        !readOnly && 'cursor-move hover:shadow-md transition-all'
      )}
    >
      {/* ✅ Header fisso (sticky) con label non editabile e titolo */}
      <div
        className={cn(
          'flex items-center justify-between p-3 border-b border-gray-200 sticky top-0 bg-white z-10',
          !readOnly && 'cursor-pointer hover:bg-gray-50'
        )}
        onClick={!readOnly ? handleToggleCollapse : undefined}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
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

          {/* ✅ Label non editabile: Nome documento - Pag. X (font piccolo) */}
          <span className="text-xs text-gray-600 flex-shrink-0">
            {extract.source} - Pag. {extract.page}
          </span>

          {/* ✅ Titolo: pulsante "Aggiungi titolo" o text box o titolo con cestino */}
          {readOnly ? (
            <p className="text-sm font-medium text-gray-900 truncate ml-2">
              {localTitle || 'Estratto'}
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
              {!localTitle && !isEditingTitle ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditingTitle(true)
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors flex-shrink-0"
                >
                  Aggiungi titolo
                </button>
              ) : isEditingTitle ? (
                <Input
                  value={localTitle}
                  onChange={(e) => {
                    e.stopPropagation()
                    handleTitleChange(e.target.value)
                  }}
                  onBlur={handleTitleBlur}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      handleTitleBlur()
                    }
                  }}
                  placeholder="Puoi inserire se vuoi un titolo qui..."
                  autoFocus
                  className="text-sm font-medium border border-gray-300 rounded px-2 py-1 h-auto focus-visible:ring-1 focus-visible:ring-blue-500 flex-1 min-w-0 placeholder:text-gray-400"
                />
              ) : (
                <div
                  className="flex items-center gap-2 flex-1 min-w-0"
                  onMouseEnter={() => setIsHoveringTitle(true)}
                  onMouseLeave={() => setIsHoveringTitle(false)}
                >
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {localTitle}
                  </span>
                  {isHoveringTitle && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTitle()
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Elimina titolo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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

      {/* ✅ Contenuto estratto (visibile solo se non collassato, scrollabile) */}
      {!isCollapsed && (
        <div className="p-3 space-y-3 overflow-auto flex-1">
          {/* Immagine estratto (senza bordo interno) */}
          {hasImage && extract.imageDataUrl && (
            <div className="rounded overflow-hidden">
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
