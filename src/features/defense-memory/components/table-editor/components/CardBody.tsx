/**
 * CardBody - Corpo standard delle card con blocchi riorganizzabili
 * Step 3: Gestione estratti + osservazioni in layout flessibile
 */

import React, { useState, useCallback, useEffect } from 'react'
import { CardBodyProps, Block, ExtractBlock, ObservationBlock, ExtractData } from '../types/blocks.types'
import { ExtractBlock as ExtractBlockComponent } from './ExtractBlock'
import { ObservationBlock as ObservationBlockComponent } from './ObservationBlock'
import { cn } from '@/lib/utils'

export const CardBody: React.FC<CardBodyProps> = ({
  blocks,
  onBlocksChange,
  onExtractDrop,
  readOnly
}) => {
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [targetInsertIndex, setTargetInsertIndex] = useState<number | null>(null) // ✅ Posizione target per riordino

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

  // ✅ Handler per calcolare la posizione di inserimento durante il drag su un blocco
  const handleBlockDragOver = useCallback((e: React.DragEvent, blockIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    // ✅ Calcola se il mouse è nella metà superiore o inferiore del blocco
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseY = e.clientY
    const blockCenterY = rect.top + rect.height / 2

    // Se il mouse è nella metà superiore, inserire prima del blocco
    // Se nella metà inferiore, inserire dopo il blocco
    const insertIndex = mouseY < blockCenterY ? blockIndex : blockIndex + 1

    console.log('[CardBody] handleBlockDragOver: impostato targetInsertIndex a', insertIndex, {
      blockIndex,
      draggedBlockIndex,
      mouseY,
      blockCenterY,
      rectTop: rect.top,
      rectHeight: rect.height,
      isDraggingBlock: draggedBlockIndex !== null
    })

    setTargetInsertIndex(insertIndex)

    // ✅ Imposta dropEffect in base a effectAllowed
    // Se effectAllowed è 'copy', usa 'copy' (pulsante osservazione)
    // Altrimenti usa 'move' (estratti o riordino blocchi)
    const effectAllowed = e.dataTransfer.effectAllowed
    if (effectAllowed === 'copy' || effectAllowed === 'copyMove') {
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'move'
    }
  }, [draggedBlockIndex])

  // Drop handler - gestisce sia nuovi estratti che riordino
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    console.log('[CardBody] handleDrop chiamato', {
      draggedBlockIndex,
      targetInsertIndex,
      blocksLength: blocks.length
    })

    // ✅ Se stiamo riordinando un blocco esistente, NON aggiungere nuove osservazioni
    if (draggedBlockIndex !== null) {
      // Gestisci solo il riordino, non aggiungere nuovi elementi
      try {
        const dragData = e.dataTransfer.getData('application/json')
        console.log('[CardBody] Drag data durante riordino:', dragData)

        if (dragData) {
          const data = JSON.parse(dragData)
          console.log('[CardBody] Parsed data:', data)

          if (data.type === 'block-reorder' && typeof data.blockIndex === 'number') {
            const fromIndex = data.blockIndex
            const toIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length

            console.log('[CardBody] Riordino:', { fromIndex, toIndex, targetInsertIndex })

            // ✅ Evita di spostare un blocco nella stessa posizione
            if (fromIndex === toIndex || (fromIndex < toIndex && fromIndex === toIndex - 1)) {
              console.log('[CardBody] ⚠️ Stessa posizione, ignoro')
              setTargetInsertIndex(null)
              setDraggedBlockIndex(null)
              return
            }

            const newBlocks = [...blocks]
            const [moved] = newBlocks.splice(fromIndex, 1)

            // ✅ Calcola l'indice corretto dopo la rimozione
            const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
            console.log('[CardBody] Adjusted index:', adjustedIndex)

            newBlocks.splice(adjustedIndex, 0, moved)

            // ✅ Ricalcola gli ordini
            newBlocks.forEach((b, i) => {
              b.order = i
            })

            console.log('[CardBody] ✅ Riordino completato, nuovi blocchi:', newBlocks.map(b => ({ type: b.type, order: b.order })))
            onBlocksChange(newBlocks)
            setTargetInsertIndex(null)
            setDraggedBlockIndex(null)
            return
          } else {
            console.log('[CardBody] ⚠️ Tipo non valido o blockIndex mancante:', data)
          }
        } else {
          console.log('[CardBody] ⚠️ Nessun dragData disponibile')
        }
      } catch (err) {
        console.error('[CardBody] Errore durante riordino:', err)
      }
      // ✅ Se siamo qui, c'è stato un problema con il riordino, ma NON aggiungere nuove osservazioni
      setTargetInsertIndex(null)
      setDraggedBlockIndex(null)
      return
    }

    // ✅ Solo se NON stiamo riordinando, gestisci nuovi estratti o osservazioni
    try {
      const dragData = e.dataTransfer.getData('application/json')
      console.log('[CardBody] ✅ Gestione nuovi elementi - dragData:', dragData)

      if (dragData) {
        const data = JSON.parse(dragData)
        console.log('[CardBody] ✅ Parsed data:', data)
        console.log('[CardBody] ✅ data.type:', data.type)
        console.log('[CardBody] ✅ data.extract:', data.extract)

        // ✅ Se è un'osservazione da ExtractBlock (ExtractObservation) da convertire in ObservationBlock
        if (data.type === 'extract-observation-move' && data.observation) {
          console.log('[CardBody] ✅ Tipo: extract-observation-move - convertendo ExtractObservation in ObservationBlock')

          // ✅ Verifica se il drop è avvenuto dentro un ExtractBlock
          const target = e.target as HTMLElement
          const isInsideExtractBlock = target.closest('[data-extract-block]') !== null

          if (isInsideExtractBlock) {
            console.log('[CardBody] ⚠️ Drop ExtractObservation dentro ExtractBlock, ExtractBlock lo gestirà')
            setTargetInsertIndex(null)
            return
          }

          // ✅ Converti ExtractObservation in ObservationBlock
          const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
          const newObservationBlock: ObservationBlock = {
            type: 'observation',
            id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            order: insertIndex,
            title: 'Osservazione',
            content: data.observation.content || ''
          }

          // ✅ Inserisci il nuovo ObservationBlock
          const newBlocks = [...blocks]
          newBlocks.splice(insertIndex, 0, newObservationBlock)

          // ✅ Ricalcola gli ordini
          newBlocks.forEach((b, i) => {
            b.order = i
          })

          onBlocksChange(newBlocks)

          // ✅ Emetti evento per rimuovere ExtractObservation dal ExtractBlock sorgente
          window.dispatchEvent(new CustomEvent('app:remove-extract-observation', {
            detail: { extractBlockId: data.sourceExtractBlockId, observationId: data.observationId }
          }))

          setTargetInsertIndex(null)
          return
        }

        // ✅ Se è il pulsante "Aggiungi osservazione" dall'header
        if (data.type === 'new-observation' && data.source === 'header-button') {
          // ✅ Verifica se il drop è avvenuto dentro un ExtractBlock
          // Se è così, ExtractBlock lo gestirà, quindi non fare nulla qui
          const target = e.target as HTMLElement
          const isInsideExtractBlock = target.closest('[data-extract-block]') !== null

          if (isInsideExtractBlock) {
            console.log('[CardBody] ⚠️ Drop "Aggiungi osservazione" dentro ExtractBlock, ExtractBlock lo gestirà')
            setTargetInsertIndex(null)
            return
          }

          console.log('[CardBody] ✅ Tipo: new-observation - aggiungendo ObservationBlock nel CardBody')
          // ✅ Usa targetInsertIndex se disponibile, altrimenti aggiungi alla fine
          const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
          handleAddObservation(insertIndex)
          setTargetInsertIndex(null)
          return
        }

        // Se è un estratto dal cassetto o overlay
        if (data.type === 'extract' && data.extract) {
          console.log('[CardBody] ✅ Tipo: extract - aggiungendo estratto')
          // ✅ Usa targetInsertIndex se disponibile, altrimenti aggiungi alla fine
          const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
          console.log('[CardBody] ✅ Insert index:', insertIndex)

          const extractBlock: ExtractBlock = {
            type: 'extract',
            id: `extract_block_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            order: insertIndex,
            extract: data.extract as ExtractData,
            title: data.title || data.extract.title,
            observation: data.observation || data.extract.observation,
            hasObservation: data.hasObservation ?? data.extract.hasObservation ?? false,
            observations: [], // ✅ Inizializza array osservazioni vuoto
            collapsed: data.collapsed ?? data.extract.collapsed ?? false
          }

          console.log('[CardBody] ✅ Created extractBlock:', extractBlock)

          const newBlocks = [...blocks]
          newBlocks.splice(insertIndex, 0, extractBlock)
          newBlocks.forEach((b, i) => {
            b.order = i
          })

          console.log('[CardBody] ✅ Calling onBlocksChange with:', newBlocks)
          onBlocksChange(newBlocks)

          // ✅ Se viene dall'overlay, aggiungilo anche al cassetto
          if (data.fromOverlay === true) {
            const updatedExtract: ExtractData = {
              ...(data.extract as ExtractData),
              title: data.title || data.extract.title,
              observation: data.observation || data.extract.observation,
              hasObservation: data.hasObservation ?? data.extract.hasObservation ?? false,
              collapsed: data.collapsed ?? data.extract.collapsed ?? false
            }

            window.dispatchEvent(new CustomEvent('app:extract-add', {
              detail: { extract: updatedExtract }
            }))
          }

          // ✅ Se viene dall'overlay, emetti evento per chiudere l'overlay
          if (data.fromOverlay === true && data.extract.id) {
            console.log('[CardBody] ✅ Estratto aggiunto dall\'overlay, emetto evento per chiudere overlay:', data.extract.id)
            window.dispatchEvent(new CustomEvent('app:extract-added-by-drag', {
              detail: { extractId: data.extract.id }
            }))
          }

          setTargetInsertIndex(null)
          return
        } else {
          console.log('[CardBody] ⚠️ data.type !== extract o data.extract mancante')
        }
      } else {
        console.log('[CardBody] ⚠️ Nessun dragData trovato')
      }

      // Se non c'è dragData, prova onExtractDrop callback (solo per nuovi estratti dalla clipboard)
      if (onExtractDrop) {
        console.log('[CardBody] ⚠️ Tentativo onExtractDrop callback')
        const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
        onExtractDrop(undefined, insertIndex)
        setTargetInsertIndex(null)
      }
    } catch (err) {
      console.error('[CardBody] Errore durante drop:', err)
      setTargetInsertIndex(null)
    }
  }, [blocks, onBlocksChange, onExtractDrop, targetInsertIndex, draggedBlockIndex, handleAddObservation])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // ✅ Se stiamo riordinando un blocco interno, non gestire il dragOver del container
    // (viene gestito dai singoli blocchi tramite handleBlockDragOver)
    if (draggedBlockIndex !== null) {
      return
    }

    setIsDragOver(true)

    // ✅ Imposta dropEffect in base a effectAllowed
    // Se effectAllowed è 'copy', usa 'copy' (pulsante osservazione)
    // Altrimenti usa 'move' (estratti o riordino blocchi)
    const effectAllowed = e.dataTransfer.effectAllowed
    if (effectAllowed === 'copy' || effectAllowed === 'copyMove') {
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'move'
    }
  }, [draggedBlockIndex])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Verifica che il mouse non sia ancora dentro il container
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false)
      setTargetInsertIndex(null) // ✅ Reset posizione target quando esci
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedBlockIndex(null)
    setIsDragOver(false)
    setTargetInsertIndex(null) // ✅ Reset posizione target
  }, [])

  // ✅ Listener per rimuovere ObservationBlock quando viene spostato in ExtractBlock
  useEffect(() => {
    const handleRemoveObservationBlock = (event: Event) => {
      const customEvent = event as CustomEvent<{ blockId: string }>
      const { blockId } = customEvent.detail

      const blockIndex = blocks.findIndex(b => b.id === blockId && b.type === 'observation')
      if (blockIndex !== -1) {
        console.log('[CardBody] Rimozione ObservationBlock:', blockId)
        const newBlocks = blocks.filter(b => b.id !== blockId)
        newBlocks.forEach((b, i) => {
          b.order = i
        })
        onBlocksChange(newBlocks)
      }
    }

    const handleRemoveObservationBlockByIndex = (event: Event) => {
      const customEvent = event as CustomEvent<{ blockIndex: number }>
      const { blockIndex } = customEvent.detail

      if (blockIndex >= 0 && blockIndex < blocks.length && blocks[blockIndex].type === 'observation') {
        console.log('[CardBody] Rimozione ObservationBlock per indice:', blockIndex)
        const newBlocks = blocks.filter((_, i) => i !== blockIndex)
        newBlocks.forEach((b, i) => {
          b.order = i
        })
        onBlocksChange(newBlocks)
      }
    }

    window.addEventListener('app:remove-observation-block', handleRemoveObservationBlock)
    window.addEventListener('app:remove-observation-block-by-index', handleRemoveObservationBlockByIndex)
    return () => {
      window.removeEventListener('app:remove-observation-block', handleRemoveObservationBlock)
      window.removeEventListener('app:remove-observation-block-by-index', handleRemoveObservationBlockByIndex)
    }
  }, [blocks, onBlocksChange])

  return (
    <div
      className={cn(
        'space-y-2 min-h-[200px] p-4',
        isDragOver && !readOnly ? 'bg-blue-50' : ''
      )}
      onDrop={!readOnly ? handleDrop : undefined}
      onDragOver={!readOnly ? handleDragOver : undefined}
      onDragLeave={!readOnly ? handleDragLeave : undefined}
    >
      {blocks.length === 0 ? (
        <div className="flex items-center justify-center h-[150px]">
          <p className="text-sm text-gray-400">
            Trascina qui estratti o aggiungi osservazioni
          </p>
        </div>
      ) : (
        <>
          {blocks.map((block, index) => (
            <React.Fragment key={block.id}>
              {/* ✅ Indicatore visivo per posizione di inserimento (prima del blocco) */}
              {targetInsertIndex === index && draggedBlockIndex !== null && draggedBlockIndex !== index && (
                <div className="h-1 bg-blue-500 rounded-full my-1 transition-all" />
              )}

              <div
                onDragOver={!readOnly ? (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleBlockDragOver(e, index)
                } : undefined}
                onDrop={!readOnly ? (e) => {
                  // ✅ Verifica se il drop è avvenuto dentro un ExtractBlock
                  const target = e.target as HTMLElement
                  const isInsideExtractBlock = target.closest('[data-extract-block]') !== null

                  if (isInsideExtractBlock) {
                    // ✅ ExtractBlock gestirà il drop, non fare nulla qui
                    return
                  }

                  // ✅ Gestisci il drop anche sul wrapper del blocco
                  e.preventDefault()
                  e.stopPropagation()
                  // Chiama lo stesso handler del container
                  handleDrop(e)
                } : undefined}
              >
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
                    onDragEnd={handleDragEnd}
                    readOnly={readOnly}
                  />
                )}
              </div>
            </React.Fragment>
          ))}

          {/* ✅ Indicatore visivo dopo l'ultimo blocco (per riordino o nuovo pulsante) */}
          {targetInsertIndex === blocks.length && (
            <div className="h-1 bg-blue-500 rounded-full my-1 transition-all" />
          )}
        </>
      )}

    </div>
  )
}
