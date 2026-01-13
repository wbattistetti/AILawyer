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
  const [isDragOver, setIsDragOver] = useState(false)

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

  // Drop handler - aggiunge sempre alla fine
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    try {
      const dragData = e.dataTransfer.getData('application/json')

      // Se è un estratto dal cassetto
      if (dragData) {
        const data = JSON.parse(dragData)

        if (data.type === 'extract' && data.extract) {
          const extractBlock: ExtractBlock = {
            type: 'extract',
            id: `extract_block_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            order: blocks.length,
            extract: data.extract as ExtractData,
            // ✅ Trasporta anche i metadati dal cassetto (titolo, osservazione, etc.)
            title: data.title || data.extract.title,
            observation: data.observation || data.extract.observation,
            hasObservation: data.hasObservation ?? data.extract.hasObservation ?? false,
            collapsed: data.collapsed ?? data.extract.collapsed ?? false
          }
          const newBlocks = [...blocks, extractBlock]
          newBlocks.forEach((b, i) => {
            b.order = i
          })
          onBlocksChange(newBlocks)

          // ✅ Se viene dall'overlay, aggiungilo anche al cassetto dispatchando l'evento app:extract-add
          if (data.fromOverlay === true) {
            const updatedExtract: ExtractData = {
              ...(data.extract as ExtractData),
              title: data.title || data.extract.title,
              observation: data.observation || data.extract.observation,
              hasObservation: data.hasObservation ?? data.extract.hasObservation ?? false,
              collapsed: data.collapsed ?? data.extract.collapsed ?? false
            }

            // ✅ Dispatcha l'evento per aggiungere al cassetto (formato: detail: { extract })
            window.dispatchEvent(new CustomEvent('app:extract-add', {
              detail: { extract: updatedExtract }
            }))
          }

          return
        }

        // Se è riorganizzazione interna, ignora (gestita dai blocchi stessi)
        if (data.type === 'block-reorder' && typeof data.blockIndex === 'number') {
          // La riorganizzazione interna viene gestita dai blocchi stessi tramite onDragStart
          return
        }
      }

      // Se non c'è dragData, prova onExtractDrop callback
      if (onExtractDrop) {
        // onExtractDrop gestirà l'estratto dalla clipboard, aggiungendolo alla fine
        onExtractDrop(undefined, blocks.length)
      }
    } catch (err) {
      console.error('[CardBody] Errore durante drop:', err)
    }
  }, [blocks, onBlocksChange, onExtractDrop])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Verifica che il mouse non sia ancora dentro il container
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedBlockIndex(null)
    setIsDragOver(false)
  }, [])

  return (
    <div
      className={cn(
        'space-y-2 min-h-[100px] transition-colors',
        isDragOver && !readOnly ? 'bg-blue-50 border-2 border-blue-300 border-dashed rounded-lg' : ''
      )}
      onDrop={!readOnly ? handleDrop : undefined}
      onDragOver={!readOnly ? handleDragOver : undefined}
      onDragLeave={!readOnly ? handleDragLeave : undefined}
    >
      {blocks.length === 0 ? (
        <div className="p-4 border-2 border-dashed rounded-lg text-center border-gray-300 bg-gray-50">
          <p className="text-sm text-gray-500 mb-2">
            Trascina qui estratti o aggiungi osservazioni
          </p>
          {!readOnly && (
            <button
              onClick={() => handleAddObservation()}
              className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Aggiungi osservazione
            </button>
          )}
        </div>
      ) : (
        <>
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
                  onDragEnd={handleDragEnd}
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
