import React from 'react'
import { Search } from 'lucide-react'
import type { DrawerType } from './types'
import type { Documento, Comparto } from '../../types'

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
  const [hoveredDrawerId, setHoveredDrawerId] = React.useState<string | null>(null)
  const [showSearchIcon, setShowSearchIcon] = React.useState(false)
  const [showSearchBox, setShowSearchBox] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isSearching, setIsSearching] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(null)

  // ✅ Focus input quando si apre la search box
  React.useEffect(() => {
    if (showSearchBox && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearchBox])

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

  // ✅ Gestisce la ricerca di documenti
  const handleSearch = React.useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    setIsSearching(true)

    try {
      // ✅ Accedi ai dati globali esposti da PraticaCanvasPage
      let archiveData = (window as any).__archiveData

      if (!archiveData) {
        console.warn('[DRAWER-SEARCH] window.__archiveData non disponibile, retry in 200ms...')
        // ✅ Prova a aspettare un po' e riprova (i dati potrebbero essere ancora in caricamento)
        await new Promise(resolve => setTimeout(resolve, 200))
        archiveData = (window as any).__archiveData
        if (!archiveData) {
          console.error('[DRAWER-SEARCH] Dati archivio non disponibili dopo retry')
          return
        }
      }

      if (!archiveData || !Array.isArray(archiveData.documenti) || !Array.isArray(archiveData.comparti)) {
        console.warn('[DRAWER-SEARCH] Dati archivio non validi')
        return
      }

      const documenti: Documento[] = archiveData.documenti
      const comparti: Comparto[] = archiveData.comparti

      // ✅ Normalizza la query per ricerca case-insensitive
      const normalizedQuery = query.toLowerCase().trim()

      // ✅ Cerca documenti che matchano il nome (inizio o contiene)
      const matchedDoc = documenti.find(doc => {
        if (!doc || !doc.filename) return false
        const normalizedFilename = doc.filename.toLowerCase()
        return normalizedFilename.startsWith(normalizedQuery) ||
               normalizedFilename.includes(normalizedQuery)
      })

      if (matchedDoc && matchedDoc.compartoId) {
        // ✅ Trova il comparto corrispondente
        const comparto = comparti.find(c => c.id === matchedDoc.compartoId)
        if (comparto) {
          // ✅ Trova il drawerItem corrispondente usando comparto.key (che corrisponde a drawerItem.id)
          const drawerItem = items.find(item => item.id === comparto.key)

          if (drawerItem) {
            // ✅ Apri il cassetto trovato
            onSelect(drawerItem.id)
            setShowSearchBox(false)
            setSearchQuery('')
            return
          } else {
            console.warn('[DRAWER-SEARCH] DrawerItem non trovato per comparto.key:', comparto.key)
          }
        } else {
          console.warn('[DRAWER-SEARCH] Comparto non trovato per compartoId:', matchedDoc.compartoId)
        }
      }
    } catch (error) {
      console.error('[DRAWER-SEARCH][ERROR]', error)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, items, onSelect])

  // ✅ Gestisce Enter nella search box
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'Escape') {
      setShowSearchBox(false)
      setSearchQuery('')
    }
  }

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

  // ✅ Costanti per il calcolo
  const MAX_FONT_SIZE = 14 // px - limite massimo
  const MIN_FONT_SIZE = 8 // px - limite minimo per leggibilità
  const LINE_HEIGHT = 1.3 // relativo al font size
  // ✅ Gap dinamico: più piccolo se ci sono molti cassetti (per farli stare tutti)
  const getGapBetweenDrawers = React.useMemo(() => {
    return items.length >= 15 ? 8 : 12 // gap più piccolo per 15+ cassetti
  }, [items.length])
  const PADDING_X = 8 // px-2 = 8px per lato
  const PADDING_Y = 10 // py-2.5 = 10px per lato
  const ICON_HEIGHT = 18 // altezza icona
  const NUMBER_ICON_GAP = 6 // gap-1.5 = 6px tra numero e icona
  const ICON_TEXT_GAP = 6 // gap-1.5 = 6px tra icona e testo
  const NUMBER_HEIGHT = 16 // altezza approssimativa numero

  // ✅ Calcola la larghezza uniforme per tutti i cassetti
  const uniformTabWidth = React.useMemo(() => {
    if (!availableWidth || items.length === 0) return 100 // fallback

    const gap = getGapBetweenDrawers
    const totalGaps = (items.length - 1) * gap
    const totalPadding = PADDING_X * 2 // padding laterale container
    const availableForDrawers = availableWidth - totalPadding
    const drawerWidth = (availableForDrawers - totalGaps) / items.length

    // ✅ Se ci sono 15+ cassetti, riduci ulteriormente il minimo per farli stare tutti
    const minWidth = items.length >= 15 ? 45 : 60

    return Math.max(minWidth, drawerWidth)
  }, [availableWidth, items.length, getGapBetweenDrawers])

  // ✅ Trova la parola più lunga tra tutte le labels
  const longestWord = React.useMemo(() => {
    if (items.length === 0) return ''

    let longest = ''
    items.forEach(item => {
      const words = item.label.split(/\s+/)
      words.forEach(word => {
        if (word.length > longest.length) {
          longest = word
        }
      })
    })
    return longest
  }, [items])

  // ✅ Calcola il font size ottimale che permette alla parola più lunga di stare nella larghezza disponibile
  const optimalFontSize = React.useMemo(() => {
    if (!uniformTabWidth || longestWord === '') return MAX_FONT_SIZE

    // Larghezza disponibile per il testo (larghezza cassetto - padding laterale)
    const availableTextWidth = uniformTabWidth - (PADDING_X * 2)

    // Crea un canvas temporaneo per misurare il testo
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return MAX_FONT_SIZE

    // Prova font size da MAX_FONT_SIZE verso il basso fino a trovare quello che ci sta
    let fontSize = MAX_FONT_SIZE
    while (fontSize >= MIN_FONT_SIZE) {
      context.font = `medium ${fontSize}px sans-serif` // medium = font-medium
      const metrics = context.measureText(longestWord)

      if (metrics.width <= availableTextWidth) {
        // Questo font size va bene, è il massimo possibile
        return fontSize
      }

      // Prova font size più piccolo
      fontSize -= 0.5 // ✅ Incrementi di 0.5px per precisione
    }

    // Se nemmeno MIN_FONT_SIZE ci sta, restituisci comunque il minimo
    return MIN_FONT_SIZE
  }, [uniformTabWidth, longestWord])

  // ✅ Calcola il numero di righe necessarie per ogni label usando il font size ottimale
  const calculateTextLines = React.useCallback((label: string, width: number): number => {
    // Larghezza disponibile per il testo (larghezza cassetto - padding laterale)
    const textWidth = width - (PADDING_X * 2)

    // Crea un canvas temporaneo per misurare il testo
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 1

    context.font = `medium ${optimalFontSize}px sans-serif` // medium = font-medium, usa font size ottimale
    const lineHeightPx = optimalFontSize * LINE_HEIGHT

    // Dividi il testo in parole
    const words = label.split(/\s+/)
    let currentLine = ''
    let lines = 1

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const metrics = context.measureText(testLine)
      const testWidth = metrics.width

      if (testWidth > textWidth && currentLine) {
        // La parola non ci sta, va a capo
        lines++
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    return lines
  }, [optimalFontSize])

  // ✅ Calcola il numero massimo di righe tra tutti i cassetti
  const maxLines = React.useMemo(() => {
    if (!uniformTabWidth || items.length === 0) return 2

    let max = 1
    items.forEach(item => {
      const lines = calculateTextLines(item.label, uniformTabWidth)
      if (lines > max) {
        max = lines
      }
    })

    return max
  }, [items, uniformTabWidth, calculateTextLines])

  // ✅ Calcola l'altezza uniforme per tutti i cassetti usando il font size ottimale
  const uniformTabHeight = React.useMemo(() => {
    // Altezza = padding top + numero/icona + gap + (righe testo * line height) + padding bottom
    const textHeight = maxLines * (optimalFontSize * LINE_HEIGHT)
    const headerHeight = Math.max(NUMBER_HEIGHT, ICON_HEIGHT) + ICON_TEXT_GAP
    const totalHeight = (PADDING_Y * 2) + headerHeight + textHeight

    return Math.max(90, totalHeight) // minimo 90px
  }, [maxLines, optimalFontSize])

  return (
    <div
      ref={containerRef}
      className={`relative flex items-end gap-3 px-2 py-1 overflow-visible ${className || ''}`}
      style={{
        minHeight: 'auto',
        overflow: 'visible' // ✅ Permetti overflow per mostrare l'icona sopra
      }}
      onMouseEnter={() => {
        setShowSearchIcon(true)
      }}
      onMouseLeave={(e) => {
        // ✅ Verifica se il mouse sta andando verso l'icona o la search box
        // ✅ IMPORTANTE: relatedTarget può essere Window o null, non sempre un HTMLElement
        const relatedTarget = e.relatedTarget
        if (relatedTarget && relatedTarget instanceof HTMLElement) {
          const isGoingToSearch = relatedTarget.closest('[data-search-icon]') ||
                                   relatedTarget.closest('[data-search-box]')
          if (isGoingToSearch) {
            return // Non nascondere, il mouse sta andando verso la search
          }
        }
        // ✅ Nascondi icona solo se la search box non è aperta e il mouse non va verso la search
        if (!showSearchBox) {
          setShowSearchIcon(false)
        }
      }}
    >
      {/* ✅ Icona lente d'ingrandimento in basso a sinistra, allineata al fondo del primo cassetto */}
      {items.length > 0 && (showSearchIcon || showSearchBox) && (
        <div
          data-search-icon="true"
          className="absolute"
          style={{
            left: '8px', // ✅ Un po' staccato dalla sinistra
            bottom: '8px', // ✅ In basso, allineata al fondo dei cassetti
            zIndex: 20
          }}
          onMouseEnter={() => {
            setShowSearchIcon(true)
          }}
          onMouseLeave={(e) => {
            // ✅ Se non c'è la search box aperta e il mouse non va verso i cassetti, nascondi
            // ✅ IMPORTANTE: relatedTarget può essere Window o null, non sempre un HTMLElement
            const relatedTarget = e.relatedTarget
            if (!showSearchBox && relatedTarget && relatedTarget instanceof HTMLElement) {
              const isGoingToDrawers = relatedTarget.closest('[data-drawer-strip]')
              if (!isGoingToDrawers) {
                setShowSearchIcon(false)
              }
            }
          }}
        >
          {!showSearchBox ? (
            <button
              data-search-icon="true"
              onClick={() => {
                setShowSearchBox(true)
              }}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-300 shadow-md hover:bg-slate-50 transition-colors"
              title="Cerca documento"
              style={{
                position: 'relative',
                zIndex: 21
              }}
            >
              <Search size={24} className="text-slate-600" />
            </button>
          ) : (
            <div
              data-search-box="true"
              className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg shadow-lg px-3 py-2"
              style={{
                position: 'relative',
                zIndex: 21
              }}
              onMouseEnter={() => {
                setShowSearchIcon(true)
              }}
            >
              <Search size={20} className="text-slate-500 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cerca documento..."
                className="outline-none text-sm min-w-[200px]"
                disabled={isSearching}
              />
              {isSearching && (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              )}
              <button
                onClick={() => {
                  setShowSearchBox(false)
                  setSearchQuery('')
                }}
                className="text-slate-400 hover:text-slate-600 text-sm px-2"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <div
        data-drawer-strip="true"
        className="flex items-end"
        style={{ gap: `${getGapBetweenDrawers}px` }}
      >
      {items.map((item, index) => {
        const isSelected = item.id === selectedId
        const isDraggedOver = draggedOverId === item.id
        const isHovered = hoveredDrawerId === item.id
        const tabNumber = index + 1

        // ✅ Determina lo stato di highlight: selezionato > hover > dragged > normale
        const isHighlighted = isSelected || isHovered || isDraggedOver

        return (
          <button
            key={item.id}
            onClick={() => {
              onSelect(item.id)
            }}
            onMouseEnter={() => {
              setHoveredDrawerId(item.id)
            }}
            onMouseLeave={() => {
              setHoveredDrawerId(null)
            }}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item.id)}
            className={`
              flex flex-col items-center justify-start gap-1.5 px-2 py-2.5
              transition-all flex-shrink-0
              ${isSelected
                ? 'bg-white shadow-md'
                : isHovered
                ? 'bg-slate-100 shadow-lg'
                : isDraggedOver
                ? 'bg-blue-50 shadow-md'
                : 'bg-slate-50'
              }
            `}
            style={{
              // ✅ Bordino sottile completo con angoli arrotondati (come cassetti)
              // ✅ Usa proprietà non-shorthand per evitare conflitti con borderBottom
              borderTop: `${isSelected || isHovered ? '3px' : '1px'} solid ${isSelected ? item.color : isHovered ? item.color : isDraggedOver ? '#93c5fd' : '#cbd5e1'}`,
              borderLeft: `${isSelected || isHovered ? '2px' : '1px'} solid ${isSelected ? item.color : isHovered ? item.color : isDraggedOver ? '#93c5fd' : '#cbd5e1'}`,
              borderRight: `${isSelected || isHovered ? '2px' : '1px'} solid ${isSelected ? item.color : isHovered ? item.color : isDraggedOver ? '#93c5fd' : '#cbd5e1'}`,
              borderBottom: 'none', // ✅ Nessun bordo in basso (si attacca alla strip)
              borderRadius: '8px', // ✅ Angoli arrotondati
              borderBottomLeftRadius: '0', // ✅ Angoli in basso senza arrotondamento
              borderBottomRightRadius: '0',
              // ✅ Larghezza uniforme per tutti i cassetti
              width: `${uniformTabWidth}px`,
              // ✅ Altezza uniforme calcolata in base al numero massimo di righe
              height: `${uniformTabHeight}px`,
              minHeight: `${uniformTabHeight}px`,
              // ✅ Transform leggero quando hover per effetto "sollevamento"
              transform: isHovered && !isSelected ? 'translateY(-2px)' : 'translateY(0)',
            }}
          >
            {/* ✅ Numero e icona sulla stessa riga (numero a sinistra) */}
            <div className="flex items-center gap-1.5 w-full justify-center">
              <span className={`text-xs font-semibold leading-none ${isSelected ? 'text-slate-700' : isHovered ? 'text-slate-700' : 'text-slate-500'}`}>
                {tabNumber}.
              </span>
              {item.icon && (
                <span className="flex-shrink-0" style={{ color: isHovered || isSelected ? item.color : item.color, opacity: isHovered || isSelected ? 1 : 0.8 }}>
                  {React.isValidElement(item.icon) && typeof item.icon.type !== 'string'
                    ? React.cloneElement(item.icon as React.ReactElement<any>, { size: 32, className: 'w-8 h-8', style: { width: '32px', height: '32px' } })
                    : item.icon}
                </span>
              )}
            </div>

            {/* Descrizione multi-linea wrappata */}
            <span
              className={`text-xs font-medium text-center leading-tight ${isSelected ? 'text-slate-900' : isHovered ? 'text-slate-800' : 'text-slate-600'}`}
              style={{
                fontSize: `${optimalFontSize}px`, // ✅ Font size ottimale calcolato
                wordBreak: 'normal', // ✅ NON spezzare parole
                overflowWrap: 'normal', // ✅ Wrappare solo agli spazi
                hyphens: 'none', // ✅ Nessuna sillabazione automatica
                lineHeight: LINE_HEIGHT,
              }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )
}

export default DrawerTabStrip

