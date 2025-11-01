import React from 'react'
import type { DrawerType } from './types'

export type DrawerTabItem = {
  id: string
  label: string
  icon?: React.ReactNode
  color: string
  type?: DrawerType
}

type Props = {
  items: DrawerTabItem[]
  selectedId?: string
  onSelect: (id: string) => void
  className?: string
  onDrop?: (files: File[], drawerId: string) => void
}

export function DrawerTabStrip({ items, selectedId, onSelect, className, onDrop }: Props) {
  const [draggedOverId, setDraggedOverId] = React.useState<string | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(null)

  // ✅ Misura la larghezza disponibile del container
  React.useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setAvailableWidth(containerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const handleDragOver = (e: React.DragEvent, drawerId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
      setDraggedOverId(drawerId)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedOverId(null)
  }

  const handleDrop = (e: React.DragEvent, drawerId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedOverId(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && onDrop) {
      onDrop(files, drawerId)
    }
  }

  // ✅ Calcola le larghezze minime per ogni tab
  const tabMinWidths = React.useMemo(() => {
    return items.map(item => {
      const words = item.label.split(/\s+/)
      const longestWord = words.reduce((longest, word) =>
        word.length > longest.length ? word : longest, ''
      )
      // Larghezza minima: almeno per la parola più larga (circa 7px per carattere) + padding (16px)
      return Math.max(60, longestWord.length * 7 + 16)
    })
  }, [items])

  // ✅ Calcola la larghezza totale minima
  const totalMinWidth = React.useMemo(() => {
    const gaps = (items.length - 1) * 12 // gap-3 = 12px tra tab
    const padding = 16 // px-2 = 8px * 2
    return tabMinWidths.reduce((sum, w) => sum + w, 0) + gaps + padding
  }, [tabMinWidths, items.length])

  // ✅ Calcola la larghezza ottimale per ogni tab
  const tabWidths = React.useMemo(() => {
    if (!availableWidth || availableWidth <= totalMinWidth) {
      // Spazio insufficiente: usa larghezze minime
      return tabMinWidths
    }

    // Spazio extra disponibile
    const extraSpace = availableWidth - totalMinWidth
    const extraPerTab = extraSpace / items.length

    // Distribuisci lo spazio extra proporzionalmente
    return tabMinWidths.map(minWidth => {
      const optimalWidth = minWidth + extraPerTab
      // Limita la larghezza massima a 200px per evitare tab troppo larghe
      return Math.min(optimalWidth, 200)
    })
  }, [availableWidth, totalMinWidth, tabMinWidths, items.length])

  return (
    <div
      ref={containerRef}
      className={`flex items-end gap-3 px-2 py-1 overflow-x-auto ${className || ''}`}
      style={{ minHeight: 'auto' }}
    >
      {items.map((item, index) => {
        const isSelected = item.id === selectedId
        const isDraggedOver = draggedOverId === item.id
        const tabNumber = index + 1
        const tabWidth = tabWidths[index]

        return (
          <button
            key={item.id}
            onClick={() => {
              console.log('[DRAWER-TAB-STRIP][CLICK]', { itemId: item.id, itemLabel: item.label })
              onSelect(item.id)
            }}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item.id)}
            className={`
              flex flex-col items-center justify-start gap-1.5 px-2 py-2.5
              transition-all flex-shrink-0
              ${isSelected
                ? 'bg-white shadow-sm'
                : isDraggedOver
                ? 'bg-blue-50 shadow-md'
                : 'bg-slate-50 hover:bg-slate-100'
              }
            `}
            style={{
              // ✅ Bordino sottile completo con angoli arrotondati (come cassetti)
              border: `1px solid ${isSelected ? item.color : isDraggedOver ? '#93c5fd' : '#cbd5e1'}`,
              borderRadius: '8px', // ✅ Angoli arrotondati
              borderBottom: 'none', // ✅ Nessun bordo in basso (si attacca alla strip)
              borderBottomLeftRadius: '0', // ✅ Angoli in basso senza arrotondamento
              borderBottomRightRadius: '0',
              // ✅ Bordo top più spesso se selezionato
              borderTopWidth: isSelected ? '3px' : '1px',
              borderTopColor: isSelected ? item.color : undefined,
              // ✅ Larghezza dinamica: minima garantita, aumenta se c'è spazio
              width: `${tabWidth}px`,
              minWidth: `${tabMinWidths[index]}px`,
              // ✅ Altezza sufficiente per evitare tagli del testo (almeno 90px per contenere testo multi-linea)
              minHeight: '90px',
              height: 'auto',
            }}
          >
            {/* ✅ Numero e icona sulla stessa riga (numero a sinistra) */}
            <div className="flex items-center gap-1.5 w-full justify-center">
              <span className={`text-xs font-semibold leading-none ${isSelected ? 'text-slate-700' : 'text-slate-500'}`}>
                {tabNumber}.
              </span>
              {item.icon && (
                <span className="flex-shrink-0" style={{ color: item.color }}>
                  {React.isValidElement(item.icon) && typeof item.icon.type !== 'string'
                    ? React.cloneElement(item.icon as React.ReactElement<any>, { size: 18, className: 'w-4 h-4' })
                    : item.icon}
                </span>
              )}
            </div>

            {/* Descrizione multi-linea wrappata */}
            <span
              className={`text-[10px] font-medium text-center leading-tight ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}
              style={{
                wordBreak: 'break-word',
                hyphens: 'auto',
                lineHeight: '1.3',
              }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default DrawerTabStrip

