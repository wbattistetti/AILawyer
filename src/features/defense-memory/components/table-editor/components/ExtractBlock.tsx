/**
 * ExtractBlock - Blocco estratto (non editabile)
 * Step 4: Componente per visualizzare estratti nelle card
 */

import React from 'react'
import { ExtractBlockProps } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { FileText, Image as ImageIcon, X } from 'lucide-react'

export const ExtractBlock: React.FC<ExtractBlockProps> = ({
  block,
  onRemove,
  onDragStart,
  readOnly
}) => {
  const { extract } = block
  const hasImage = !!extract.imageDataUrl
  const hasText = !!extract.content && extract.content.trim().length > 0

  return (
    <div
      draggable={!readOnly}
      onDragStart={onDragStart}
      className={cn(
        'bg-white border border-gray-300 rounded-lg p-3 shadow-sm',
        !readOnly && 'cursor-move hover:shadow-md transition-all'
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

      {hasImage && extract.imageDataUrl && (
        <div className="mb-2 rounded overflow-hidden border border-gray-200">
          <img
            src={extract.imageDataUrl}
            alt="Estratto"
            className="w-full h-auto max-h-48 object-contain"
          />
        </div>
      )}

      {hasText && (
        <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
          {extract.content}
        </div>
      )}
    </div>
  )
}
