import React, { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import type { DrawerType } from './types'
import type { Documento, Comparto } from '../../types'
import './DrawerTabStrip.css'
import { DragAndDropService } from '../../services/DragAndDropService'
import { useDocumentStore } from '../../stores/documentStore/store'

// ✅ Componente helper per applicare il colore all'icona SVG
function IconWithColor({ icon, color, size }: { icon: React.ReactNode; color: string; size: number }) {
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!wrapperRef.current) return

    // Trova tutti gli elementi SVG e applica il colore direttamente
    const svg = wrapperRef.current.querySelector('svg')
    if (svg) {
      // Applica il colore a tutti gli elementi path, circle, etc. dentro l'SVG
      const allElements = svg.querySelectorAll('path, circle, rect, line, polyline, polygon, g')
      allElements.forEach(el => {
        ; (el as SVGElement).setAttribute('stroke', color)
          ; (el as SVGElement).setAttribute('fill', 'none')
          ; (el as SVGElement).style.stroke = color
          ; (el as SVGElement).style.fill = 'none'
      })
      // Applica anche all'SVG stesso
      svg.style.color = color
      svg.style.stroke = color
    }
  }, [color])

  return (
    <span
      ref={wrapperRef}
      className="flex-shrink-0 drawer-tab-icon-wrapper"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '--drawer-icon-color': color // CSS variable per il colore
      } as React.CSSProperties}
    >
      {React.isValidElement(icon) && typeof icon.type !== 'string'
        ? React.cloneElement(icon as React.ReactElement<any>, {
          size: size,
          className: 'drawer-tab-icon',
          strokeWidth: 2.5,
          fill: 'none',
          style: {
            width: `${size}px`,
            height: `${size}px`
          }
        })
        : typeof icon === 'string'
          ? icon
          : icon}
    </span>
  )
}

export type DrawerTabItem = {
  id: string
  label: string
  icon?: React.ReactNode
  color: string
  type?: DrawerType
  documentCount?: number // ✅ Numero di documenti nel cassetto
  isOpen?: boolean // ✅ Se il cassetto ha un dock pane aperto
}

type Props = {
  items: DrawerTabItem[]
  selectedId?: string
  onSelect: (id: string) => void
  className?: string
  onDrop?: (files: File[], drawerId: string) => void
  orientation?: 'horizontal' | 'vertical' // ✅ Orientamento: orizzontale (default) o verticale
  position?: 'top' | 'bottom' | 'left' | 'right' // ✅ Posizione della striscia: top, bottom, left, right
}

// ✅ Funzione helper per calcolare i bordi arrotondati in base alla posizione
function getBorderRadius(position: 'top' | 'bottom' | 'left' | 'right', orientation: 'horizontal' | 'vertical'): React.CSSProperties {
  const baseRadius = '8px'

  if (orientation === 'horizontal') {
    // Per orientamento orizzontale (top/bottom)
    if (position === 'top') {
      // Top: arrotondati in alto, piatti in basso
      return {
        borderRadius: baseRadius,
        borderBottomLeftRadius: '0',
        borderBottomRightRadius: '0',
      }
    } else {
      // Bottom: arrotondati in basso, piatti in alto
      return {
        borderRadius: baseRadius,
        borderTopLeftRadius: '0',
        borderTopRightRadius: '0',
      }
    }
  } else {
    // Per orientamento verticale (left/right)
    if (position === 'left') {
      // Left: arrotondati a sinistra, piatti a destra
      return {
        borderRadius: baseRadius,
        borderTopRightRadius: '0',
        borderBottomRightRadius: '0',
      }
    } else {
      // Right: arrotondati a destra, piatti a sinistra
      return {
        borderRadius: baseRadius,
        borderTopLeftRadius: '0',
        borderBottomLeftRadius: '0',
      }
    }
  }
}

export function DrawerTabStrip({ items, selectedId, onSelect, className, onDrop, orientation = 'horizontal', position = 'bottom' }: Props) {
  const store = useDocumentStore()
  const [draggedOverId, setDraggedOverId] = React.useState<string | null>(null)
  const [hoveredDrawerId, setHoveredDrawerId] = React.useState<string | null>(null)
  const [showSearchIcon, setShowSearchIcon] = React.useState(false)
  const [showSearchBox, setShowSearchBox] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isSearching, setIsSearching] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(null)
  const [availableHeight, setAvailableHeight] = React.useState<number | null>(null)
  // ✅ Stato per tracciare conferme pendenti per TAB (ghost sopra la TAB)
  const [pendingConfirmationsByTab, setPendingConfirmationsByTab] = React.useState<Map<string, any>>(new Map())

  // ✅ Focus input quando si apre la search box
  React.useEffect(() => {
    if (showSearchBox && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearchBox])

  // ✅ Misura la dimensione disponibile del container
  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        if (orientation === 'vertical') {
          // Per verticale: misura sia altezza (per dimensione tab) che larghezza (per calcolo font/righe)
          setAvailableHeight(containerRef.current.offsetHeight)
          setAvailableWidth(containerRef.current.offsetWidth)
        } else {
          // Per orizzontale: misura solo larghezza (per dimensione tab)
          setAvailableWidth(containerRef.current.offsetWidth)
        }
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [orientation])

  // ✅ Ascolta direttamente lo store per pendingMoveConfirmations (reattivo)
  const pendingMoveConfirmations = useDocumentStore(state => state.pendingMoveConfirmations)

  // ✅ Aggiorna pendingConfirmationsByTab quando cambia lo store
  React.useEffect(() => {
    const newMap = new Map<string, any>()
    pendingMoveConfirmations.forEach((confirmation, key) => {
      // Trova il drawerId corrispondente al targetCompartoId
      const drawerId = items.find(item => item.id === confirmation.targetCompartoId)?.id
      if (drawerId) {
        newMap.set(drawerId, confirmation)
      }
    })
    setPendingConfirmationsByTab(newMap)
  }, [pendingMoveConfirmations, items])

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
    // ✅ Usa il servizio centralizzato per gestire dragOver
    if (DragAndDropService.handleDragOver(e, [
      DragAndDropService.EXPLORER_FILE_TYPE,
      DragAndDropService.DOC_ID_TYPE,
      'Files'
    ])) {
      setDraggedOverId(drawerId)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedOverId(null)
  }

  const handleDrop = async (e: React.DragEvent, drawerId: string) => {
    setDraggedOverId(null)

    console.log('[DRAWER-TAB-STRIP][DROP][START] Drop ricevuto', {
      drawerId,
      target: (e.target as HTMLElement)?.tagName,
      currentTarget: (e.currentTarget as HTMLElement)?.tagName,
      types: Array.from(e.dataTransfer?.types || [])
    })

    // ✅ CRITICO: Se è un drag Dockview, NON gestire - lascia che Dockview gestisca
    const { isDockviewDrag } = await import('../../utils/dragEventUtils')
    const isDockview = isDockviewDrag(e)
    console.log('[DRAWER-TAB-STRIP][DROP] isDockviewDrag result:', isDockview)

    if (isDockview) {
      console.log('[DRAWER-TAB-STRIP][DROP] ❌ Ignorato - è drag Dockview')
      return // Lascia che Dockview gestisca il drop del pannello
    }

    console.log('[DRAWER-TAB-STRIP][DROP] ✅ Procedo con gestione drop')

    // ✅ CRITICO: Ferma la propagazione per evitare gestione duplicata
    e.stopPropagation()
    e.preventDefault()

    console.log('[DRAWER-TAB-STRIP][DROP] Start', {
      drawerId,
      types: Array.from(e.dataTransfer.types),
      hasDocId: DragAndDropService.isDocId(e),
      hasExplorerFile: DragAndDropService.isExplorerFile(e),
      hasFiles: DragAndDropService.isFiles(e)
    })

    // ✅ Usa il servizio centralizzato per gestire il drop
    // drawerId può essere una chiave o un ID - il servizio lo gestirà
    const handled = await DragAndDropService.handleDrop(e, drawerId, {
      onExplorerFile: (fileData) => {
        // Emetti un evento custom per gestire il drop di file Explorer
        const event = new CustomEvent('explorer:file-drop-to-drawer', {
          detail: { fileData, drawerId }
        })
        window.dispatchEvent(event)
      },
      onDocId: async (docId) => {
        console.log('[DRAWER-TAB-STRIP][DROP] ✅ onDocId chiamato', { docId, drawerId })
        // ✅ Usa il servizio centralizzato per spostare il documento
        try {
          const archiveData = (window as any).__archiveData as {
            comparti?: Array<{ id: string; key: string; nome: string }>
            documenti?: Array<{ id: string; filePath?: string;[key: string]: any }>
          } | undefined

          const comparti = archiveData?.comparti || []
          const documenti = archiveData?.documenti || []

          // Trova il comparto corrispondente al drawerId (può essere key o id)
          const comparto = comparti.find(c => c.id === drawerId || c.key === drawerId)
          if (comparto) {
            console.log('[DRAWER-TAB-STRIP][DROP] ✅ Comparto trovato, sposto documento', { docId, compartoId: comparto.id })
            const api = (await import('../../lib/api')).api
            await DragAndDropService.moveDocumentToComparto(docId, comparto.id, {
              documenti,
              comparti,
              api,
              store
            })
            console.log('[DRAWER-TAB-STRIP][DROP] ✅ Documento spostato con successo', { docId, compartoId: comparto.id })
          } else {
            console.warn('[DRAWER-TAB-STRIP] Comparto non trovato per drawerId:', drawerId)
          }
        } catch (error) {
          console.error('[DRAWER-TAB-STRIP] Errore spostamento documento:', error)
        }
      },
      onFiles: (files) => {
        // Gestione normale per file dal filesystem
        if (onDrop) {
          onDrop(files, drawerId)
        }
      }
    })

    if (!handled) {
      console.warn('[DRAWER-TAB-STRIP][DROP] ⚠️ Drop non gestito dal servizio', { drawerId, types: Array.from(e.dataTransfer?.types || []) })
    } else {
      console.log('[DRAWER-TAB-STRIP][DROP] ✅ Drop gestito con successo', { drawerId })
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

  // ✅ Calcola la dimensione uniforme per tutti i cassetti (larghezza per orizzontale, altezza per verticale)
  const uniformTabSize = React.useMemo(() => {
    if (orientation === 'vertical') {
      // Per verticale: calcola altezza uniforme
      if (!availableHeight || items.length === 0) return 100 // fallback
      const gap = getGapBetweenDrawers
      const totalGaps = (items.length - 1) * gap
      const totalPadding = PADDING_Y * 2 // padding verticale container
      const availableForDrawers = availableHeight - totalPadding
      const drawerHeight = (availableForDrawers - totalGaps) / items.length
      const minHeight = items.length >= 15 ? 45 : 60
      return Math.max(minHeight, drawerHeight)
    } else {
      // Per orizzontale: calcola larghezza uniforme (comportamento originale)
      if (!availableWidth || items.length === 0) return 100 // fallback
      const gap = getGapBetweenDrawers
      const totalGaps = (items.length - 1) * gap
      const totalPadding = PADDING_X * 2 // padding laterale container
      const availableForDrawers = availableWidth - totalPadding
      const drawerWidth = (availableForDrawers - totalGaps) / items.length
      const minWidth = items.length >= 15 ? 45 : 60
      return Math.max(minWidth, drawerWidth)
    }
  }, [orientation, availableWidth, availableHeight, items.length, getGapBetweenDrawers])

  // ✅ Alias per backward compatibility e chiarezza
  const uniformTabWidth = orientation === 'vertical' ? undefined : uniformTabSize
  const uniformTabHeight = orientation === 'vertical' ? uniformTabSize : undefined

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

  // ✅ Calcola il font size ottimale che permette alla parola più lunga di stare nella dimensione disponibile
  const optimalFontSize = React.useMemo(() => {
    if (longestWord === '') return MAX_FONT_SIZE

    // Per orizzontale: usa larghezza del tab, per verticale: usa larghezza disponibile del container (o 200px di default)
    let availableTextWidth: number
    if (orientation === 'vertical') {
      // Per verticale, usa la larghezza disponibile del container (o 200px di default)
      availableTextWidth = availableWidth ? availableWidth - (PADDING_X * 2) : 200 - (PADDING_X * 2)
    } else {
      // Per orizzontale: usa larghezza del tab
      availableTextWidth = uniformTabWidth ? uniformTabWidth - (PADDING_X * 2) : 0
    }

    if (!availableTextWidth || availableTextWidth <= 0) return MAX_FONT_SIZE

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
  }, [orientation, uniformTabWidth, uniformTabHeight, longestWord])

  // ✅ Calcola il numero di righe necessarie per ogni label usando il font size ottimale
  const calculateTextLines = React.useCallback((label: string, size: number): number => {
    // Larghezza disponibile per il testo (sempre basata sulla larghezza, non sull'altezza)
    const textWidth = orientation === 'vertical'
      ? (availableWidth ? availableWidth - (PADDING_X * 2) : 200 - (PADDING_X * 2)) // Per verticale, usa larghezza container
      : size - (PADDING_X * 2) // Per orizzontale, usa larghezza tab

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
  }, [orientation, optimalFontSize, availableWidth])

  // ✅ Calcola il numero massimo di righe tra tutti i cassetti
  const maxLines = React.useMemo(() => {
    const tabSize = orientation === 'vertical' ? uniformTabHeight : uniformTabWidth
    if (!tabSize || items.length === 0) return 2

    let max = 1
    items.forEach(item => {
      const lines = calculateTextLines(item.label, tabSize)
      if (lines > max) {
        max = lines
      }
    })

    return max
  }, [orientation, items, uniformTabWidth, uniformTabHeight, calculateTextLines])

  // ✅ Calcola la dimensione finale uniforme per tutti i cassetti usando il font size ottimale
  const finalUniformTabSize = React.useMemo(() => {
    if (orientation === 'vertical') {
      // Per verticale: usa la dimensione calcolata (altezza uniforme)
      return uniformTabSize || 100
    } else {
      // Per orizzontale: calcola altezza in base al contenuto (comportamento originale)
      const textHeight = maxLines * (optimalFontSize * LINE_HEIGHT)
      const headerHeight = Math.max(NUMBER_HEIGHT, ICON_HEIGHT) + ICON_TEXT_GAP
      const totalHeight = (PADDING_Y * 2) + headerHeight + textHeight
      return Math.max(90, totalHeight) // minimo 90px
    }
  }, [orientation, uniformTabSize, maxLines, optimalFontSize])

  // ✅ Alias per chiarezza nel rendering
  const finalTabWidth = orientation === 'vertical' ? undefined : uniformTabSize
  const finalTabHeight = orientation === 'vertical' ? uniformTabSize : finalUniformTabSize

  return (
    <div
      ref={containerRef}
      data-drawer-strip="true"
      className={`relative flex ${orientation === 'vertical' ? 'flex-col' : 'items-end'} gap-3 px-2 py-1 overflow-visible ${className || ''}`}
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
            [orientation === 'vertical' ? 'top' : 'bottom']: '8px',
            [orientation === 'vertical' ? 'right' : 'left']: '8px',
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
              className="flex items-center justify-center w-8 h-8 rounded-full bg-background border border-border shadow-md hover:bg-muted transition-colors"
              title="Cerca documento"
              style={{
                position: 'relative',
                zIndex: 21
              }}
            >
              <Search size={24} className="text-muted-foreground" />
            </button>
          ) : (
            <div
              data-search-box="true"
              className="flex items-center gap-2 bg-background border border-border rounded-lg shadow-lg px-3 py-2"
              style={{
                position: 'relative',
                zIndex: 21
              }}
              onMouseEnter={() => {
                setShowSearchIcon(true)
              }}
            >
              <Search size={20} className="text-muted-foreground flex-shrink-0" />
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
                className="text-muted-foreground hover:text-foreground text-sm px-2"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <div
        data-drawer-strip="true"
        className={`flex ${orientation === 'vertical' ? 'flex-col' : 'items-end'}`}
        style={{
          gap: `${getGapBetweenDrawers}px`,
          position: 'relative',
          overflow: 'visible' // ✅ Permette alla ghost di apparire sopra
        }}
      >
        {items.map((item, index) => {
          const isSelected = item.id === selectedId
          const isDraggedOver = draggedOverId === item.id
          const isHovered = hoveredDrawerId === item.id
          const tabNumber = index + 1

          // ✅ Determina lo stato di highlight: selezionato > hover > dragged > normale
          const isHighlighted = isSelected || isHovered || isDraggedOver
          const confirmation = pendingConfirmationsByTab.get(item.id)

          return (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
                key={item.id}
                data-drawer-tab="true"
                data-drawer-id={item.id}
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
                className={`flex ${orientation === 'vertical' ? 'flex-row' : 'flex-col'} items-center justify-start transition-all flex-shrink-0`}
                style={{
                  // ✅ Sfondo configurabile per tema
                  backgroundColor: item.isOpen
                    ? 'var(--drawer-bg-open)' // arancione smorzato/scuro per cassetti aperti
                    : (isSelected ? 'var(--drawer-bg-selected)' : 'var(--drawer-bg)'), // configurabile per tema
                  // ✅ Bordino configurabile per tema
                  border: item.isOpen
                    ? `2px solid var(--drawer-border-open)` // arancione per bordo cassetti aperti (mantiene significato semantico)
                    : (isSelected
                      ? `2px solid var(--drawer-border-selected)` // configurabile per tema
                      : `1px solid var(--drawer-border)`), // configurabile per tema
                  // ✅ Angoli arrotondati dinamici in base alla posizione
                  ...getBorderRadius(position, orientation),
                  // ✅ Dimensione uniforme per tutti i cassetti (larghezza per orizzontale, altezza per verticale)
                  ...(orientation === 'vertical' ? {
                    width: '100%',
                    height: finalTabHeight ? `${finalTabHeight}px` : 'auto',
                    minHeight: finalTabHeight ? `${finalTabHeight}px` : 'auto',
                  } : {
                    width: finalTabWidth ? `${finalTabWidth}px` : 'auto',
                    height: finalTabHeight ? `${finalTabHeight}px` : 'auto',
                    minHeight: finalTabHeight ? `${finalTabHeight}px` : 'auto',
                  }),
                  // ✅ Padding (sostituisce px-2 py-2.5)
                  padding: '10px 8px',
                  // ✅ Gap (sostituisce gap-1.5)
                  gap: '6px',
                  // ✅ Transform leggero quando hover per effetto "sollevamento" (solo orizzontale)
                  transform: orientation === 'horizontal' && isHovered && !isSelected
                    ? 'translateY(-2px)'
                    : orientation === 'vertical' && isHovered && !isSelected
                      ? 'translateX(-2px)'
                      : 'translate(0, 0)',
                  // ✅ Shadow quando selezionato o hover
                  boxShadow: isSelected || isHovered ? '0 4px 6px rgba(212, 165, 116, 0.3)' : 'none',
                } as React.CSSProperties}
              >
                {/* ✅ Layout: numero e icona affiancati, testo sotto (orizzontale) o a destra (verticale) */}
                <div style={{
                  display: 'flex',
                  flexDirection: orientation === 'vertical' ? 'row' : 'column',
                  alignItems: orientation === 'vertical' ? 'center' : 'flex-start',
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  gap: orientation === 'vertical' ? '8px' : '0'
                }}>
                  {/* Numero e icona affiancati */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: orientation === 'vertical' ? 'auto' : '100%',
                    marginBottom: orientation === 'vertical' ? '0' : '4px'
                  }}>
                    {/* Numero in alto a sinistra */}
                    <span
                      style={{
                        fontWeight: 700,
                        color: isSelected ? 'var(--drawer-text-selected)' : 'var(--drawer-text)', // configurabile per tema
                        fontSize: 'var(--font-size-lg)', // usa variabile scalabile
                        lineHeight: '1'
                      }}
                    >
                      {tabNumber}.
                    </span>

                    {/* Icona a fianco del numero */}
                    {item.icon && (
                      <IconWithColor
                        icon={item.icon}
                        color={isSelected ? 'var(--drawer-text-selected)' : (item.color || '#60a5fa')} // item.color mantiene significato semantico
                        size={20}
                      />
                    )}

                    {/* ✅ Conteggio documenti in piccolo tra parentesi - mostra solo se > 0 */}
                    {typeof item.documentCount === 'number' && item.documentCount > 0 && (
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)', // usa variabile scalabile
                          color: isSelected ? 'var(--drawer-text-selected)' : 'var(--drawer-text-muted)', // configurabile per tema
                          fontWeight: 500,
                          marginLeft: '2px'
                        }}
                      >
                        ({item.documentCount})
                      </span>
                    )}
                  </div>

                  {/* Descrizione multi-linea wrappata centrata sotto (orizzontale) o a destra (verticale) */}
                  <span
                    style={{
                      fontSize: `${optimalFontSize / 16}rem`, // ✅ Converti px in rem per scalabilità
                      color: isSelected ? 'var(--drawer-text-selected)' : 'var(--drawer-text)', // configurabile per tema
                      fontWeight: 500,
                      textAlign: orientation === 'vertical' ? 'left' : 'center',
                      lineHeight: LINE_HEIGHT,
                      wordBreak: 'normal',
                      overflowWrap: 'normal',
                      hyphens: 'none',
                      width: orientation === 'vertical' ? 'auto' : '100%',
                      flex: orientation === 'vertical' ? 1 : 'none'
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              </button>

              {/* ✅ Miniatura ghost sopra la TAB quando serve conferma */}
              {confirmation && (
                <div
                  style={{
                    position: 'absolute',
                    [orientation === 'vertical' ? 'left' : 'top']: orientation === 'vertical' ? '-160px' : '-140px',
                    [orientation === 'vertical' ? 'top' : 'left']: '50%',
                    transform: orientation === 'vertical' ? 'translateY(-50%)' : 'translateX(-50%)',
                    zIndex: 1000,
                    width: '12rem',
                    minWidth: '12rem',
                    aspectRatio: '3/4',
                    border: '2px solid var(--drawer-border-open)',
                    borderStyle: 'dashed',
                    borderRadius: '8px',
                    backgroundColor: 'var(--ui-bg-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    gap: '6px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    pointerEvents: 'auto'
                  }}
                >
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    textAlign: 'center',
                    padding: '6px',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    lineHeight: '1.3'
                  }}>
                    Il documento "{confirmation.filename}" è già in "{confirmation.sourceCompartoNome}".
                  </div>
                  <div style={{
                    fontSize: 'calc(var(--font-size-xs) * 0.75)', // 9px = 12px * 0.75
                    color: 'var(--ui-text-subtle)',
                    textAlign: 'center',
                    padding: '6px'
                  }}>
                    Vuoi spostarlo qui?
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: 'auto',
                    marginBottom: '8px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        // Emetti evento per conferma (gestito da useArchive)
                        window.dispatchEvent(new CustomEvent('app:confirm-move-from-tab', {
                          detail: confirmation
                        }))
                        setPendingConfirmationsByTab(prev => {
                          const next = new Map(prev)
                          next.delete(item.id)
                          return next
                        })
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      Conferma
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        // Emetti evento per annullamento (gestito da useArchive)
                        window.dispatchEvent(new CustomEvent('app:cancel-move-from-tab', {
                          detail: confirmation
                        }))
                        setPendingConfirmationsByTab(prev => {
                          const next = new Map(prev)
                          next.delete(item.id)
                          return next
                        })
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'var(--ui-border-subtle)',
                        color: 'var(--ui-text-muted)',
                        borderRadius: '4px',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DrawerTabStrip

