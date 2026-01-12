/**
 * CardBody - Corpo standard delle card con blocchi riorganizzabili
 * Step 3: Gestione estratti + osservazioni in layout flessibile
 */

import React, { useState, useCallback } from 'react'
import { CardBodyProps, Block, ExtractBlock, ObservationBlock, ExtractData } from '../types/blocks.types'
import { ExtractBlock as ExtractBlockComponent } from './ExtractBlock'
import { ObservationBlock as ObservationBlockComponent } from './ObservationBlock'
import { cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

export const CardBody: React.FC<CardBodyProps> = ({
  blocks,
  onBlocksChange,
  onExtractDrop,
  readOnly
}) => {
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null)
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null)

  // Crea nuovo blocco osservazione
  const handleAddObservation = useCallback((insertIndex?: number) => {
    const newBlock: ObservationBlock = {
      type: 'observation',
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      order: insertIndex !== undefined ? insertIndex : blocks.length,
      title: 'Osservazione',
      content: ''
    }

    const newBlocks = [...blocks]
    if (insertIndex !== undefined) {
      newBlocks.splice(insertIndex, 0, newBlock)
      // Ricalcola ordini
      newBlocks.forEach((b, i) => {
        b.order = i
      })
    } else {
      newBlocks.push(newBlock)
    }

    onBlocksChange(newBlocks)
  }, [blocks, onBlocksChange])

  // Rimuovi blocco
  const handleRemoveBlock = useCallback((blockId: string) => {
    const newBlocks = blocks.filter(b => b.id !== blockId)
    // Ricalcola ordini
    newBlocks.forEach((b, i) => {
      b.order = i
    })
    onBlocksChange(newBlocks)
  }, [blocks, onBlocksChange])

  // Aggiorna blocco
  const handleUpdateBlock = useCallback((updatedBlock: Block) => {
    const newBlocks = blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b)
    onBlocksChange(newBlocks)
  }, [blocks, onBlocksChange])

  // Drag start per riorganizzazione
  const handleBlockDragStart = useCallback((e: React.DragEvent, blockIndex: number) => {
    setDraggedBlockIndex(blockIndex)
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'block-reorder',
      blockIndex,
      block: blocks[blockIndex]
    }))
    e.dataTransfer.effectAllowed = 'move'
  }, [blocks])

  // Drop handler
  const handleDrop = useCallback((e: React.DragEvent, insertIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    setHoveredSlotIndex(null)

    try {
      const dragData = e.dataTransfer.getData('application/json')

      // Se è un estratto dal cassetto
      if (dragData) {
        const data = JSON.parse(dragData)

        if (data.type === 'extract' && data.extract) {
          const extractBlock: ExtractBlock = {
            type: 'extract',
            id: `extract_block_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            order: insertIndex,
            extract: data.extract as ExtractData,
            // ✅ Trasporta anche i metadati dal cassetto (titolo, osservazione, etc.)
            title: data.title || data.extract.title,
            observation: data.observation || data.extract.observation,
            hasObservation: data.hasObservation ?? data.extract.hasObservation ?? false,
            collapsed: data.collapsed ?? data.extract.collapsed ?? false
          }
          const newBlocks = [...blocks]
          newBlocks.splice(insertIndex, 0, extractBlock)
          newBlocks.forEach((b, i) => {
            b.order = i
          })
          onBlocksChange(newBlocks)
          return
        }

        // Se è riorganizzazione interna
        if (data.type === 'block-reorder' && typeof data.blockIndex === 'number') {
          const fromIndex = data.blockIndex
          if (fromIndex === insertIndex || fromIndex === insertIndex - 1) return

          const newBlocks = [...blocks]
          const [moved] = newBlocks.splice(fromIndex, 1)
          const adjustedIndex = fromIndex < insertIndex ? insertIndex - 1 : insertIndex
          newBlocks.splice(adjustedIndex, 0, moved)
          newBlocks.forEach((b, i) => {
            b.order = i
          })
          onBlocksChange(newBlocks)
          return
        }
      }

      // Se non c'è dragData, prova onExtractDrop callback
      if (onExtractDrop) {
        // onExtractDrop gestirà l'estratto dalla clipboard
        onExtractDrop(undefined, insertIndex)
      }
    } catch (err) {
      console.error('[CardBody] Errore durante drop:', err)
    }
  }, [blocks, onBlocksChange, onExtractDrop])

  const handleDragOver = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    setHoveredSlotIndex(slotIndex)
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragLeave = useCallback(() => {
    setHoveredSlotIndex(null)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedBlockIndex(null)
    setHoveredSlotIndex(null)
  }, [])

  // Slot di inserimento
  const InsertSlot: React.FC<{ index: number }> = ({ index }) => {
    const isHovered = hoveredSlotIndex === index

    return (
      <div
        className={cn(
          'relative transition-all',
          isHovered ? 'h-8' : 'h-2'
        )}
        onDrop={(e) => handleDrop(e, index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDragLeave={handleDragLeave}
      >
        <div
          className={cn(
            'absolute inset-0 rounded transition-colors',
            isHovered
              ? 'bg-blue-100 border-2 border-blue-500 border-dashed'
              : 'bg-transparent border border-transparent'
          )}
        />
        {isHovered && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-blue-600 font-medium">
              Rilascia qui
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">
        Contenuto
      </div>

      {blocks.length === 0 ? (
        <div
          className={cn(
            'p-4 border-2 border-dashed rounded-lg text-center transition-colors',
            hoveredSlotIndex === 0
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50'
          )}
          onDrop={(e) => handleDrop(e, 0)}
          onDragOver={(e) => handleDragOver(e, 0)}
          onDragLeave={handleDragLeave}
        >
          <p className="text-sm text-gray-500 mb-2">
            Trascina qui estratti o aggiungi osservazioni
          </p>
          {!readOnly && (
            <button
              onClick={() => handleAddObservation(0)}
              className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Aggiungi osservazione
            </button>
          )}
        </div>
      ) : (
        <>
          <InsertSlot index={0} />
          {blocks.map((block, index) => (
            <React.Fragment key={block.id}>
              {block.type === 'extract' ? (
                <ExtractBlockComponent
                  block={block}
                  onUpdate={!readOnly ? (updatedBlock) => {
                    const newBlocks = blocks.map(b =>
                      b.id === block.id ? updatedBlock : b
                    )
                    onBlocksChange(newBlocks)
                  } : undefined}
                  onRemove={!readOnly ? () => handleRemoveBlock(block.id) : undefined}
                  onDragStart={!readOnly ? (e) => handleBlockDragStart(e, index) : undefined}
                  readOnly={readOnly}
                />
              ) : (
                <ObservationBlockComponent
                  block={block}
                  onUpdate={handleUpdateBlock}
                  onRemove={!readOnly ? () => handleRemoveBlock(block.id) : undefined}
                  onDragStart={!readOnly ? (e) => handleBlockDragStart(e, index) : undefined}
                  readOnly={readOnly}
                />
              )}
              <InsertSlot index={index + 1} />
            </React.Fragment>
          ))}
        </>
      )}

      {!readOnly && blocks.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => handleAddObservation()}
            className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Aggiungi osservazione
          </button>
        </div>
      )}
    </div>
  )
}
