/**
 * ObservationBlock - Blocco osservazione (campo testo editabile)
 * Step 4: Componente per osservazioni con titolo editabile
 */

import React, { useState, useRef, useEffect } from 'react'
import { ObservationBlockProps } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { MessageSquare, X, Edit2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

export const ObservationBlock: React.FC<ObservationBlockProps> = ({
  block,
  onUpdate,
  onRemove,
  onDragStart,
  readOnly
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(block.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus input quando si inizia a editare
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [block.content])

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    if (titleValue !== block.title) {
      onUpdate({
        ...block,
        title: titleValue || 'Osservazione'
      })
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleBlur()
    } else if (e.key === 'Escape') {
      setTitleValue(block.title)
      setIsEditingTitle(false)
    }
  }

  const handleContentChange = (value: string) => {
    onUpdate({
      ...block,
      content: value
    })
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={onDragStart}
      className={cn(
        'bg-white border border-gray-300 rounded-lg p-3 shadow-sm',
        !readOnly && 'cursor-move hover:shadow-md transition-all'
      )}
    >
      {/* Header con titolo editabile */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
          {isEditingTitle && !readOnly ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="flex-1 text-sm font-medium text-gray-900 border border-blue-500 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Titolo osservazione"
            />
          ) : (
            <div
              className="flex items-center gap-1 flex-1 min-w-0 group"
              onClick={!readOnly ? () => setIsEditingTitle(true) : undefined}
            >
              <span className="text-sm font-medium text-gray-900 truncate">
                {block.title || 'Osservazione'}
              </span>
              {!readOnly && (
                <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              )}
            </div>
          )}
        </div>
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

      {/* Textarea per contenuto */}
      <Textarea
        ref={textareaRef}
        value={block.content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Inserisci osservazione..."
        readOnly={readOnly}
        className={cn(
          'min-h-[60px] resize-none overflow-hidden text-sm p-2 whitespace-pre-wrap break-words',
          'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
        )}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement
          target.style.height = 'auto'
          target.style.height = `${target.scrollHeight}px`
        }}
      />
    </div>
  )
}
