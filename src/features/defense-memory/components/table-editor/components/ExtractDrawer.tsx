/**
 * ExtractDrawer - Cassetto estratti
 * Step 2: Componente modulare e riutilizzabile
 *
 * Mostra tutti gli estratti copiati in un layout intelligente
 * Permette drag & drop per trascinarli nelle card
 */

import React, { useState, useEffect, useRef } from 'react'
import { ExtractDrawerProps, ExtractData, ExtractBlock as ExtractBlockType } from '../types/blocks.types'
import { extractClipboardManager } from '@/utils/extractClipboard'
import { addExtractFromClipboard, reorderExtracts, convertClipboardToExtract } from '../../../services/ExtractDrawerService'
import { ExtractBlock } from './ExtractBlock'
import { ExtractExpandedModal } from './ExtractExpandedModal'
import { cn } from '@/lib/utils'

export const ExtractDrawer: React.FC<ExtractDrawerProps> = ({
  extracts,
  onExtractAdd,
  onExtractUpdate,
  onExtractRemove,
  onExtractReorder,
  className
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [expandedExtractId, setExpandedExtractId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // ✅ Ref per accedere agli extracts correnti senza causare re-subscribe
  const extractsRef = useRef(extracts)
  const onExtractAddRef = useRef(onExtractAdd)

  // ✅ Aggiorna i ref quando cambiano
  useEffect(() => {
    extractsRef.current = extracts
    onExtractAddRef.current = onExtractAdd
  }, [extracts, onExtractAdd])

  // ✅ Subscribe alla clipboard per aggiungere automaticamente gli estratti
  // ✅ IMPORTANTE: Nessuna dipendenza da extracts/onExtractAdd per evitare re-subscribe
  useEffect(() => {
    console.log('[ExtractDrawer] 🔄 useEffect montato, extracts iniziali:', extracts.length)

    const unsubscribe = extractClipboardManager.subscribe((clipboardData) => {
      console.log('[ExtractDrawer] 📬 Evento clipboard ricevuto:', {
        hasData: !!clipboardData,
        source: clipboardData?.source,
        page: clipboardData?.page
      })

      // ✅ Aggiungi automaticamente quando viene copiato un nuovo estratto
      if (clipboardData) {
        const extract = convertClipboardToExtract(clipboardData)

        // ✅ Usa i ref per accedere agli extracts correnti senza dipendenze
        const currentExtracts = extractsRef.current
        const currentOnExtractAdd = onExtractAddRef.current

        console.log('[ExtractDrawer] 🔍 Controllo duplicati, extracts attuali:', currentExtracts.length)

        // ✅ Controlla duplicati usando source, page, bbox O ID (se presente)
        const isDuplicate = currentExtracts.some(e =>
          (extract.id && e.id === extract.id) || // ✅ Controlla ID se presente
          (e.source === extract.source &&
          e.page === extract.page &&
          e.bbox.x0Pct === extract.bbox.x0Pct &&
          e.bbox.y0Pct === extract.bbox.y0Pct)
        )

        if (!isDuplicate) {
          console.log('[ExtractDrawer] ➕ Aggiungo estratto al cassetto:', extract.id)
          currentOnExtractAdd(extract)
          extractClipboardManager.clear()
          console.log('[ExtractDrawer] ✅ Estratto aggiunto automaticamente al cassetto:', extract.id, {
            source: extract.source,
            page: extract.page,
            hasImage: !!extract.imageDataUrl
          })
        } else {
          console.log('[ExtractDrawer] ⚠️ Estratto già presente nel cassetto, ignorato')
          extractClipboardManager.clear()
        }
      } else {
        console.log('[ExtractDrawer] 📭 Clipboard vuota o cancellata')
      }
    })

    // ✅ Controlla se c'è già un estratto all'avvio o quando viene rimontato
    const checkAndAddPendingExtract = () => {
      const hasExtract = extractClipboardManager.hasExtract()
      console.log('[ExtractDrawer] 🔍 Controllo estratto all\'avvio/rimount:', hasExtract)
      if (hasExtract) {
        const clipboardData = extractClipboardManager.paste()
        if (clipboardData) {
          const extract = convertClipboardToExtract(clipboardData)
          const currentExtracts = extractsRef.current
          const currentOnExtractAdd = onExtractAddRef.current
          // ✅ Controlla duplicati usando source, page, bbox O ID (se presente)
          const isDuplicate = currentExtracts.some(e =>
            (extract.id && e.id === extract.id) || // ✅ Controlla ID se presente
            (e.source === extract.source &&
            e.page === extract.page &&
            e.bbox.x0Pct === extract.bbox.x0Pct &&
            e.bbox.y0Pct === extract.bbox.y0Pct)
          )
          if (!isDuplicate) {
            console.log('[ExtractDrawer] ➕ Aggiungo estratto pendente al cassetto:', extract.id)
            currentOnExtractAdd(extract)
            extractClipboardManager.clear()
            console.log('[ExtractDrawer] ✅ Estratto aggiunto automaticamente all\'avvio/rimount:', extract.id)
          } else {
            console.log('[ExtractDrawer] ⚠️ Estratto pendente già presente, ignorato')
            extractClipboardManager.clear()
          }
        }
      }
    }

    // ✅ Controlla immediatamente all'avvio
    checkAndAddPendingExtract()

    return () => {
      console.log('[ExtractDrawer] 🗑️ Unsubscribe dalla clipboard')
      unsubscribe()
    }
  }, []) // ✅ Nessuna dipendenza - subscribe solo una volta al mount

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Se è un drag interno (riorganizzazione)
    const dragData = e.dataTransfer.getData('application/json')
    if (dragData) {
      try {
        const data = JSON.parse(dragData)
        if (data.type === 'extract-reorder' && typeof data.index === 'number' && onExtractReorder) {
          const targetIndex = extracts.length // Aggiungi in fondo
          onExtractReorder(data.index, targetIndex)
          return
        }
      } catch (err) {
        console.warn('[ExtractDrawer] Errore parsing drag data:', err)
      }
    }

    // Se è un estratto dalla clipboard
    addExtractFromClipboard(extracts, onExtractAdd)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleExtractDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    const extract = extracts[index]

    // ✅ Passa anche title, observation, hasObservation, collapsed
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'extract',
      extract: extract,  // ✅ ExtractData ora include title, observation, etc.
      title: extract.title,
      observation: extract.observation,
      hasObservation: extract.hasObservation,
      collapsed: extract.collapsed
    }))
    e.dataTransfer.effectAllowed = 'move'

    // ✅ Crea drag image personalizzata con dimensioni controllate
    const dragElement = e.currentTarget as HTMLElement
    const rect = dragElement.getBoundingClientRect()

    // ✅ Crea un clone dell'elemento con dimensioni fisse
    const clone = dragElement.cloneNode(true) as HTMLElement
    clone.style.position = 'absolute'
    clone.style.top = '-1000px'
    clone.style.left = '-1000px'
    clone.style.opacity = '0.8'
    clone.style.pointerEvents = 'none'
    clone.style.zIndex = '10000'
    // ✅ Mantieni le dimensioni originali (non ingrandire)
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.maxWidth = `${rect.width}px`
    clone.style.maxHeight = `${rect.height}px`

    document.body.appendChild(clone)

    // ✅ Usa il centro dell'elemento come offset per il drag image
    const offsetX = rect.width / 2
    const offsetY = rect.height / 2
    e.dataTransfer.setDragImage(clone, offsetX, offsetY)

    // ✅ Rimuovi il clone dopo un breve delay
    setTimeout(() => {
      if (document.body.contains(clone)) {
        document.body.removeChild(clone)
      }
    }, 0)
  }

  const handleExtractDragEnd = () => {
    setDraggedIndex(null)
  }

  // ✅ Aggiunta automatica - nessun pulsante manuale necessario

  // ✅ Mostra sempre il cassetto (anche se vuoto)
  return (
    <div
      ref={containerRef}
      className={cn(
        'border-t border-gray-300 bg-gray-50 flex flex-col',
        'min-h-[120px] max-h-[400px]', // ✅ Altezza minima e massima fissa
        className
      )}
    >
      {/* ✅ Header fisso */}
      <div className="flex items-center justify-between p-4 pb-2 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">
          📋 Cassetto Estratti {extracts.length > 0 && `(${extracts.length})`}
        </h3>
        {/* ✅ Rimossa aggiunta manuale - ora è automatica */}
      </div>

      {/* ✅ Contenuto scrollabile */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {extracts.length === 0 ? (
          <div
            className={cn(
              'p-4 border-2 border-dashed rounded-lg text-center transition-colors',
              'border-gray-300 bg-white'
            )}
          >
            <p className="text-sm text-gray-500">
              ✅ Gli estratti copiati vengono aggiunti automaticamente qui
            </p>
            <p className="text-xs text-gray-400 mt-1">
              (Puoi eliminarli se non ti servono)
            </p>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-3',
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
              isDragOver && 'ring-2 ring-blue-500 rounded-lg p-2'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {extracts.map((extract, index) => {
              // ✅ Converti ExtractData in ExtractBlock per usare lo stesso componente
              const extractBlock: ExtractBlockType = {
                type: 'extract',
                id: extract.id,
                order: index,
                extract: extract,
                title: extract.title,
                observation: extract.observation,
                hasObservation: extract.hasObservation,
                collapsed: extract.collapsed
              }

              return (
                <ExtractBlock
                  key={extract.id}
                  block={extractBlock}
                  onUpdate={(updatedBlock) => {
                    // ✅ Aggiorna l'estratto con i nuovi metadati
                    if (onExtractUpdate) {
                      const updatedExtract: ExtractData = {
                        ...extract,
                        title: updatedBlock.title,
                        observation: updatedBlock.observation,
                        hasObservation: updatedBlock.hasObservation,
                        collapsed: updatedBlock.collapsed
                      }
                      onExtractUpdate(updatedExtract)
                    }
                  }}
                  onRemove={() => onExtractRemove(extract.id)}
                  onDragStart={(e) => handleExtractDragStart(e, index)}
                  onDragEnd={handleExtractDragEnd}
                  onExpandInModal={() => setExpandedExtractId(extract.id)} // ✅ Nuova prop per espandere in modal
                  readOnly={false}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ✅ Modal per estratto espanso a grandezza naturale */}
      {expandedExtractId && (() => {
        const expandedExtract = extracts.find(e => e.id === expandedExtractId)
        if (!expandedExtract) return null

        const extractBlock: ExtractBlockType = {
          type: 'extract',
          id: expandedExtract.id,
          order: extracts.indexOf(expandedExtract),
          extract: expandedExtract,
          title: expandedExtract.title,
          observation: expandedExtract.observation,
          hasObservation: expandedExtract.hasObservation,
          collapsed: false // ✅ Forza sempre espanso nel modal
        }

        return (
          <ExtractExpandedModal
            block={extractBlock}
            onClose={() => setExpandedExtractId(null)}
            onUpdate={(updatedBlock) => {
              if (onExtractUpdate) {
                const updatedExtract: ExtractData = {
                  ...expandedExtract,
                  title: updatedBlock.title,
                  observation: updatedBlock.observation,
                  hasObservation: updatedBlock.hasObservation,
                  collapsed: updatedBlock.collapsed
                }
                onExtractUpdate(updatedExtract)
              }
            }}
          />
        )
      })()}
    </div>
  )
}

// ✅ ExtractCard rimosso - ora usiamo ExtractBlock unificato
