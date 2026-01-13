/**
 * ExtractBlock - Blocco estratto (non editabile) con titolo e osservazione
 * Step 4: Componente per visualizzare estratti nelle card
 */

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
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
  readOnly,
  isOverlay = false,
  overlayHeaderOffset = 60
}) => {
  const { extract, title, observation, hasObservation = false, collapsed = false } = block
  const [isCollapsed, setIsCollapsed] = useState(collapsed)
  const [localTitle, setLocalTitle] = useState(title || '')
  const [localObservation, setLocalObservation] = useState(observation || '')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isHoveringTitle, setIsHoveringTitle] = useState(false)
  const [hasObservationLocal, setHasObservationLocal] = useState(hasObservation) // ✅ Stato locale per hasObservation

  // ✅ Refs per gestire il focus
  const titleInputRef = useRef<HTMLInputElement>(null)
  const observationTextareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldFocusTitleRef = useRef(false)
  const shouldFocusObservationRef = useRef(false)

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
          className={isOverlay ? "flex-1" : "p-3 space-y-3 overflow-auto flex-1"}
          style={isOverlay ? {
            // ✅ Quando è overlay, il contenuto inizia subito dopo l'header (nessun padding-top, nessun space-y)
            paddingTop: 0,
            marginTop: 0,
            padding: 0 // ✅ Rimuovi anche padding laterale per allineare perfettamente lo screenshot
          } : undefined}
        >
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

          {/* ✅ Campo osservazione editabile (solo se hasObservationLocal === true) */}
          {hasObservationLocal && (
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
                  ref={observationTextareaRef} // ✅ Aggiungi ref
                  value={localObservation}
                  onChange={(e) => {
                    e.stopPropagation()
                    // ✅ Aggiorna solo localObservation, non chiamare onUpdate immediatamente
                    setLocalObservation(e.target.value)
                  }}
                  onBlur={(e) => {
                    e.stopPropagation()
                    // ✅ Chiama onUpdate solo quando si perde il focus, usando il valore corrente
                    const currentValue = (e.target as HTMLTextAreaElement).value
                    setLocalObservation(currentValue) // ✅ Sincronizza localObservation
                    // ✅ Aggiorna hasObservationLocal e chiama onUpdate
                    setHasObservationLocal(true)
                    if (onUpdate) {
                      onUpdate({ ...block, observation: currentValue, hasObservation: true })
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    // ✅ Doppio click per dare focus alla textarea
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
