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

export const ExtractBlock: React.FC<ExtractBlockProps> = ({
  block,
  onUpdate,
  onRemove,
  onDragStart,
  onDragEnd,
  readOnly,
  isOverlay = false,
  overlayHeaderOffset = 60,
  onExpandInModal
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

  // ✅ Sincronizza localObservations con observations
  useEffect(() => {
    setLocalObservations(observations || [])
  }, [observations])

  // ✅ Migrazione: se c'è observation ma non observations[], migra i dati
  useEffect(() => {
    if (observation && hasObservation && (!observations || observations.length === 0)) {
      const migratedObservation: ExtractObservation = {
        id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        content: observation,
        position: 'after',
        order: 0
      }
      setLocalObservations([migratedObservation])
      if (onUpdate) {
        onUpdate({ ...block, observations: [migratedObservation], observation: undefined, hasObservation: false })
      }
    }
  }, []) // Solo al mount

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

  // ✅ Listener per rimuovere ExtractObservation quando viene spostata
  useEffect(() => {
    const handleRemoveExtractObservation = (event: Event) => {
      const customEvent = event as CustomEvent<{ extractBlockId: string, observationId: string }>
      const { extractBlockId, observationId } = customEvent.detail

      // ✅ Solo se è questo ExtractBlock
      if (extractBlockId === block.id) {
        console.log('[ExtractBlock] Rimozione ExtractObservation:', observationId)
        const updatedObservations = localObservations.filter(obs => obs.id !== observationId)
        setLocalObservations(updatedObservations)
        if (onUpdate) {
          onUpdate({ ...block, observations: updatedObservations })
        }
      }
    }

    window.addEventListener('app:remove-extract-observation', handleRemoveExtractObservation)
    return () => {
      window.removeEventListener('app:remove-extract-observation', handleRemoveExtractObservation)
    }
  }, [block.id, localObservations, onUpdate, block])

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

    const observation = localObservations.find(obs => obs.id === observationId)
    if (!observation) return

    setDraggedObservationId(observationId)
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'extract-observation-move',
      observationId,
      observation,
      sourceExtractBlockId: block.id
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  // ✅ Handler per drag end di un'osservazione
  const handleObservationDragEnd = () => {
    setDraggedObservationId(null)
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
          if (data.type === 'extract-observation-move' || data.type === 'observation-move' || (data.type === 'block-reorder' && data.block?.type === 'observation')) {
            e.dataTransfer.dropEffect = 'move'
          }
        }
      } catch (err) {
        // Ignora errori
      }
    }
  }

  // ✅ Handler per drop del pulsante "Aggiungi osservazione" dentro l'estratto
  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return

    // ✅ Ferma la propagazione PRIMA di leggere i dati
    e.preventDefault()
    e.stopPropagation()

    try {
      const dragData = e.dataTransfer.getData('application/json')
      if (!dragData) return

      const data = JSON.parse(dragData)

      // ✅ Se è un'osservazione da CardBody (ObservationBlock) da convertire in ExtractObservation
      // Gestisce sia 'observation-move' che 'block-reorder' con block.type === 'observation'
      if ((data.type === 'observation-move' || (data.type === 'block-reorder' && data.block?.type === 'observation')) && data.block) {
        // ✅ Determina la posizione (before/after) in base alla posizione del mouse
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

        console.log('[ExtractBlock] ✅ Drop ObservationBlock dentro estratto, convertita in ExtractObservation:', { position, order: newObservation.order })

        // ✅ Aggiorna il blocco
        if (onUpdate) {
          onUpdate({ ...block, observations: updatedObservations })
        }

          // ✅ Emetti evento per rimuovere ObservationBlock dal CardBody
          // Se è un block-reorder, usa blockIndex per rimuoverlo
          if (data.type === 'block-reorder' && typeof data.blockIndex === 'number') {
            window.dispatchEvent(new CustomEvent('app:remove-observation-block-by-index', {
              detail: { blockIndex: data.blockIndex }
            }))
          } else {
            window.dispatchEvent(new CustomEvent('app:remove-observation-block', {
              detail: { blockId: data.block.id }
            }))
          }

        return
      }

      // ✅ Se è un'osservazione da un altro ExtractBlock (riordino o spostamento)
      if (data.type === 'extract-observation-move' && data.observation) {
        // ✅ Se viene dallo stesso ExtractBlock, gestisci riordino
        if (data.sourceExtractBlockId === block.id) {
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
          // ✅ Se viene da un altro ExtractBlock, aggiungila qui
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

        // ✅ Crea nuova osservazione
        const newObservation: ExtractObservation = {
          id: `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          content: '',
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
          const newObservationElement = document.querySelector(`[data-observation-id="${newObservation.id}"]`) as HTMLTextAreaElement | null
          if (newObservationElement) {
            newObservationElement.focus()
          }
        }, 0)
      }
    } catch (err) {
      console.error('[ExtractBlock] Errore durante drop:', err)
    }
  }

  // ✅ Handler per dragOver dentro l'estratto
  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return

    // ✅ Verifica i types per capire se è "new-observation" o "observation-move"
    const effectAllowed = e.dataTransfer.effectAllowed
    const types = Array.from(e.dataTransfer.types)

    // ✅ Se è 'copy' e ha 'application/json', potrebbe essere "new-observation"
    if (effectAllowed === 'copy' && types.includes('application/json')) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    } else if (types.includes('application/json')) {
      // ✅ Potrebbe essere un'osservazione da CardBody o da altro ExtractBlock
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-extract-block="true" // ✅ Attributo per identificare ExtractBlock in CardBody
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
            padding: 0 // ✅ Rimuovi anche padding laterale per allineare perfettamente lo screenshot
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

                {readOnly ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {observation.content || <span className="text-gray-400 italic">Nessuna osservazione</span>}
                  </p>
                ) : (
                  <Textarea
                    value={observation.content}
                    onChange={(e) => {
                      e.stopPropagation()
                      const updatedObservations = localObservations.map(obs =>
                        obs.id === observation.id
                          ? { ...obs, content: e.target.value }
                          : obs
                      )
                      setLocalObservations(updatedObservations)
                    }}
                    onBlur={(e) => {
                      e.stopPropagation()
                      const currentValue = (e.target as HTMLTextAreaElement).value
                      const updatedObservations = localObservations.map(obs =>
                        obs.id === observation.id
                          ? { ...obs, content: currentValue }
                          : obs
                      )
                      setLocalObservations(updatedObservations)
                      if (onUpdate) {
                        onUpdate({ ...block, observations: updatedObservations })
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Inserisci un'osservazione sull'estratto..."
                    className="min-h-[80px] text-sm resize-y cursor-text"
                  />
                )}
              </div>
            ))}

          {/* ✅ Container del contenuto estratto (per determinare posizione drop) */}
          <div ref={contentContainerRef} className="space-y-3">
            {/* Immagine estratto (senza bordo interno) */}
            {hasImage && extract.imageDataUrl && (
              <div className={isOverlay ? "w-full m-0 p-0" : "rounded overflow-hidden"}>
                <img
                  src={extract.imageDataUrl}
                  alt="Estratto"
                  className={isOverlay
                    ? "w-full h-auto object-contain" // ✅ Dimensione originale quando è overlay
                    : "w-full h-auto max-h-48 object-contain" // ✅ Limita altezza quando è in drawer/table
                  }
                  style={isOverlay ? {
                    // ✅ Quando è overlay, l'immagine deve essere mostrata esattamente alla dimensione del rettangolo
                    display: 'block',
                    margin: 0,
                    padding: 0
                    // ✅ RIMOSSO marginTop negativo - lo screenshot inizia subito dopo l'header
                    // L'overlay inizia sopra il rettangolo (top = selection.y0Pct - headerHeight)
                    // L'header occupa headerHeight, quindi lo screenshot inizia esattamente dove inizia il rettangolo
                  } : undefined}
                />
              </div>
            )}

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

                {readOnly ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {observation.content || <span className="text-gray-400 italic">Nessuna osservazione</span>}
                  </p>
                ) : (
                  <Textarea
                    value={observation.content}
                    onChange={(e) => {
                      e.stopPropagation()
                      const updatedObservations = localObservations.map(obs =>
                        obs.id === observation.id
                          ? { ...obs, content: e.target.value }
                          : obs
                      )
                      setLocalObservations(updatedObservations)
                    }}
                    onBlur={(e) => {
                      e.stopPropagation()
                      const currentValue = (e.target as HTMLTextAreaElement).value
                      const updatedObservations = localObservations.map(obs =>
                        obs.id === observation.id
                          ? { ...obs, content: currentValue }
                          : obs
                      )
                      setLocalObservations(updatedObservations)
                      if (onUpdate) {
                        onUpdate({ ...block, observations: updatedObservations })
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Inserisci un'osservazione sull'estratto..."
                    className="min-h-[80px] text-sm resize-y cursor-text"
                  />
                )}
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
              {readOnly ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {localObservation || <span className="text-gray-400 italic">Nessuna osservazione</span>}
                </p>
              ) : (
                <Textarea
                  ref={observationTextareaRef}
                  value={localObservation}
                  onChange={(e) => {
                    e.stopPropagation()
                    setLocalObservation(e.target.value)
                  }}
                  onBlur={(e) => {
                    e.stopPropagation()
                    const currentValue = (e.target as HTMLTextAreaElement).value
                    setLocalObservation(currentValue)
                    setHasObservationLocal(true)
                    if (onUpdate) {
                      onUpdate({ ...block, observation: currentValue, hasObservation: true })
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (observationTextareaRef.current) {
                      observationTextareaRef.current.focus()
                    }
                  }}
                  placeholder="Inserisci un'osservazione sull'estratto..."
                  className="min-h-[80px] text-sm resize-y cursor-text"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
