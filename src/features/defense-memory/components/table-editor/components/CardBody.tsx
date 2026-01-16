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
  readOnly,
  rowId
}) => {
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [targetInsertIndex, setTargetInsertIndex] = useState<number | null>(null) // ✅ Posizione target per riordino
  const [dragKind, setDragKind] = useState<'internal-reorder' | 'external-move' | null>(null) // ✅ Tipo di drag esplicito

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

  // ✅ Helper per resettare tutto lo stato di drag
  const resetDragState = useCallback(() => {
    setDraggedBlockIndex(null)
    setDragKind(null)
    setTargetInsertIndex(null)
    setIsDragOver(false)
  }, [])

  // Drag start per riorganizzazione
  const handleBlockDragStart = useCallback((e: React.DragEvent, blockIndex: number) => {
    setDraggedBlockIndex(blockIndex)
    setDragKind('internal-reorder') // ✅ Imposta esplicitamente dragKind per riordino interno
    const dragData = {
      type: 'block-move',
      blockIndex,
      block: blocks[blockIndex],
      sourceRowId: rowId,
      sourceBlockId: blocks[blockIndex].id,
      sourceAreaId: `cardBody_${rowId}`, // ✅ Identifica l'area di drop sorgente
      dragKind: 'internal-reorder' // ✅ Includi dragKind nel drag data
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
    console.log('[CardBody] 🟢 DRAG START ObservationBlock:', {
      blockIndex,
      blockId: blocks[blockIndex].id,
      blockType: blocks[blockIndex].type,
      sourceAreaId: `cardBody_${rowId}`,
      dragKind: 'internal-reorder',
      dragData
    })
  }, [blocks, rowId])

  // ✅ Handler per calcolare la posizione di inserimento durante il drag su un blocco
  // ⚠️ ATTIVAZIONE SOLO PER RIORDINO INTERNO
  const handleBlockDragOver = useCallback((e: React.DragEvent, blockIndex: number) => {
    // ✅ Filtro duro: attivati SOLO se dragKind è 'internal-reorder' E draggedBlockIndex non è null
    // Se draggedBlockIndex è null, significa che non è un drag interno (anche se dragKind dice internal-reorder)
    if (dragKind !== 'internal-reorder' || draggedBlockIndex === null) {
      console.log('[CardBody] ⚠️ handleBlockDragOver: NON è riordino interno, ignoro', {
        dragKind,
        draggedBlockIndex,
        blockIndex
      })
      return  // ✅ Non gestire drag esterni qui
    }

    // ✅ CRITICO: Verifica se il mouse è dentro un ExtractBlock
    // Se sì, NON chiamare preventDefault e lascia che ExtractBlock gestisca l'evento
    // Questo permette di spostare ObservationBlock da CardBody a ExtractBlock
    const mouseX = e.clientX
    const mouseY = e.clientY
    const extractBlocks = document.querySelectorAll('[data-extract-block]')
    let isInsideExtractBlock = false

    for (const extractBlock of extractBlocks) {
      const rect = extractBlock.getBoundingClientRect()
      if (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      ) {
        isInsideExtractBlock = true
        console.log('[CardBody] 🔵 handleBlockDragOver: mouse dentro ExtractBlock, lascio gestire a ExtractBlock (per spostamento)')
        break
      }
    }

    // ✅ Se il mouse è dentro un ExtractBlock, NON chiamare preventDefault
    // Lascia che ExtractBlock gestisca il drop (permette spostamento da CardBody a ExtractBlock)
    if (isInsideExtractBlock) {
      return  // ✅ Nessun preventDefault, nessun stopPropagation - lascia passare l'evento
    }

    // ✅ Solo se il mouse è FUORI da ExtractBlock, procedi con il riordino interno
    e.preventDefault()
    e.stopPropagation()

    console.log('[CardBody] 🔵 handleBlockDragOver (internal-reorder) - DOPO preventDefault:', {
      blockIndex,
      dragKind,
      draggedBlockIndex,
      defaultPrevented: e.defaultPrevented,
      isInsideExtractBlock: false
    })

    // ✅ Calcola se il mouse è nella metà superiore o inferiore del blocco
    const rect = e.currentTarget.getBoundingClientRect()
    const blockCenterY = rect.top + rect.height / 2

    // Se il mouse è nella metà superiore, inserire prima del blocco
    // Se nella metà inferiore, inserire dopo il blocco
    const insertIndex = mouseY < blockCenterY ? blockIndex : blockIndex + 1

    console.log('[CardBody] 🔵 handleBlockDragOver (internal-reorder):', {
      blockIndex,
      dragKind,
      mouseY,
      blockCenterY,
      insertIndex
    })

    setTargetInsertIndex(insertIndex)

    // ✅ Imposta dropEffect in base a effectAllowed
    const effectAllowed = e.dataTransfer.effectAllowed
    if (effectAllowed === 'copy' || effectAllowed === 'copyMove') {
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragKind, draggedBlockIndex])

  // ✅ Handler dedicato per ExtractObservation → ObservationBlock
  const handleExtractObservationDrop = useCallback((data: any, e: React.DragEvent) => {
    console.log('[CardBody] ✅ handleExtractObservationDrop - convertendo ExtractObservation in ObservationBlock')

    const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
    const newObservationBlock: ObservationBlock = {
      type: 'observation',
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      order: insertIndex,
      title: 'Osservazione',
      content: data.observation.content || ''
    }

    const newBlocks = [...blocks]
    newBlocks.splice(insertIndex, 0, newObservationBlock)
    newBlocks.forEach((b, i) => {
      b.order = i
    })

    onBlocksChange(newBlocks)

    // ✅ Emetti evento per rimuovere ExtractObservation dal ExtractBlock sorgente
    window.dispatchEvent(new CustomEvent('app:remove-extract-observation', {
      detail: { extractBlockId: data.sourceExtractBlockId, observationId: data.observationId }
    }))

    resetDragState()
  }, [blocks, onBlocksChange, targetInsertIndex, resetDragState])

  // ✅ Handler dedicato per BlockMove (riordino interno + spostamento esterno)
  const handleBlockMoveDrop = useCallback((data: any, e: React.DragEvent) => {
    const sourceAreaId = data.sourceAreaId || `cardBody_${data.sourceRowId}`
    const targetAreaId = `cardBody_${rowId}`
    const isSameArea = sourceAreaId === targetAreaId

    console.log('[CardBody] 🔵 handleBlockMoveDrop:', {
      sourceAreaId,
      targetAreaId,
      isSameArea,
      blockType: data.block.type,
      blockId: data.block.id,
      sourceBlockId: data.sourceBlockId,
      blockIndex: data.blockIndex,
      targetInsertIndex,
      dragKind: data.dragKind
    })

    // ✅ Calcola l'indice di destinazione
    let toIndex = targetInsertIndex
    if (toIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseY = e.clientY
      toIndex = blocks.length
      blocks.forEach((block, index) => {
        const blockElement = e.currentTarget.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement
        if (blockElement) {
          const blockRect = blockElement.getBoundingClientRect()
          const blockCenterY = blockRect.top + blockRect.height / 2
          if (mouseY < blockCenterY && index < toIndex) {
            toIndex = index
          } else if (mouseY >= blockCenterY && index + 1 > toIndex) {
            toIndex = index + 1
          }
        }
      })
      if (toIndex === blocks.length && mouseY < rect.top + rect.height / 2) {
        toIndex = 0
      }
    }

    // ✅ REGOLA SEMPLICE: stessa area = riordino, area diversa = spostamento
    if (isSameArea && typeof data.blockIndex === 'number') {
      // ✅ RIORDINO nella stessa CardBody
      const fromIndex = data.blockIndex
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex

      if (adjustedIndex === fromIndex) {
        console.log('[CardBody] ⚠️ Stessa posizione, ignoro')
        resetDragState()
        return
      }

      console.log('[CardBody] ✅ RIORDINO interno:', { fromIndex, toIndex, adjustedIndex })
      const newBlocks = [...blocks]
      const [moved] = newBlocks.splice(fromIndex, 1)
      newBlocks.splice(adjustedIndex, 0, moved)
      newBlocks.forEach((b, i) => { b.order = i })
      onBlocksChange(newBlocks)
    } else {
      // ✅ SPOSTAMENTO da area diversa
      console.log('[CardBody] ✅ SPOSTAMENTO da area diversa:', {
        sourceAreaId,
        targetAreaId,
        toIndex,
        blockType: data.block.type
      })
      const movedBlock = { ...data.block }
      movedBlock.id = `${movedBlock.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`
      movedBlock.order = toIndex !== null ? toIndex : blocks.length

      const newBlocks = [...blocks]
      newBlocks.splice(toIndex !== null ? toIndex : blocks.length, 0, movedBlock)
      newBlocks.forEach((b, i) => { b.order = i })
      onBlocksChange(newBlocks)

      // ✅ Rimuovi dalla sorgente se è un'altra CardBody
      if (data.sourceRowId && data.sourceRowId !== rowId) {
        console.log('[CardBody] 🔴 Emetto evento remove-block-from-row:', {
          sourceRowId: data.sourceRowId,
          blockId: data.sourceBlockId || data.block.id
        })
        window.dispatchEvent(new CustomEvent('app:remove-block-from-row', {
          detail: { rowId: data.sourceRowId, blockId: data.sourceBlockId || data.block.id }
        }))
      }
    }

    resetDragState()
  }, [blocks, onBlocksChange, targetInsertIndex, rowId, resetDragState])

  // ✅ Handler dedicato per NewObservation (pulsante "Aggiungi osservazione")
  const handleNewObservationDrop = useCallback((data: any) => {
    const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
    handleAddObservation(insertIndex)
    resetDragState()
  }, [targetInsertIndex, blocks.length, handleAddObservation, resetDragState])

  // ✅ Handler dedicato per Extract (estratti dal cassetto o overlay)
  const handleExtractDrop = useCallback((data: any) => {
    const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length

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

    const newBlocks = [...blocks]
    newBlocks.splice(insertIndex, 0, extractBlock)
    newBlocks.forEach((b, i) => {
      b.order = i
    })

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
      window.dispatchEvent(new CustomEvent('app:extract-added-by-drag', {
        detail: { extractId: data.extract.id }
      }))
    }

    resetDragState()
  }, [blocks, onBlocksChange, targetInsertIndex, resetDragState])

  // ✅ Router principale - legge i dati UNA SOLA VOLTA e delega all'handler corretto
  const handleDrop = useCallback((e: React.DragEvent) => {
    console.log('[CardBody] 🔴🔴🔴 handleDrop INIZIO - evento ricevuto!', {
      readOnly,
      targetTag: (e.target as HTMLElement)?.tagName,
      targetClassName: (e.target as HTMLElement)?.className?.substring(0, 50),
      currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
      currentTargetClassName: (e.currentTarget as HTMLElement)?.className?.substring(0, 50),
      types: Array.from(e.dataTransfer.types),
      effectAllowed: e.dataTransfer.effectAllowed,
      draggedBlockIndex,
      dragKind,
      targetInsertIndex,
      blocksLength: blocks.length,
      eventDefaultPrevented: e.defaultPrevented,
      eventBubbles: e.bubbles,
      eventCancelable: e.cancelable
    })

    if (readOnly) {
      console.log('[CardBody] ⚠️ readOnly=true, esco')
      return
    }

    // ✅ PRIMA di tutto, verifica se il drop è dentro un ExtractBlock usando le coordinate del mouse
    // Questo è più affidabile di closest() perché funziona anche quando e.target è un elemento figlio profondo
    const target = e.target as HTMLElement
    const mouseX = e.clientX
    const mouseY = e.clientY

    // ✅ Trova tutti gli ExtractBlock e verifica se il mouse è dentro uno di essi
    const extractBlocks = document.querySelectorAll('[data-extract-block]')
    let isInsideExtractBlock = false

    for (const extractBlock of extractBlocks) {
      const rect = extractBlock.getBoundingClientRect()
      if (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      ) {
        isInsideExtractBlock = true
        break
      }
    }

    // ✅ CRITICO: Verifica se stiamo trascinando un'ExtractObservation
    // Se sì e il mouse è fuori da tutti gli ExtractBlock, gestisci l'evento qui
    let isExtractObservationDrag = false
    let sourceExtractBlockId: string | null = null

    try {
      const dragData = e.dataTransfer.getData('application/json')
      if (dragData) {
        const data = JSON.parse(dragData)
        if (data.type === 'extract-observation-move') {
          isExtractObservationDrag = true
          sourceExtractBlockId = data.sourceExtractBlockId
          console.log('[CardBody] 🔴 handleDrop: ExtractObservation in drag, sourceExtractBlockId:', sourceExtractBlockId)
        }
      }
    } catch (err) {
      // Ignora errori
    }

    console.log('[CardBody] 🔴 handleDrop chiamato:', {
      targetTag: target.tagName,
      targetClass: target.className,
      isInsideExtractBlock,
      isExtractObservationDrag,
      sourceExtractBlockId,
      mouseX,
      mouseY,
      draggedBlockIndex,
      dragKind
    })

    // ✅ Se stiamo trascinando un'ExtractObservation e il mouse è fuori da tutti gli ExtractBlock,
    // gestisci l'evento qui (anche se isInsideExtractBlock è true, potrebbe essere un falso positivo)
    if (isExtractObservationDrag && !isInsideExtractBlock) {
      console.log('[CardBody] ✅ Drop ExtractObservation FUORI ExtractBlock, gestisco qui')
      // Continua con la gestione normale del drop
    } else if (isInsideExtractBlock) {
      console.log('[CardBody] ⚠️ Drop dentro ExtractBlock (coordinate), ExtractBlock lo gestirà - ESCE')
      return  // ✅ Non gestire qui, lascia che ExtractBlock lo gestisca
    }

    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    console.log('[CardBody] 🔵 handleDrop chiamato', {
      draggedBlockIndex,
      targetInsertIndex,
      blocksLength: blocks.length
    })

    // ✅ CRITICO: Leggi i dati UNA SOLA VOLTA all'inizio
    let dragData: string | null = null
    let data: any = null

    try {
      dragData = e.dataTransfer.getData('application/json')
      if (!dragData) {
        // ✅ Se non c'è dragData, prova onExtractDrop callback (solo per nuovi estratti dalla clipboard)
        if (onExtractDrop) {
          const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
          onExtractDrop(undefined, insertIndex)
        }
        resetDragState()
        return
      }

      data = JSON.parse(dragData)
      console.log('[CardBody] 🔵 Drop data:', data)

      // ✅ Leggi dragKind dal drag data e aggiorna lo stato locale se necessario
      if (data.dragKind && data.dragKind !== dragKind) {
        setDragKind(data.dragKind)
      }

      // ✅ Router: delega all'handler corretto in base al tipo
      switch (data.type) {
        case 'extract-observation-move':
          if (data.observation) {
            return handleExtractObservationDrop(data, e)
          }
          break

        case 'block-move':
          if (data.block) {
            return handleBlockMoveDrop(data, e)
          }
          break

        case 'new-observation':
          if (data.source === 'header-button') {
            return handleNewObservationDrop(data)
          }
          break

        case 'extract':
          if (data.extract) {
            return handleExtractDrop(data)
          }
          break

        default:
          console.warn('[CardBody] ⚠️ Tipo di drag sconosciuto:', data.type)
      }

      // ✅ Se stiamo riordinando un blocco esistente nella stessa CardBody (legacy support)
      if (draggedBlockIndex !== null) {
        resetDragState()
        return
      }

      // ✅ Se non c'è dragData valido, prova onExtractDrop callback
      if (onExtractDrop) {
        const insertIndex = targetInsertIndex !== null ? targetInsertIndex : blocks.length
        onExtractDrop(undefined, insertIndex)
      }

      resetDragState()
    } catch (err) {
      console.error('[CardBody] Errore durante drop:', err)
      resetDragState()
    }
  }, [blocks, onBlocksChange, onExtractDrop, targetInsertIndex, draggedBlockIndex, handleAddObservation, rowId, resetDragState, dragKind, handleExtractObservationDrop, handleBlockMoveDrop, handleNewObservationDrop, handleExtractDrop])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    console.log('[CardBody] 🔵🔵🔵 handleDragOver INIZIO', {
      readOnly,
      targetTag: (e.target as HTMLElement)?.tagName,
      currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
      types: Array.from(e.dataTransfer.types),
      effectAllowed: e.dataTransfer.effectAllowed,
      dragKind,
      draggedBlockIndex,
      blocksLength: blocks.length
    })

    if (readOnly) {
      console.log('[CardBody] ⚠️ readOnly=true, esco')
      return
    }

    // ✅ Verifica se il mouse è dentro un ExtractBlock
    const mouseX = e.clientX
    const mouseY = e.clientY
    const extractBlocks = document.querySelectorAll('[data-extract-block]')
    let isInsideExtractBlock = false

    for (const extractBlock of extractBlocks) {
      const rect = extractBlock.getBoundingClientRect()
      if (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      ) {
        isInsideExtractBlock = true
        break
      }
    }

    // ✅ CRITICO: Verifica se stiamo trascinando un'ExtractObservation
    // Se sì e il mouse è dentro un ExtractBlock, lascia che ExtractBlock lo gestisca
    // Se il mouse è fuori, gestisci l'evento qui
    let isExtractObservationDrag = false
    try {
      const dragData = e.dataTransfer.getData('application/json')
      if (dragData) {
        const data = JSON.parse(dragData)
        if (data.type === 'extract-observation-move') {
          isExtractObservationDrag = true
          console.log('[CardBody] 🔵 handleDragOver: ExtractObservation in drag, sourceExtractBlockId:', data.sourceExtractBlockId)
        }
      }
    } catch (err) {
      // Ignora errori
    }

    // ✅ Se stiamo trascinando un'ExtractObservation e il mouse è dentro un ExtractBlock,
    // lascia che ExtractBlock lo gestisca (ExtractBlock verificherà se è dentro o fuori)
    if (isExtractObservationDrag && isInsideExtractBlock) {
      console.log('[CardBody] 🔵 handleDragOver: ExtractObservation in drag, mouse dentro ExtractBlock, lascio gestire a ExtractBlock')
      return  // ✅ Lascia che ExtractBlock lo gestisca
    }

    // ✅ Se stiamo trascinando un'ExtractObservation e il mouse è fuori da tutti gli ExtractBlock,
    // gestisci l'evento qui
    if (isExtractObservationDrag && !isInsideExtractBlock) {
      console.log('[CardBody] 🔵 handleDragOver: ExtractObservation in drag, mouse FUORI ExtractBlock, gestisco qui')
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
      e.dataTransfer.dropEffect = 'move'

      // ✅ Calcola targetInsertIndex
      const rect = e.currentTarget.getBoundingClientRect()
      let closestIndex = blocks.length
      let minDistance = Infinity

      blocks.forEach((block, index) => {
        const blockElement = e.currentTarget.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement
        if (blockElement) {
          const blockRect = blockElement.getBoundingClientRect()
          const blockCenterY = blockRect.top + blockRect.height / 2
          const distance = Math.abs(mouseY - blockCenterY)

          if (distance < minDistance) {
            minDistance = distance
            closestIndex = mouseY < blockCenterY ? index : index + 1
          }
        }
      })

      if (closestIndex === blocks.length) {
        const containerCenterY = rect.top + rect.height / 2
        closestIndex = mouseY < containerCenterY ? 0 : blocks.length
      }

      setTargetInsertIndex(closestIndex)
      return
    }

    // ✅ Se il mouse è dentro un ExtractBlock (e non stiamo trascinando un'ExtractObservation),
    // lascia che ExtractBlock lo gestisca
    if (isInsideExtractBlock) {
      console.log('[CardBody] 🔵 handleDragOver: mouse dentro ExtractBlock, lascio gestire a ExtractBlock')
      return
    }

    // ✅ Mouse è fuori da tutti gli ExtractBlock, gestisci l'evento
    e.preventDefault()
    e.stopPropagation()

    // ✅ CRITICO: Se dragKind è 'internal-reorder' ma draggedBlockIndex è null,
    // significa che lo stato è obsoleto (probabilmente da un drag precedente)
    // Resetta lo stato e imposta come drag esterno
    if (dragKind === 'internal-reorder' && draggedBlockIndex === null) {
      console.log('[CardBody] ⚠️ handleDragOver: dragKind=internal-reorder ma draggedBlockIndex=null, resetto stato e imposto external-move')
      resetDragState()
      setDragKind('external-move')
    }

    // ✅ Se dragKind è già impostato come 'internal-reorder' E draggedBlockIndex non è null,
    // è un riordino interno valido
    if (dragKind === 'internal-reorder' && draggedBlockIndex !== null) {
      setIsDragOver(true)
      const effectAllowed = e.dataTransfer.effectAllowed
      if (effectAllowed === 'copy' || effectAllowed === 'copyMove') {
        e.dataTransfer.dropEffect = 'copy'
      } else {
        e.dataTransfer.dropEffect = 'move'
      }
      return
    }

    // ✅ Se dragKind è null o external-move, imposta external-move
    if (dragKind === null || dragKind === 'external-move') {
      if (dragKind !== 'external-move') {
        console.log('[CardBody] 🔵 handleDragOver: imposto external-move')
        setDragKind('external-move')
      }
    }

    // ✅ Calcola targetInsertIndex per drag esterni
    const currentDragKind = dragKind === 'internal-reorder' && draggedBlockIndex === null ? 'external-move' : dragKind
    if (currentDragKind === null || currentDragKind === 'external-move') {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseY = e.clientY

      // ✅ Trova quale blocco è più vicino al punto del mouse
      let closestIndex = blocks.length
      let minDistance = Infinity

      blocks.forEach((block, index) => {
        const blockElement = e.currentTarget.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement
        if (blockElement) {
          const blockRect = blockElement.getBoundingClientRect()
          const blockCenterY = blockRect.top + blockRect.height / 2
          const distance = Math.abs(mouseY - blockCenterY)

          if (distance < minDistance) {
            minDistance = distance
            closestIndex = mouseY < blockCenterY ? index : index + 1
          }
        }
      })

      if (closestIndex === blocks.length) {
        const containerCenterY = rect.top + rect.height / 2
        closestIndex = mouseY < containerCenterY ? 0 : blocks.length
      }

      console.log('[CardBody] 🔵 handleDragOver (external-move):', {
        dragKind,
        mouseY,
        closestIndex,
        blocksLength: blocks.length
      })

      setTargetInsertIndex(closestIndex)
    }

    setIsDragOver(true)

    // ✅ Imposta dropEffect in base a effectAllowed
    const effectAllowed = e.dataTransfer.effectAllowed
    if (effectAllowed === 'copy' || effectAllowed === 'copyMove') {
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragKind, draggedBlockIndex, blocks, resetDragState])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Verifica che il mouse non sia ancora dentro il container
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false)
      // ✅ NON resettare targetInsertIndex qui - viene resettato in handleDragEnd o handleDrop
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    console.log('[CardBody] 🔴🔴🔴 handleDragEnd CHIAMATO - resetto stato drag:', {
      draggedBlockIndex,
      dragKind,
      targetInsertIndex,
      blocksLength: blocks.length
    })
    resetDragState()
  }, [resetDragState, draggedBlockIndex, dragKind, targetInsertIndex, blocks.length])

  // ✅ Listener per rimuovere blocchi quando vengono spostati
  // ✅ Listener globale per tracciare tutti gli eventi drop
  useEffect(() => {
    const globalDropHandler = (e: DragEvent) => {
      console.log('[CardBody] 🌍🌍🌍 GLOBAL DROP EVENT:', {
        targetTag: (e.target as HTMLElement)?.tagName,
        currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
        types: Array.from(e.dataTransfer?.types || []),
        effectAllowed: e.dataTransfer?.effectAllowed,
        defaultPrevented: e.defaultPrevented,
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        eventPhase: e.eventPhase
      })
    }

    // ✅ Listener in fase di capture per intercettare PRIMA di tutti gli altri
    document.addEventListener('drop', globalDropHandler, true)

    return () => {
      document.removeEventListener('drop', globalDropHandler, true)
    }
  }, [])

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

    // ✅ Listener per rimuovere blocchi quando vengono spostati in altre CardBody
    const handleRemoveBlockFromRow = (event: Event) => {
      const customEvent = event as CustomEvent<{ rowId: string, blockId: string }>
      const { rowId: targetRowId, blockId } = customEvent.detail

      // ✅ Solo se è questa CardBody
      if (targetRowId === rowId) {
        const blockIndex = blocks.findIndex(b => b.id === blockId)
        if (blockIndex !== -1) {
          console.log('[CardBody] Rimozione blocco spostato in altra CardBody:', blockId)
          const newBlocks = blocks.filter(b => b.id !== blockId)
          newBlocks.forEach((b, i) => {
            b.order = i
          })
          onBlocksChange(newBlocks)

          // ✅ CRITICO: Resetta lo stato di drag perché il blocco è stato droppato altrove
          // Il drop è avvenuto in ExtractBlock, quindi CardBody non ha ricevuto onDragEnd
          resetDragState()
          console.log('[CardBody] 🔴 Resetto stato drag dopo rimozione blocco (drop in ExtractBlock)')
        }
      }
    }

    // ✅ Listener per ExtractObservation droppata fuori dall'ExtractBlock
    const handleExtractObservationDropOutside = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      const data = customEvent.detail

      console.log('[CardBody] 🟢 Custom event extract-observation-drop-outside ricevuto:', data)

      if (data.type === 'extract-observation-move' && data.observation) {
        // ✅ Calcola targetInsertIndex in base alle coordinate del mouse
        const mouseY = data.mouseY
        const rect = document.querySelector(`[data-card-body="true"][data-row-id="${rowId}"]`)?.getBoundingClientRect()

        if (rect) {
          let closestIndex = blocks.length
          let minDistance = Infinity

          blocks.forEach((block, index) => {
            const blockElement = document.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement
            if (blockElement) {
              const blockRect = blockElement.getBoundingClientRect()
              const blockCenterY = blockRect.top + blockRect.height / 2
              const distance = Math.abs(mouseY - blockCenterY)

              if (distance < minDistance) {
                minDistance = distance
                closestIndex = mouseY < blockCenterY ? index : index + 1
              }
            }
          })

          if (closestIndex === blocks.length) {
            const containerCenterY = rect.top + rect.height / 2
            closestIndex = mouseY < containerCenterY ? 0 : blocks.length
          }

          setTargetInsertIndex(closestIndex)

          // ✅ Chiama handleExtractObservationDrop con i dati
          const syntheticEvent = {
            clientX: data.mouseX,
            clientY: data.mouseY,
            preventDefault: () => {},
            stopPropagation: () => {}
          } as React.DragEvent

          handleExtractObservationDrop(data, syntheticEvent)
        }
      }
    }

    window.addEventListener('app:remove-observation-block', handleRemoveObservationBlock)
    window.addEventListener('app:remove-observation-block-by-index', handleRemoveObservationBlockByIndex)
    window.addEventListener('app:remove-block-from-row', handleRemoveBlockFromRow)
    window.addEventListener('app:extract-observation-drop-outside', handleExtractObservationDropOutside)
    return () => {
      window.removeEventListener('app:remove-observation-block', handleRemoveObservationBlock)
      window.removeEventListener('app:remove-observation-block-by-index', handleRemoveObservationBlockByIndex)
      window.removeEventListener('app:remove-block-from-row', handleRemoveBlockFromRow)
      window.removeEventListener('app:extract-observation-drop-outside', handleExtractObservationDropOutside)
    }
  }, [blocks, onBlocksChange, rowId, handleExtractObservationDrop, setTargetInsertIndex, resetDragState])

  return (
    <div
      data-card-body="true"
      data-row-id={rowId}
      className={cn(
        'space-y-2 min-h-[200px] p-4',
        isDragOver && !readOnly ? 'bg-blue-50' : ''
      )}
      onDrop={!readOnly ? (e) => {
        console.log('[CardBody] 🔴🔴🔴 CONTAINER PRINCIPALE onDrop chiamato')
        handleDrop(e)
      } : undefined}
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
                data-block-id={block.id}
                onDragOver={!readOnly ? (e) => {
                  // ✅ handleBlockDragOver già controlla se il mouse è dentro un ExtractBlock
                  // Qui chiamiamo preventDefault/stopPropagation solo se handleBlockDragOver lo fa
                  // Ma in realtà, handleBlockDragOver gestisce già preventDefault, quindi qui non serve
                  // Ma dobbiamo chiamarlo per permettere a handleBlockDragOver di decidere
                  handleBlockDragOver(e, index)
                } : undefined}
                onDrop={!readOnly ? (e) => {
                  // ✅ Gestisci il drop anche sul wrapper del blocco
                  console.log('[CardBody] 🔴🔴🔴 WRAPPER onDrop chiamato per blocco:', {
                    blockId: block.id,
                    blockIndex: index,
                    blockType: block.type
                  })

                  // ✅ CRITICO: Verifica se il mouse è dentro un ExtractBlock
                  // Se sì, NON chiamare preventDefault/stopPropagation e NON chiamare handleDrop
                  // Lascia che ExtractBlock gestisca il drop (permette spostamento da CardBody a ExtractBlock)
                  const mouseX = e.clientX
                  const mouseY = e.clientY
                  const extractBlocks = document.querySelectorAll('[data-extract-block]')
                  let isInsideExtractBlock = false

                  for (const extractBlock of extractBlocks) {
                    const rect = extractBlock.getBoundingClientRect()
                    if (
                      mouseX >= rect.left &&
                      mouseX <= rect.right &&
                      mouseY >= rect.top &&
                      mouseY <= rect.bottom
                    ) {
                      // ✅ Se questo blocco stesso è un ExtractBlock, lascia che gestisca il drop
                      // Altrimenti, se è un altro ExtractBlock, lascia che gestisca il drop
                      isInsideExtractBlock = true
                      console.log('[CardBody] 🔴 WRAPPER onDrop: mouse dentro ExtractBlock, lascio gestire a ExtractBlock (per spostamento)')
                      break
                    }
                  }

                  // ✅ Se il mouse è dentro un ExtractBlock, NON gestire qui
                  // Lascia che ExtractBlock gestisca il drop
                  if (isInsideExtractBlock) {
                    return  // ✅ Nessun preventDefault, nessun stopPropagation - lascia passare l'evento
                  }

                  // ✅ Solo se il mouse è FUORI da ExtractBlock, procedi con il drop normale
                  e.preventDefault()
                  e.stopPropagation()
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
