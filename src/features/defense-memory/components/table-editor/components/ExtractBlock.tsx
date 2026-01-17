/**
 * ExtractBlock - Blocco estratto (non editabile) con titolo e osservazione
 * Step 4: Componente per visualizzare estratti nelle card
 */

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { ExtractBlockProps, ExtractObservation } from '../types/blocks.types'
import { cn } from '@/lib/utils'
import { FileText, Image as ImageIcon, X, ChevronDown, ChevronUp, Plus, Trash2, Eye, GripVertical } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { NoteEditor } from './NoteEditor'

export const ExtractBlock: React.FC<ExtractBlockProps> = ({
  block,
  onUpdate,
  onRemove,
  onDragStart,
  onDragEnd,
  readOnly,
  isOverlay = false,
  overlayHeaderOffset = 60,
  overlayContentHeight,
  onExpandInModal,
  isImageLoading = false
}) => {
  const { extract, title, observation, hasObservation = false, collapsed = false, observations = [] } = block
  const [isCollapsed, setIsCollapsed] = useState(collapsed)
  const [localTitle, setLocalTitle] = useState(title || '')
  const [localObservation, setLocalObservation] = useState(observation || '')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isHoveringTitle, setIsHoveringTitle] = useState(false)
  const [hasObservationLocal, setHasObservationLocal] = useState(hasObservation) // ✅ DEPRECATO: per retrocompatibilità
  const [localObservations, setLocalObservations] = useState<ExtractObservation[]>(observations || [])
  const [draggedObservationId, setDraggedObservationId] = useState<string | null>(null) // ✅ ID osservazione in drag
  const [hoveredObservationId, setHoveredObservationId] = useState<string | null>(null) // ✅ ID osservazione in hover

  // ✅ Refs per gestire il focus
  const titleInputRef = useRef<HTMLInputElement>(null)
  const observationTextareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldFocusTitleRef = useRef(false)
  const shouldFocusObservationRef = useRef(false)
  const contentContainerRef = useRef<HTMLDivElement>(null) // ✅ Ref per il container del contenuto estratto (immagine/testo)
  const mainContentRef = useRef<HTMLDivElement>(null) // ✅ Ref per il container principale (tutto il contenuto)
  const onUpdateRef = useRef(onUpdate) // ✅ Ref per onUpdate per evitare dipendenze nel useEffect
  const blockRef = useRef(block) // ✅ Ref per block per evitare dipendenze nel useEffect

  // ✅ Aggiorna i refs quando cambiano
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    blockRef.current = block
  }, [block])
  const isInternalUpdateRef = useRef(false) // ✅ Flag per tracciare aggiornamenti interni
  const activeDragDataRef = useRef<{ observationId: string, observation: ExtractObservation, sourceExtractBlockId: string } | null>(null) // ✅ Ref per salvare i dati del drag attivo

  // ✅ Sincronizza stato locale con props quando cambiano
  useEffect(() => {
    setIsCollapsed(collapsed)
  }, [collapsed])

  useEffect(() => {
    // ✅ Solo aggiorna localTitle se il titolo è cambiato esternamente E non stiamo editando
    // Questo previene la perdita del focus durante l'editing
    if (!isEditingTitle) {
      setLocalTitle(title || '')
    }
  }, [title, isEditingTitle])

  useEffect(() => {
    setLocalObservation(observation || '')
  }, [observation])

  // ✅ Sincronizza localObservations con observations solo se l'aggiornamento è esterno
  const prevObservationsRef = useRef<ExtractObservation[]>(observations || [])
  useEffect(() => {
    // ✅ Se l'aggiornamento è interno, non sincronizzare (evita loop)
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false
      prevObservationsRef.current = observations || []
      return
    }

    // ✅ Confronto profondo per evitare loop: confronta solo se l'array è realmente cambiato
    const currentObservations = observations || []
    const prevObservations = prevObservationsRef.current

    // ✅ Confronta lunghezza e contenuti
    if (currentObservations.length !== prevObservations.length ||
        currentObservations.some((obs, idx) =>
          obs.id !== prevObservations[idx]?.id ||
          obs.content !== prevObservations[idx]?.content
        )) {
      setLocalObservations(currentObservations)
      prevObservationsRef.current = currentObservations
    }
  }, [observations])

  // ✅ Migrazione: se c'è observation ma non observations[], migra i dati
  const hasMigratedRef = useRef(false)
  useEffect(() => {
    if (!hasMigratedRef.current && observation && hasObservation && (!observations || observations.length === 0)) {
      hasMigratedRef.current = true
      const migratedObservation: ExtractObservation = {
        id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        content: observation,
        position: 'after',
        order: 0
      }
      setLocalObservations([migratedObservation])
      if (onUpdateRef.current) {
        isInternalUpdateRef.current = true
        onUpdateRef.current({ ...blockRef.current, observations: [migratedObservation], observation: undefined, hasObservation: false })
      }
    }
  }, [observation, hasObservation, observations]) // ✅ Dipendenze corrette

  // ✅ Sincronizza hasObservationLocal con hasObservation
  // ✅ Se hasObservation diventa true (da false), imposta il flag per il focus
  const prevHasObservationRef = useRef(hasObservation)
  useEffect(() => {
    const wasFalse = !prevHasObservationRef.current
    const isNowTrue = hasObservation

    // ✅ Se è passato da false a true, imposta il flag per il focus
    if (wasFalse && isNowTrue) {
      console.log('🟢 [ExtractBlock] hasObservation passato da false a true, imposto focus')
      shouldFocusObservationRef.current = true
    }

    prevHasObservationRef.current = hasObservation
    setHasObservationLocal(hasObservation)
  }, [hasObservation])

  // ✅ Se hasObservation diventa false, resetta anche localObservation
  useEffect(() => {
    if (!hasObservation) {
      setLocalObservation('')
    }
  }, [hasObservation])

  // ✅ Aggiorna i ref quando cambiano
  useEffect(() => {
    onUpdateRef.current = onUpdate
    blockRef.current = block
  }, [onUpdate, block])

  // ✅ Listener per rimuovere ExtractObservation quando viene spostata
  useEffect(() => {
    const handleRemoveExtractObservation = (event: Event) => {
      const customEvent = event as CustomEvent<{ extractBlockId: string, observationId: string }>
      const { extractBlockId, observationId } = customEvent.detail

      // ✅ Solo se è questo ExtractBlock
      if (extractBlockId === blockRef.current.id) {
        console.log('[ExtractBlock] Rimozione ExtractObservation:', observationId)

        // ✅ Marca come aggiornamento interno per evitare sincronizzazione
        isInternalUpdateRef.current = true

        // ✅ Usa la funzione di aggiornamento funzionale per calcolare il nuovo valore
        setLocalObservations(prev => {
          const updatedObservations = prev.filter(obs => obs.id !== observationId)

          // ✅ Aggiorna il blocco usando il ref con il valore aggiornato
          if (onUpdateRef.current) {
            onUpdateRef.current({ ...blockRef.current, observations: updatedObservations })
          }

          return updatedObservations
        })
      }
    }

    window.addEventListener('app:remove-extract-observation', handleRemoveExtractObservation)
    return () => {
      window.removeEventListener('app:remove-extract-observation', handleRemoveExtractObservation)
    }
  }, []) // ✅ Nessuna dipendenza: il listener usa ref per accedere ai valori correnti

  // ✅ Ref per draggedObservationId per il listener globale
  const draggedObservationIdRef = useRef<string | null>(null)
  useEffect(() => {
    draggedObservationIdRef.current = draggedObservationId
  }, [draggedObservationId])

  // ✅ Listener globale per intercettare drop quando avviene fuori dall'ExtractBlock
  useEffect(() => {
    const handleGlobalDrop = (e: DragEvent) => {
      console.log('[ExtractBlock] 🌍🌍🌍 GLOBAL DROP LISTENER chiamato:', {
        activeDragDataRef: activeDragDataRef.current,
        draggedObservationIdRef: draggedObservationIdRef.current,
        blockId: blockRef.current.id,
        targetTag: (e.target as HTMLElement)?.tagName,
        types: e.dataTransfer ? Array.from(e.dataTransfer.types) : [],
        effectAllowed: e.dataTransfer?.effectAllowed
      })

      // ✅ Solo se stiamo trascinando un'ExtractObservation da questo ExtractBlock
      if (activeDragDataRef.current === null) {
        console.log('[ExtractBlock] 🌍 GLOBAL DROP: activeDragDataRef è null, esco')
        return
      }

      // ✅ Verifica che il drag sia da questo ExtractBlock
      if (activeDragDataRef.current.sourceExtractBlockId !== blockRef.current.id) {
        console.log('[ExtractBlock] 🌍 GLOBAL DROP: drag non è da questo ExtractBlock, esco')
        return
      }

      // ✅ Verifica se il drop è avvenuto fuori dall'ExtractBlock
      const extractBlockElement = document.querySelector(`[data-extract-block-id="${blockRef.current.id}"]`) as HTMLElement
      if (!extractBlockElement) {
        console.log('[ExtractBlock] 🌍 GLOBAL DROP: ExtractBlock element non trovato, esco')
        return
      }

      const rect = extractBlockElement.getBoundingClientRect()
      const mouseX = e.clientX
      const mouseY = e.clientY

      const isInsideThisExtractBlock = (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      )

      console.log('[ExtractBlock] 🌍 GLOBAL DROP: coordinate check:', {
        isInsideThisExtractBlock,
        mouseX,
        mouseY,
        rectLeft: rect.left,
        rectRight: rect.right,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        draggedObservationId: draggedObservationIdRef.current
      })

      // ✅ Se il drop è FUORI dall'ExtractBlock, emetti il custom event
      if (!isInsideThisExtractBlock) {
        console.log('[ExtractBlock] 🌍🌍🌍 GLOBAL DROP: ExtractObservation drop FUORI ExtractBlock, emetto custom event', {
          activeDragData: activeDragDataRef.current,
          mouseX,
          mouseY,
          rectLeft: rect.left,
          rectRight: rect.right,
          rectTop: rect.top,
          rectBottom: rect.bottom
        })

        try {
          // ✅ Usa i dati salvati in activeDragDataRef invece di leggere da e.dataTransfer
          // (che potrebbe essere già stato consumato o non essere disponibile)
          if (activeDragDataRef.current) {
            const data = {
              type: 'extract-observation-move',
              observationId: activeDragDataRef.current.observationId,
              observation: activeDragDataRef.current.observation,
              sourceExtractBlockId: activeDragDataRef.current.sourceExtractBlockId,
              sourceAreaId: `extractBlock_${activeDragDataRef.current.sourceExtractBlockId}`,
              dragKind: 'external-move'
            }
            console.log('[ExtractBlock] 🌍 GLOBAL DROP: data da activeDragDataRef:', data)
            // ✅ Emetti un custom event che il CardBody può ascoltare
            window.dispatchEvent(new CustomEvent('app:extract-observation-drop-outside', {
              detail: {
                data,
                mouseX: e.clientX,
                mouseY: e.clientY
              }
            }))
            console.log('[ExtractBlock] 🌍🌍🌍 GLOBAL DROP: Custom event emesso!')
            // ✅ Resetta activeDragDataRef dopo aver emesso l'evento
            activeDragDataRef.current = null
          } else {
            console.log('[ExtractBlock] 🌍 GLOBAL DROP: activeDragDataRef è null')
          }
        } catch (err) {
          console.error('[ExtractBlock] Errore durante emissione custom event da global drop:', err)
        }
      } else {
        console.log('[ExtractBlock] 🌍 GLOBAL DROP: drop DENTRO ExtractBlock, non emetto custom event')
      }
    }

    window.addEventListener('drop', handleGlobalDrop, true) // ✅ Usa capture phase per intercettare prima
    console.log('[ExtractBlock] 🌍 Listener globale drop registrato per blockId:', blockRef.current.id)
    return () => {
      window.removeEventListener('drop', handleGlobalDrop, true)
      console.log('[ExtractBlock] 🌍 Listener globale drop rimosso per blockId:', blockRef.current.id)
    }
  }, []) // ✅ Nessuna dipendenza: il listener usa ref per accedere ai valori correnti

  // ✅ Focus sul title input quando isEditingTitle diventa true
  useLayoutEffect(() => {
    if (isEditingTitle && titleInputRef.current && shouldFocusTitleRef.current) {
      // ✅ Imposta il focus immediatamente dopo il render
      titleInputRef.current.focus()
      shouldFocusTitleRef.current = false
    }
  }, [isEditingTitle])

  // ✅ Focus sulla textarea osservazione quando hasObservationLocal diventa true
  useLayoutEffect(() => {
    if (hasObservationLocal && observationTextareaRef.current) {
      if (shouldFocusObservationRef.current) {
        // ✅ Imposta il focus immediatamente dopo il render
        observationTextareaRef.current.focus()
        shouldFocusObservationRef.current = false
      }
    }
  }, [hasObservationLocal])

  const hasImage = !!extract.imageDataUrl
  const hasText = !!extract.content && extract.content.trim().length > 0

  // ✅ Aggiorna il blocco quando cambiano titolo o osservazione
  // Nota: handleTitleChange non viene più usato per il titolo (ora gestito direttamente nell'Input)
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
    shouldFocusObservationRef.current = true // ✅ Imposta flag per focus
    // ✅ NON chiamare onUpdate qui - verrà chiamato quando la textarea prende il focus e viene modificata
    // Questo evita re-render che causano perdita di focus
    setLocalObservation('') // ✅ Inizializza con stringa vuota
    setHasObservationLocal(true) // ✅ Aggiorna stato locale senza chiamare onUpdate
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

  // ✅ Handler per drag start di un'osservazione dentro ExtractBlock
  const handleObservationDragStart = (e: React.DragEvent, observationId: string) => {
    if (readOnly) return

    // ✅ Ferma la propagazione per evitare che il drag dell'ExtractBlock venga attivato
    e.stopPropagation()

    const observation = localObservations.find(obs => obs.id === observationId)
    if (!observation) return

    setDraggedObservationId(observationId)
    // ✅ Salva i dati del drag in un ref che non viene resettato fino a quando il drop non è completato
    activeDragDataRef.current = {
      observationId,
      observation,
      sourceExtractBlockId: block.id
    }
    const dragData = {
      type: 'extract-observation-move',
      observationId,
      observation,
      sourceExtractBlockId: block.id,
      sourceAreaId: `extractBlock_${block.id}`, // ✅ Identifica l'area di drop sorgente
      dragKind: 'external-move' // ✅ Imposta esplicitamente dragKind per drag esterno
    }
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
    console.log('[ExtractBlock] 🟢 DRAG START ExtractObservation:', { observationId, sourceExtractBlockId: block.id, observation, dragKind: 'external-move', activeDragDataRef: activeDragDataRef.current })
  }

  // ✅ Handler per drag end di un'osservazione
  const handleObservationDragEnd = () => {
    setDraggedObservationId(null)
    // ✅ Resetta activeDragDataRef dopo un breve delay per dare tempo al drop event di essere processato
    setTimeout(() => {
      activeDragDataRef.current = null
      console.log('[ExtractBlock] 🔴 DRAG END ExtractObservation: activeDragDataRef resettato')
    }, 100)
  }

  // ✅ Wrapper per onDragStart del ExtractBlock che previene il drag se proviene da un'ExtractObservation
  const handleExtractBlockDragStart = (e: React.DragEvent) => {
    // ✅ Verifica se il drag proviene da un'ExtractObservation
    const target = e.target as HTMLElement
    const isFromObservation = target.closest('[data-observation-id]') !== null ||
                               target.closest('[draggable]')?.getAttribute('data-observation-id') !== null ||
                               draggedObservationId !== null

    if (isFromObservation) {
      console.log('[ExtractBlock] ⚠️ Drag da ExtractObservation, prevengo drag ExtractBlock')
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // ✅ Altrimenti, procedi con il drag normale del ExtractBlock
    if (onDragStart) {
      onDragStart(e)
    }
  }

  // ✅ Handler per dragOver di un'osservazione (per riordino dentro ExtractBlock)
  const handleObservationDragOver = (e: React.DragEvent, observationId: string) => {
    if (readOnly) return

    e.preventDefault()
    e.stopPropagation()

    // ✅ Verifica se è un'osservazione in drag
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('application/json')) {
      try {
        const dragData = e.dataTransfer.getData('application/json')
        if (dragData) {
          const data = JSON.parse(dragData)
          if (data.type === 'extract-observation-move' || data.type === 'observation-move' || (data.type === 'block-move' && data.block?.type === 'observation')) {
            e.dataTransfer.dropEffect = 'move'
            console.log('[ExtractBlock] 🔵 handleObservationDragOver:', {
              observationId,
              dragType: data.type,
              blockType: data.block?.type
            })
          }
        }
      } catch (err) {
        // Ignora errori
      }
    }
  }

  // ✅ Handler per drop del pulsante "Aggiungi osservazione" dentro l'estratto
  const handleDrop = (e: React.DragEvent) => {
    console.log('[ExtractBlock] 🔴🔴🔴 handleDrop INIZIO - evento ricevuto!', {
      readOnly,
      targetTag: (e.target as HTMLElement)?.tagName,
      currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
      types: Array.from(e.dataTransfer.types),
      effectAllowed: e.dataTransfer.effectAllowed,
      thisBlockId: block.id,
      draggedObservationId
    })

    if (readOnly) {
      console.log('[ExtractBlock] ⚠️ readOnly=true, esco')
      return
    }

    // ✅ CRITICO: Se stiamo trascinando un'ExtractObservation da questo ExtractBlock,
    // verifica se il mouse è fuori. Se sì, NON gestire affatto l'evento - lascia che CardBody lo gestisca
    if (draggedObservationId !== null) {
      const extractBlockElement = e.currentTarget as HTMLElement
      const rect = extractBlockElement.getBoundingClientRect()
      const mouseX = e.clientX
      const mouseY = e.clientY

      const isInsideThisExtractBlock = (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      )

      console.log('[ExtractBlock] 🔴 handleDrop: ExtractObservation in drag, coordinate check:', {
        isInsideThisExtractBlock,
        mouseX,
        mouseY,
        rectLeft: rect.left,
        rectRight: rect.right,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        thisBlockId: block.id,
        draggedObservationId
      })

      // ✅ Se il mouse è FUORI e stiamo trascinando un'osservazione, NON gestire qui
      // In React, anche se facciamo return senza preventDefault, l'evento potrebbe non propagarsi
      // Quindi emettiamo un custom event che il CardBody può ascoltare
      if (!isInsideThisExtractBlock) {
        console.log('[ExtractBlock] ⚠️ Drop ExtractObservation FUORI ExtractBlock (coordinate), emetto custom event per CardBody')

        // ✅ Leggi i dati del drag prima di emettere l'evento
        try {
          const dragData = e.dataTransfer.getData('application/json')
          if (dragData) {
            const data = JSON.parse(dragData)
            // ✅ Emetti un custom event che il CardBody può ascoltare
            window.dispatchEvent(new CustomEvent('app:extract-observation-drop-outside', {
              detail: {
                ...data,
                mouseX: e.clientX,
                mouseY: e.clientY
              }
            }))
          }
        } catch (err) {
          console.error('[ExtractBlock] Errore durante emissione custom event:', err)
        }

        // ✅ NON chiamare preventDefault/stopPropagation - lascia che l'evento si propaghi anche naturalmente
        // Il CardBody gestirà sia l'evento naturale che il custom event
        return
      }
    }

    // ✅ Verifica se il drop è DENTRO questo ExtractBlock usando le coordinate del mouse
    // Questo è più affidabile di contains() perché funziona anche quando e.target è un elemento figlio profondo
    const extractBlockElement = e.currentTarget as HTMLElement
    const rect = extractBlockElement.getBoundingClientRect()
    const mouseX = e.clientX
    const mouseY = e.clientY

    const isInsideThisExtractBlock = (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    )

    const target = e.target as HTMLElement
    console.log('[ExtractBlock] 🔴 handleDrop chiamato:', {
      targetTag: target.tagName,
      targetClass: target.className,
      isInsideThisExtractBlock,
      mouseX,
      mouseY,
      rectLeft: rect.left,
      rectRight: rect.right,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      thisBlockId: block.id
    })

    // ✅ Se il drop è FUORI, NON gestire - lascia che CardBody lo gestisca
    // Ma DEVI chiamare preventDefault per evitare il comportamento di default del browser,
    // poi ri-triggerare l'evento sul parent
    if (!isInsideThisExtractBlock) {
      console.log('[ExtractBlock] ⚠️ Drop FUORI ExtractBlock (coordinate), re-triggero sul parent CardBody')

      // ✅ NON chiamare preventDefault - lascia che l'evento si propaghi naturalmente
      // Questo permetterà al CardBody di riceverlo
      return
    }

    // ✅ Solo se il drop è DENTRO, gestisci
    e.preventDefault()
    e.stopPropagation()

    try {
      const dragData = e.dataTransfer.getData('application/json')
      if (!dragData) {
        return
      }

      const data = JSON.parse(dragData)
      console.log('[ExtractBlock] 🔴 DROP ricevuto DENTRO ExtractBlock:', { type: data.type, sourceExtractBlockId: data.sourceExtractBlockId, thisBlockId: block.id })

      // ✅ Se è un'osservazione da CardBody (ObservationBlock) da convertire in ExtractObservation
      // Gestisce sia 'observation-move' che 'block-move' con block.type === 'observation'
      if ((data.type === 'observation-move' || (data.type === 'block-move' && data.block?.type === 'observation')) && data.block) {
        console.log('[ExtractBlock] 🔴 DROP ObservationBlock dentro ExtractBlock:', {
          dragType: data.type,
          blockType: data.block.type,
          blockId: data.block.id,
          sourceAreaId: data.sourceAreaId,
          sourceRowId: data.sourceRowId,
          sourceBlockId: data.sourceBlockId,
          blockIndex: data.blockIndex,
          thisBlockId: block.id
        })

        // ✅ Determina la posizione (before/after) in base alla posizione del mouse
        const mainContainer = mainContentRef.current
        const contentContainer = contentContainerRef.current

        if (!mainContainer) {
          console.log('[ExtractBlock] ⚠️ mainContainer non trovato, esco')
          return
        }

        const mainRect = mainContainer.getBoundingClientRect()
        const mouseY = e.clientY

        let referenceRect = mainRect
        if (contentContainer) {
          referenceRect = contentContainer.getBoundingClientRect()
        }

        const contentCenterY = referenceRect.top + referenceRect.height / 2
        const position: 'before' | 'after' = mouseY < contentCenterY ? 'before' : 'after'

        // ✅ Trova l'ordine massimo per le osservazioni nella stessa posizione
        const observationsInPosition = localObservations.filter(obs => obs.position === position)
        const maxOrder = observationsInPosition.length > 0
          ? Math.max(...observationsInPosition.map(obs => obs.order))
          : -1

        // ✅ Converti ObservationBlock in ExtractObservation
        const newObservation: ExtractObservation = {
          id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          content: data.block.content || '',
          position,
          order: maxOrder + 1
        }

        const updatedObservations = [...localObservations, newObservation]
        setLocalObservations(updatedObservations)

        console.log('[ExtractBlock] ✅ Drop ObservationBlock dentro estratto, convertita in ExtractObservation:', {
          position,
          order: newObservation.order,
          newObservationId: newObservation.id,
          contentLength: newObservation.content.length
        })

        // ✅ Aggiorna il blocco
        if (onUpdate) {
          onUpdate({ ...block, observations: updatedObservations })
        }

        // ✅ Emetti evento per rimuovere ObservationBlock dal CardBody
        // Se è un block-move, usa sourceRowId per rimuoverlo dalla riga corretta
        if (data.type === 'block-move' && data.sourceRowId) {
          console.log('[ExtractBlock] 🔴 Emetto evento remove-block-from-row:', {
            sourceRowId: data.sourceRowId,
            blockId: data.sourceBlockId || data.block.id
          })
          window.dispatchEvent(new CustomEvent('app:remove-block-from-row', {
            detail: { rowId: data.sourceRowId, blockId: data.sourceBlockId || data.block.id }
          }))
        } else if (data.type === 'block-move' && typeof data.blockIndex === 'number') {
          console.log('[ExtractBlock] 🔴 Emetto evento remove-observation-block-by-index:', {
            blockIndex: data.blockIndex
          })
          window.dispatchEvent(new CustomEvent('app:remove-observation-block-by-index', {
            detail: { blockIndex: data.blockIndex }
          }))
        } else {
          console.log('[ExtractBlock] 🔴 Emetto evento remove-observation-block:', {
            blockId: data.block.id
          })
          window.dispatchEvent(new CustomEvent('app:remove-observation-block', {
            detail: { blockId: data.block.id }
          }))
        }

        return
      }

      // ✅ Se è un'osservazione da ExtractBlock (riordino o spostamento)
      if (data.type === 'extract-observation-move' && data.observation) {
        const sourceAreaId = data.sourceAreaId || `extractBlock_${data.sourceExtractBlockId}`
        const targetAreaId = `extractBlock_${block.id}`
        const isSameArea = sourceAreaId === targetAreaId

        // ✅ REGOLA SEMPLICE: stessa area = riordino, area diversa = spostamento
        if (isSameArea) {
          // ✅ RIORDINO nella stessa ExtractBlock
          // ✅ Riordino osservazione dentro stesso ExtractBlock
          const draggedObs = localObservations.find(obs => obs.id === data.observationId)
          if (!draggedObs) {
            setDraggedObservationId(null)
            return
          }

          // ✅ Determina la posizione target in base al mouse
          const mainContainer = mainContentRef.current
          const contentContainer = contentContainerRef.current

          if (!mainContainer) {
            setDraggedObservationId(null)
            return
          }

          const mainRect = mainContainer.getBoundingClientRect()
          const mouseY = e.clientY

          let referenceRect = mainRect
          if (contentContainer) {
            referenceRect = contentContainer.getBoundingClientRect()
          }

          const contentCenterY = referenceRect.top + referenceRect.height / 2
          const targetPosition: 'before' | 'after' = mouseY < contentCenterY ? 'before' : 'after'

          // ✅ Se la posizione è cambiata, sposta l'osservazione
          if (draggedObs.position !== targetPosition) {
            const updatedObservations = localObservations.map(obs => {
              if (obs.id === data.observationId) {
                // ✅ Sposta in nuova posizione con ordine massimo
                const observationsInNewPosition = localObservations.filter(
                  o => o.position === targetPosition && o.id !== data.observationId
                )
                const maxOrder = observationsInNewPosition.length > 0
                  ? Math.max(...observationsInNewPosition.map(o => o.order))
                  : -1
                return { ...obs, position: targetPosition, order: maxOrder + 1 }
              }
              return obs
            })
            setLocalObservations(updatedObservations)
            if (onUpdate) {
              onUpdate({ ...block, observations: updatedObservations })
            }
          } else {
            // ✅ Stessa posizione, riordina per ordine
            // Trova l'osservazione più vicina al punto di drop
            const observationsInSamePosition = localObservations.filter(
              o => o.position === targetPosition && o.id !== data.observationId
            )

            // ✅ Calcola quale osservazione è più vicina al punto di drop
            let targetOrder = draggedObs.order
            for (const obs of observationsInSamePosition) {
              const obsElement = mainContainer.querySelector(`[data-observation-id="${obs.id}"]`) as HTMLElement
              if (obsElement) {
                const obsRect = obsElement.getBoundingClientRect()
                const obsCenterY = obsRect.top + obsRect.height / 2
                if (mouseY < obsCenterY && obs.order < targetOrder) {
                  targetOrder = obs.order
                } else if (mouseY >= obsCenterY && obs.order > targetOrder) {
                  targetOrder = obs.order + 1
                }
              }
            }

            // ✅ Riordina le osservazioni
            const updatedObservations = localObservations.map(obs => {
              if (obs.id === data.observationId) {
                return { ...obs, order: targetOrder }
              }
              // ✅ Sposta altre osservazioni se necessario
              if (obs.position === targetPosition && obs.id !== data.observationId) {
                if (obs.order >= targetOrder && draggedObs.order < obs.order) {
                  return { ...obs, order: obs.order + 1 }
                } else if (obs.order <= targetOrder && draggedObs.order > obs.order) {
                  return { ...obs, order: obs.order - 1 }
                }
              }
              return obs
            })

            // ✅ Normalizza gli ordini
            const sorted = updatedObservations
              .filter(o => o.position === targetPosition)
              .sort((a, b) => a.order - b.order)
            sorted.forEach((obs, index) => {
              const found = updatedObservations.find(o => o.id === obs.id)
              if (found) {
                found.order = index
              }
            })

            setLocalObservations(updatedObservations)
            if (onUpdate) {
              onUpdate({ ...block, observations: updatedObservations })
            }
          }

          setDraggedObservationId(null)
          return
        } else {
          // ✅ SPOSTAMENTO da ExtractBlock diverso (area diversa)
          const mainContainer = mainContentRef.current
          const contentContainer = contentContainerRef.current

          if (!mainContainer) return

          const mainRect = mainContainer.getBoundingClientRect()
          const mouseY = e.clientY

          let referenceRect = mainRect
          if (contentContainer) {
            referenceRect = contentContainer.getBoundingClientRect()
          }

          const contentCenterY = referenceRect.top + referenceRect.height / 2
          const position: 'before' | 'after' = mouseY < contentCenterY ? 'before' : 'after'

          const observationsInPosition = localObservations.filter(obs => obs.position === position)
          const maxOrder = observationsInPosition.length > 0
            ? Math.max(...observationsInPosition.map(obs => obs.order))
            : -1

          const newObservation: ExtractObservation = {
            id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            content: data.observation.content,
            position,
            order: maxOrder + 1
          }

          const updatedObservations = [...localObservations, newObservation]
          setLocalObservations(updatedObservations)

          if (onUpdate) {
            onUpdate({ ...block, observations: updatedObservations })
          }

          // ✅ Emetti evento per rimuovere osservazione dal ExtractBlock sorgente
          window.dispatchEvent(new CustomEvent('app:remove-extract-observation', {
            detail: { extractBlockId: data.sourceExtractBlockId, observationId: data.observationId }
          }))

          setDraggedObservationId(null)
          return
        }
      }

      // ✅ Se è il pulsante "Aggiungi osservazione" dall'header
      if (data.type === 'new-observation' && data.source === 'header-button') {
        // ✅ Determina la posizione (before/after) in base alla posizione del mouse rispetto al contenuto estratto
        const mainContainer = mainContentRef.current
        const contentContainer = contentContainerRef.current

        if (!mainContainer) return

        const mainRect = mainContainer.getBoundingClientRect()
        const mouseY = e.clientY

        // ✅ Se c'è un contentContainer, usa quello per determinare la posizione
        // Altrimenti usa il mainContainer
        let referenceRect = mainRect
        if (contentContainer) {
          referenceRect = contentContainer.getBoundingClientRect()
        }

        // ✅ Se il mouse è nella metà superiore del contenuto estratto, posizione 'before', altrimenti 'after'
        const contentCenterY = referenceRect.top + referenceRect.height / 2
        const position: 'before' | 'after' = mouseY < contentCenterY ? 'before' : 'after'

        // ✅ Trova l'ordine massimo per le osservazioni nella stessa posizione
        const observationsInPosition = localObservations.filter(obs => obs.position === position)
        const maxOrder = observationsInPosition.length > 0
          ? Math.max(...observationsInPosition.map(obs => obs.order))
          : -1

        // ✅ Crea nuova osservazione con testo predefinito
        const defaultText = `Come si vede nel documento <strong>${extract.source}</strong>, a pagina numero <strong>${extract.page}</strong>...`
        const newObservation: ExtractObservation = {
          id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          content: defaultText,
          position,
          order: maxOrder + 1
        }

        const updatedObservations = [...localObservations, newObservation]
        setLocalObservations(updatedObservations)

        console.log('[ExtractBlock] ✅ Drop "Aggiungi osservazione" dentro estratto, aggiunta osservazione:', { position, order: newObservation.order })

        // ✅ Aggiorna il blocco
        if (onUpdate) {
          onUpdate({ ...block, observations: updatedObservations })
        }

        // ✅ Focus sulla nuova osservazione dopo il render
        setTimeout(() => {
          const newObservationElement = document.querySelector(`[data-observation-id="${newObservation.id}"]`)
          if (newObservationElement) {
            // ✅ Cerca il div contentEditable dentro NoteEditor
            const editorElement = newObservationElement.querySelector('[contenteditable="true"]') as HTMLElement | null
            if (editorElement) {
              editorElement.focus()
              // ✅ Posiziona il cursore alla fine
              const range = document.createRange()
              const selection = window.getSelection()
              range.selectNodeContents(editorElement)
              range.collapse(false)
              selection?.removeAllRanges()
              selection?.addRange(range)
            }
          }
        }, 100)
      }
    } catch (err) {
      console.error('[ExtractBlock] Errore durante drop:', err)
    }
  }

  // ✅ Handler per dragOver dentro l'estratto
  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return

    console.log('[ExtractBlock] 🔵🔵🔵 handleDragOver INIZIO', {
      targetTag: (e.target as HTMLElement)?.tagName,
      currentTargetTag: (e.currentTarget as HTMLElement)?.tagName,
      types: Array.from(e.dataTransfer.types),
      effectAllowed: e.dataTransfer.effectAllowed,
      draggedObservationId
    })

    // ✅ CRITICO: Se stiamo trascinando un'ExtractObservation da questo ExtractBlock,
    // e il mouse è FUORI dall'ExtractBlock, NON chiamare preventDefault/stopPropagation
    // per permettere al CardBody di ricevere l'evento
    if (draggedObservationId !== null) {
      const extractBlockElement = e.currentTarget as HTMLElement
      const rect = extractBlockElement.getBoundingClientRect()
      const mouseX = e.clientX
      const mouseY = e.clientY

      const isInsideThisExtractBlock = (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      )

      console.log('[ExtractBlock] 🔵 handleDragOver: ExtractObservation in drag, coordinate check:', {
        isInsideThisExtractBlock,
        mouseX,
        mouseY,
        rectLeft: rect.left,
        rectRight: rect.right,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        thisBlockId: block.id,
        draggedObservationId
      })

      // ✅ Se il mouse è FUORI e stiamo trascinando un'osservazione, lascia passare l'evento
      if (!isInsideThisExtractBlock) {
        console.log('[ExtractBlock] ⚠️ handleDragOver: ExtractObservation in drag ma mouse FUORI ExtractBlock, lascio passare evento - NO preventDefault/stopPropagation')
        return  // ✅ Nessun preventDefault, nessun stopPropagation - lascia passare l'evento al CardBody
      }
    }

    // ✅ Verifica se il mouse è dentro questo ExtractBlock usando le coordinate
    const extractBlockElement = e.currentTarget as HTMLElement
    const rect = extractBlockElement.getBoundingClientRect()
    const mouseX = e.clientX
    const mouseY = e.clientY

    const isInsideThisExtractBlock = (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    )

    console.log('[ExtractBlock] 🔵 handleDragOver coordinate check:', {
      isInsideThisExtractBlock,
      mouseX,
      mouseY,
      rectLeft: rect.left,
      rectRight: rect.right,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      thisBlockId: block.id
    })

    // ✅ Se il mouse è FUORI dall'ExtractBlock, NON gestire affatto l'evento
    // Lascia che si propaghi al CardBody
    if (!isInsideThisExtractBlock) {
      console.log('[ExtractBlock] ⚠️ handleDragOver: mouse FUORI ExtractBlock (coordinate), lascio passare evento - NO preventDefault/stopPropagation')
      return  // ✅ Nessun preventDefault, nessun stopPropagation - lascia passare l'evento
    }

    // ✅ Solo se il mouse è DENTRO, gestisci l'evento
    e.preventDefault()
    e.stopPropagation()

    const types = Array.from(e.dataTransfer.types)
    const effectAllowed = e.dataTransfer.effectAllowed

    // ✅ Prova a leggere i dati del drag per logging
    let dragType = 'unknown'
    if (types.includes('application/json')) {
      try {
        const dragData = e.dataTransfer.getData('application/json')
        if (dragData) {
          const data = JSON.parse(dragData)
          dragType = data.type || 'unknown'
          console.log('[ExtractBlock] 🔵 handleDragOver DENTRO ExtractBlock:', {
            dragType,
            blockType: data.block?.type,
            sourceAreaId: data.sourceAreaId,
            effectAllowed,
            isInsideThisExtractBlock: true
          })
        }
      } catch (err) {
        // Ignora errori
      }
    }

    // ✅ Se è 'copy' e ha 'application/json', potrebbe essere "new-observation"
    if (effectAllowed === 'copy' && types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'copy'
    } else if (types.includes('application/json')) {
      // ✅ Potrebbe essere un'osservazione da CardBody o da altro ExtractBlock
      e.dataTransfer.dropEffect = 'move'
    }
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={!readOnly ? handleExtractBlockDragStart : undefined}
      onDragEnd={onDragEnd}
      onDragOver={!readOnly ? handleDragOver : undefined}
      onDrop={!readOnly ? handleDrop : undefined} // ✅ Sempre presente - handleDrop gestisce la logica
      data-extract-block="true"
      data-extract-block-id={block.id} // ✅ ID per il listener globale
      className={cn(
        'bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col',
        !readOnly && 'cursor-move hover:shadow-md transition-all'
      )}
    >
      {/* ✅ Header fisso (sticky) con label non editabile e titolo */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-gray-200 bg-white z-10',
          isOverlay ? 'p-2' : 'p-3 sticky top-0', // ✅ Padding ridotto quando è overlay
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
                    console.log('🟠 [ExtractBlock] Click su "Aggiungi titolo"', {
                      target: e.target,
                      currentTarget: e.currentTarget,
                      isOverlay,
                      bubbles: e.bubbles
                    })
                    e.stopPropagation()
                    shouldFocusTitleRef.current = true // ✅ Imposta flag per focus
                    setIsEditingTitle(true)
                  }}
                  onMouseDown={(e) => {
                    console.log('🟠 [ExtractBlock] MouseDown su "Aggiungi titolo"', {
                      target: e.target,
                      currentTarget: e.currentTarget
                    })
                    e.stopPropagation()
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors flex-shrink-0"
                >
                  Aggiungi titolo
                </button>
              ) : isEditingTitle ? (
                <Input
                  ref={titleInputRef} // ✅ Aggiungi ref
                  value={localTitle}
                  onChange={(e) => {
                    e.stopPropagation()
                    // ✅ Aggiorna solo localTitle, non chiamare onUpdate immediatamente
                    setLocalTitle(e.target.value)
                  }}
                  onBlur={(e) => {
                    e.stopPropagation()
                    // ✅ Chiama onUpdate solo quando si perde il focus, usando il valore corrente
                    const currentValue = (e.target as HTMLInputElement).value
                    setLocalTitle(currentValue) // ✅ Sincronizza localTitle
                    if (onUpdate) {
                      onUpdate({ ...block, title: currentValue })
                    }
                    handleTitleBlur()
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      // ✅ Chiama onUpdate quando si preme Enter, usando il valore corrente
                      const currentValue = (e.target as HTMLInputElement).value
                      setLocalTitle(currentValue) // ✅ Sincronizza localTitle
                      if (onUpdate) {
                        onUpdate({ ...block, title: currentValue })
                      }
                      handleTitleBlur()
                    }
                  }}
                  placeholder="Puoi inserire se vuoi un titolo qui..."
                  className="text-sm font-medium border border-gray-300 rounded px-2 py-1 h-auto focus-visible:ring-1 focus-visible:ring-blue-500 flex-1 min-w-0 placeholder:text-gray-400"
                />
              ) : (
                <div
                  className="flex items-center gap-2 flex-1 min-w-0"
                  onMouseEnter={() => setIsHoveringTitle(true)}
                  onMouseLeave={() => setIsHoveringTitle(false)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    // ✅ Doppio click per entrare in editing
                    shouldFocusTitleRef.current = true
                    setIsEditingTitle(true)
                  }}
                >
                  <span className="text-sm font-medium text-gray-900 truncate cursor-text">
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
          {/* ✅ Icona occhio per espandere a grandezza naturale */}
          {!readOnly && onExpandInModal && (
            <button
              onClick={(e) => {
                e.stopPropagation() // ✅ Evita di triggerare il toggle collapse
                if (onExpandInModal) {
                  onExpandInModal()
                }
              }}
              className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
              title="Espandi a grandezza naturale"
            >
              <Eye className="h-4 w-4" />
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

      {/* ✅ Contenuto estratto (visibile solo se non collassato, scrollabile) */}
      {!isCollapsed && (
        <div
          ref={mainContentRef}
          className={isOverlay ? "flex-1" : "p-3 space-y-3 overflow-auto flex-1"}
          style={isOverlay ? {
            // ✅ Quando è overlay, il contenuto inizia subito dopo l'header (nessun padding-top, nessun space-y)
            paddingTop: 0,
            marginTop: 0,
            padding: 0, // ✅ Rimuovi anche padding laterale per allineare perfettamente lo screenshot
            // ✅ Imposta altezza esatta del contenuto per mostrare tutto il rettangolo selezionato
            minHeight: overlayContentHeight ? `${overlayContentHeight}px` : 'auto',
            height: overlayContentHeight ? `${overlayContentHeight}px` : 'auto'
          } : undefined}
          onDragOver={!readOnly ? handleDragOver : undefined}
          onDrop={!readOnly ? handleDrop : undefined}
        >
          {/* ✅ Osservazioni PRIMA del contenuto estratto */}
          {localObservations
            .filter(obs => obs.position === 'before')
            .sort((a, b) => a.order - b.order)
            .map((observation) => (
              <div
                key={observation.id}
                data-observation-id={observation.id}
                className={cn(
                  "relative mb-2 border-b border-gray-200 pb-2",
                  draggedObservationId === observation.id && "opacity-50"
                )}
                onMouseEnter={() => !readOnly && setHoveredObservationId(observation.id)}
                onMouseLeave={() => setHoveredObservationId(null)}
                onDragOver={!readOnly ? (e) => handleObservationDragOver(e, observation.id) : undefined}
              >
                {/* ✅ Controlli su hover in alto a destra */}
                {!readOnly && hoveredObservationId === observation.id && (
                  <div className="absolute top-0 right-0 z-10 flex items-center gap-1 bg-white/90 rounded shadow-sm p-1">
                    {/* ✅ Icona grip per trascinare */}
                    <div
                      draggable
                      onDragStart={(e) => handleObservationDragStart(e, observation.id)}
                      onDragEnd={handleObservationDragEnd}
                      className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors p-1"
                      title="Trascina per spostare"
                    >
                      <GripVertical className="h-3 w-3" />
                    </div>

                    {/* ✅ Icona cestino per eliminare */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updatedObservations = localObservations.filter(obs => obs.id !== observation.id)
                        setLocalObservations(updatedObservations)
                        if (onUpdate) {
                          onUpdate({ ...block, observations: updatedObservations })
                        }
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Elimina osservazione"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <NoteEditor
                  value={observation.content || ''}
                  onChange={(html) => {
                    const updatedObservations = localObservations.map(obs =>
                      obs.id === observation.id
                        ? { ...obs, content: html }
                        : obs
                    )
                    setLocalObservations(updatedObservations)
                  }}
                  onBlur={() => {
                    const updatedObservations = localObservations.map(obs =>
                      obs.id === observation.id
                        ? { ...obs, content: observation.content }
                        : obs
                    )
                    setLocalObservations(updatedObservations)
                    if (onUpdate) {
                      onUpdate({ ...block, observations: updatedObservations })
                    }
                  }}
                  placeholder="Inserisci un'osservazione sull'estratto..."
                  readOnly={readOnly}
                  className="mt-2"
                />
              </div>
            ))}

          {/* ✅ Container del contenuto estratto (per determinare posizione drop) */}
          <div
            ref={contentContainerRef}
            className={isOverlay ? "" : "space-y-3"} // ✅ Rimuovi spacing quando è overlay per dimensioni esatte
            onDragOver={!readOnly ? handleDragOver : undefined}
            onDrop={!readOnly ? handleDrop : undefined}
          >
            {/* Immagine estratto (senza bordo interno) */}
            {hasImage && extract.imageDataUrl ? (
              <div className={isOverlay ? "w-full m-0 p-0" : "rounded overflow-hidden"}>
                <img
                  src={extract.imageDataUrl}
                  alt="Estratto"
                  className={isOverlay
                    ? "w-full object-contain" // ✅ Dimensione originale quando è overlay
                    : "w-full h-auto object-contain" // ✅ Dimensione naturale quando è in drawer/table (rimossa limitazione max-h-48)
                  }
                  style={isOverlay ? {
                    // ✅ Quando è overlay, l'immagine deve essere mostrata esattamente alla dimensione del rettangolo
                    display: 'block',
                    margin: 0,
                    padding: 0,
                    width: '100%',
                    height: 'auto',
                    maxHeight: 'none' // ✅ Rimuovi qualsiasi limitazione di altezza
                    // ✅ L'immagine mantiene le proporzioni e occupa esattamente lo spazio del rettangolo selezionato
                    // Il container ha width = selectionWidth, quindi l'immagine avrà quella larghezza
                    // L'altezza sarà calcolata automaticamente mantenendo le proporzioni del rettangolo selezionato
                  } : {
                    // ✅ Anche quando non è overlay, mantieni dimensioni naturali
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    maxHeight: 'none' // ✅ Nessuna limitazione di altezza
                  }}
                />
              </div>
            ) : (isOverlay && !hasText) || isImageLoading ? (
              // ✅ Placeholder di caricamento più visibile quando è overlay senza testo OPPURE se l'immagine è in caricamento
              <div
                className="w-full flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded"
                style={{
                  minHeight: overlayContentHeight || '200px',
                  padding: '2rem'
                }}
              >
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-sm font-medium text-gray-700">Generazione screenshot...</p>
                  <p className="text-xs text-gray-500 mt-1">Attendere prego</p>
                </div>
              </div>
            ) : null}

            {/* Testo estratto */}
            {hasText && (
              <div className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
                {extract.content}
              </div>
            )}
          </div>

          {/* ✅ Osservazioni DOPO il contenuto estratto */}
          {localObservations
            .filter(obs => obs.position === 'after')
            .sort((a, b) => a.order - b.order)
            .map((observation) => (
              <div
                key={observation.id}
                data-observation-id={observation.id}
                className={cn(
                  "relative mt-2 border-t border-gray-200 pt-2",
                  isOverlay && "px-3",
                  draggedObservationId === observation.id && "opacity-50"
                )}
                onMouseEnter={() => !readOnly && setHoveredObservationId(observation.id)}
                onMouseLeave={() => setHoveredObservationId(null)}
                onDragOver={!readOnly ? (e) => handleObservationDragOver(e, observation.id) : undefined}
              >
                {/* ✅ Controlli su hover in alto a destra */}
                {!readOnly && hoveredObservationId === observation.id && (
                  <div className="absolute top-2 right-0 z-10 flex items-center gap-1 bg-white/90 rounded shadow-sm p-1">
                    {/* ✅ Icona grip per trascinare */}
                    <div
                      draggable
                      onDragStart={(e) => handleObservationDragStart(e, observation.id)}
                      onDragEnd={handleObservationDragEnd}
                      className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors p-1"
                      title="Trascina per spostare"
                    >
                      <GripVertical className="h-3 w-3" />
                    </div>

                    {/* ✅ Icona cestino per eliminare */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updatedObservations = localObservations.filter(obs => obs.id !== observation.id)
                        setLocalObservations(updatedObservations)
                        if (onUpdate) {
                          onUpdate({ ...block, observations: updatedObservations })
                        }
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Elimina osservazione"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <NoteEditor
                  value={observation.content || ''}
                  onChange={(html) => {
                    const updatedObservations = localObservations.map(obs =>
                      obs.id === observation.id
                        ? { ...obs, content: html }
                        : obs
                    )
                    setLocalObservations(updatedObservations)
                  }}
                  onBlur={() => {
                    const updatedObservations = localObservations.map(obs =>
                      obs.id === observation.id
                        ? { ...obs, content: observation.content }
                        : obs
                    )
                    setLocalObservations(updatedObservations)
                    if (onUpdate) {
                      onUpdate({ ...block, observations: updatedObservations })
                    }
                  }}
                  placeholder="Inserisci un'osservazione sull'estratto..."
                  readOnly={readOnly}
                  className="mt-2"
                />
              </div>
            ))}

          {/* ✅ DEPRECATO: Campo osservazione singola (per retrocompatibilità) */}
          {hasObservationLocal && !localObservations.length && (
            <div className={isOverlay ? "pt-2 border-t border-gray-200 px-3 pb-3" : "pt-2 border-t border-gray-200"}>
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
              <NoteEditor
                value={localObservation || ''}
                onChange={(html) => {
                  setLocalObservation(html)
                }}
                onBlur={() => {
                  setHasObservationLocal(true)
                  if (onUpdate) {
                    onUpdate({ ...block, observation: localObservation, hasObservation: true })
                  }
                }}
                placeholder="Inserisci un'osservazione sull'estratto..."
                readOnly={readOnly}
                autoFocus={shouldFocusObservationRef.current}
                className="mt-2"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
