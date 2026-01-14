/**
 * ObservationBlock - Blocco osservazione (campo testo editabile)
 * Step 4: Componente per osservazioni con titolo editabile
 */

import React, { useState, useRef, useEffect } from 'react'
import { ObservationBlockProps } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { X, GripVertical } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

export const ObservationBlock: React.FC<ObservationBlockProps> = ({
  block,
  onUpdate,
  onRemove,
  onDragStart,
  onDragEnd,
  readOnly
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [block.content])

  const handleContentChange = (value: string) => {
    onUpdate({
      ...block,
      content: value
    })
  }

  // Handler per drag start dall'icona grip
  const handleGripDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e)
    }
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => !readOnly && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ✅ Controlli su hover in alto a destra */}
      {!readOnly && isHovered && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/90 rounded shadow-sm p-1">
          {/* ✅ Icona grip per trascinare */}
          {onDragStart && (
            <div
              ref={gripRef}
              draggable
              onDragStart={handleGripDragStart}
              onDragEnd={onDragEnd}
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors p-1"
              title="Trascina per riordinare"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* ✅ Icona cestino per eliminare */}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Elimina osservazione"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ✅ Solo textarea, senza wrapper esterno */}
      <Textarea
        ref={textareaRef}
        value={block.content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Inserisci osservazione..."
        readOnly={readOnly}
        className={cn(
          'min-h-[60px] resize-none overflow-hidden text-sm p-2 whitespace-pre-wrap break-words w-full',
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
