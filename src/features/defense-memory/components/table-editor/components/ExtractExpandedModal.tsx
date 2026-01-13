import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ExtractBlock } from './ExtractBlock'
import { ExtractBlock as ExtractBlockType } from '../types/blocks.types'

interface ExtractExpandedModalProps {
  block: ExtractBlockType
  onClose: () => void
  onUpdate?: (block: ExtractBlockType) => void
}

export const ExtractExpandedModal: React.FC<ExtractExpandedModalProps> = ({
  block,
  onClose,
  onUpdate
}) => {
  const [extractBlock, setExtractBlock] = useState<ExtractBlockType>(block)

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(extractBlock)
    }
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        // Chiudi se clicchi sullo sfondo
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-5xl max-h-[90vh] w-full overflow-auto relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ✅ Contenuto estratto espanso - senza wrapper esterno, mostra direttamente ExtractBlock */}
        <div className="flex flex-col flex-1 overflow-auto relative">
          {/* ✅ Pulsante chiudi posizionato sull'header, in alto a destra */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-30 p-1.5 hover:bg-gray-100 rounded transition-colors bg-white shadow-sm"
            title="Chiudi"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
          <ExtractBlock
            block={{ ...extractBlock, collapsed: false }} // ✅ Forza sempre espanso
            onUpdate={(updatedBlock) => {
              setExtractBlock(updatedBlock)
            }}
            readOnly={false}
            isOverlay={true} // ✅ Usa isOverlay per mostrare immagine a dimensione naturale
          />

          {/* ✅ Footer con pulsanti: "Aggiungi osservazione" a sinistra, "Annulla" e "Salva" a destra */}
          <div className="mt-2 flex items-center justify-between gap-2 flex-shrink-0 p-2 border-t border-gray-200 bg-white">
            {/* Pulsante "Aggiungi osservazione" a sinistra (solo se non c'è già) */}
            {!extractBlock.hasObservation && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const updatedBlock = { ...extractBlock, hasObservation: true, observation: '' }
                  setExtractBlock(updatedBlock)
                }}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              >
                Aggiungi osservazione
              </button>
            )}

            {/* Spacer per spingere i pulsanti a destra */}
            <div className="flex-1" />

            {/* Pulsanti "Annulla" e "Salva" a destra */}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs font-medium transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
