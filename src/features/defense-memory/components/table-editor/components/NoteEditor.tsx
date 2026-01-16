/**
 * NoteEditor - Editor rich text per osservazioni
 * Supporta: grassetto, colore testo, sottolineato, evidenziatore, font size
 */

import React, { useRef, useEffect, useState } from 'react'
import { Bold, Underline, Palette, Highlighter, Type, X, Copy, Paintbrush } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NoteEditorProps {
  value: string // HTML content
  onChange: (html: string) => void
  onBlur?: () => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  autoFocus?: boolean
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Inserisci un'osservazione...",
  readOnly = false,
  className,
  autoFocus = false
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null) // ✅ Ref per salvare la selezione
  const [hoverColorPicker, setHoverColorPicker] = useState(false)
  const [hoverHighlightPicker, setHoverHighlightPicker] = useState(false)
  const [hoverFontSizePicker, setHoverFontSizePicker] = useState(false)
  const [showBubbleMenu, setShowBubbleMenu] = useState(false)
  const [bubblePosition, setBubblePosition] = useState({ top: 0, left: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [showBubbleMenuContent, setShowBubbleMenuContent] = useState(false)

  // ✅ Inizializza il contenuto
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
      updatePlaceholder()
    }
  }, [value])

  // ✅ Aggiorna placeholder quando il contenuto cambia
  const updatePlaceholder = () => {
    if (editorRef.current) {
      const isEmpty = !editorRef.current.textContent?.trim()
      if (isEmpty) {
        editorRef.current.classList.add('empty')
      } else {
        editorRef.current.classList.remove('empty')
      }
    }
  }

  // ✅ Auto focus se richiesto
  useEffect(() => {
    if (autoFocus && editorRef.current && !readOnly) {
      editorRef.current.focus()
      // ✅ Posiziona il cursore alla fine
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNodeContents(editorRef.current)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [autoFocus, readOnly])

  // ✅ Handler per cambiamenti nel contenuto
  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
      updatePlaceholder()
    }
  }

  // ✅ Handler per paste - rimuove formattazione indesiderata
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  // ✅ Handler per gestire la selezione e mostrare menu bolla
  const handleSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setShowBubbleMenu(false)
      setShowBubbleMenuContent(false)
      return
    }

    const range = selection.getRangeAt(0)
    if (range.collapsed) {
      setShowBubbleMenu(false)
      setShowBubbleMenuContent(false)
      return
    }

    // ✅ Verifica che la selezione sia dentro l'editor
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      setShowBubbleMenu(false)
      setShowBubbleMenuContent(false)
      return
    }

    // Ottieni il testo selezionato
    const text = selection.toString().trim()
    if (!text) {
      setShowBubbleMenu(false)
      setShowBubbleMenuContent(false)
      return
    }

    setSelectedText(text)

    // ✅ Salva la selezione per ripristinarla quando si applica la formattazione
    savedSelectionRef.current = range.cloneRange()
    console.log('[NoteEditor] 💾 Selezione salvata:', { text, rangeStart: range.startOffset, rangeEnd: range.endOffset })

    // Calcola la posizione della bolla (in basso a destra della selezione)
    const rect = range.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()

    if (containerRect) {
      setBubblePosition({
        top: rect.bottom - containerRect.top + 5, // 5px sotto la selezione
        left: rect.right - containerRect.left - 20 // 20px a sinistra del bordo destro (in basso a destra)
      })
      setShowBubbleMenu(true)
    }
  }

  // ✅ Listener per selezione
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || readOnly) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      // ✅ Non chiudere se si clicca dentro il container (inclusa la bolla)
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowBubbleMenu(false)
        setShowBubbleMenuContent(false)
      }
    }

    editor.addEventListener('mouseup', handleSelection)
    editor.addEventListener('keyup', handleSelection)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      editor.removeEventListener('mouseup', handleSelection)
      editor.removeEventListener('keyup', handleSelection)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [readOnly])

  // ✅ Handler per copiare
  const handleCopy = () => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText)
      setShowBubbleMenu(false)
      setShowBubbleMenuContent(false)
      // ✅ Deseleziona il testo
      window.getSelection()?.removeAllRanges()
    }
  }

  // ✅ Funzioni per formattazione
  const execCommand = (command: string, value?: string) => {
    // ✅ Ripristina la selezione se disponibile
    if (savedSelectionRef.current && editorRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        try {
          selection.addRange(savedSelectionRef.current)
        } catch (e) {
          // Se la selezione non è più valida, ignora
          console.warn('Selezione non più valida:', e)
        }
      }
    }

    // ✅ Assicurati che l'editor abbia il focus
    editorRef.current?.focus()

    // ✅ Esegui il comando
    const success = document.execCommand(command, false, value)

    if (!success) {
      console.warn(`Comando ${command} non riuscito con valore:`, value)
    }

    handleInput()
  }

  const handleBold = () => {
    execCommand('bold')
    setShowBubbleMenuContent(false)
  }

  const handleUnderline = () => {
    execCommand('underline')
    setShowBubbleMenuContent(false)
  }

  const handleTextColor = (color: string) => {
    console.log('[NoteEditor] 🎨 handleTextColor chiamato:', { color, hasSavedSelection: !!savedSelectionRef.current })

    // ✅ PRIMA di tutto, assicurati che l'editor abbia il focus
    if (editorRef.current) {
      editorRef.current.focus()
    }

    // ✅ Ripristina la selezione se disponibile
    let range: Range | null = null
    if (savedSelectionRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        try {
          selection.addRange(savedSelectionRef.current)
          range = selection.getRangeAt(0)
          console.log('[NoteEditor] ✅ Selezione ripristinata:', selection.toString(), 'Range collapsed:', range.collapsed)
        } catch (e) {
          console.warn('[NoteEditor] ⚠️ Selezione non più valida per colore:', e)
          setHoverColorPicker(false)
          setShowBubbleMenuContent(false)
          return
        }
      }
    } else {
      // ✅ Se non c'è selezione salvata, prova a prenderla dalla selezione corrente
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0)
        console.log('[NoteEditor] 🔵 Uso selezione corrente:', selection.toString())
      }
    }

    // ✅ Applica il colore solo se c'è una selezione valida
    if (range && !range.collapsed && editorRef.current?.contains(range.commonAncestorContainer)) {
      console.log('[NoteEditor] 🔵 Applico colore con manipolazione DOM diretta')

      try {
        // ✅ Prova prima con execCommand (più affidabile per il colore)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)

          // ✅ Usa styleWithCSS per applicare CSS invece di tag HTML
          try {
            document.execCommand('styleWithCSS', false, 'true')
          } catch (e) {
            // Ignora se non supportato
          }

          // ✅ Applica il colore con execCommand
          const success = document.execCommand('foreColor', false, color)

          if (!success) {
            // ✅ Fallback: manipolazione DOM diretta
            console.log('[NoteEditor] ⚠️ execCommand fallito, uso manipolazione DOM diretta')
            const contents = range.extractContents()
            const span = document.createElement('span')
            span.style.color = color
            span.appendChild(contents)
            range.insertNode(span)

            // ✅ Dopo aver inserito lo span, posiziona il cursore subito dopo
            const newRange = document.createRange()
            newRange.setStartAfter(span)
            newRange.collapse(true)
            const newSelection = window.getSelection()
            if (newSelection) {
              newSelection.removeAllRanges()
              newSelection.addRange(newRange)
            }
          } else {
            // ✅ Dopo execCommand, la selezione potrebbe essere ancora attiva
            // ✅ Collassa la selezione alla fine per posizionare il cursore
            setTimeout(() => {
              const newSelection = window.getSelection()
              if (newSelection && newSelection.rangeCount > 0) {
                const currentRange = newSelection.getRangeAt(0)
                // ✅ Se c'è ancora una selezione, collassala alla fine
                if (!currentRange.collapsed) {
                  currentRange.collapse(false) // Collassa alla fine
                  newSelection.removeAllRanges()
                  newSelection.addRange(currentRange)
                }
              } else {
                // ✅ Se la selezione è stata persa, posiziona alla fine dell'editor
                if (editorRef.current) {
                  const editorRange = document.createRange()
                  editorRange.selectNodeContents(editorRef.current)
                  editorRange.collapse(false) // Alla fine
                  const fallbackSelection = window.getSelection()
                  if (fallbackSelection) {
                    fallbackSelection.removeAllRanges()
                    fallbackSelection.addRange(editorRange)
                  }
                }
              }
            }, 10)
          }

          // ✅ Aggiorna la posizione della bolla se c'è ancora una selezione
          setTimeout(() => {
            const newSelection = window.getSelection()
            if (newSelection && newSelection.rangeCount > 0) {
              const currentRange = newSelection.getRangeAt(0)
              if (!currentRange.collapsed) {
                handleSelection()
              }
            }
          }, 20)
        }

        console.log('[NoteEditor] ✅ Colore applicato con successo')
        handleInput()
      } catch (e) {
        console.error('[NoteEditor] ❌ Errore applicando colore:', e)
      }
    } else {
      console.warn('[NoteEditor] ⚠️ Range non valido o collapsed:', { range: !!range, collapsed: range?.collapsed, inEditor: range ? editorRef.current?.contains(range.commonAncestorContainer) : false })
    }

    setHoverColorPicker(false)
    setShowBubbleMenuContent(false)
  }

  const handleRemoveHighlight = () => {
    console.log('[NoteEditor] 🗑️ handleRemoveHighlight chiamato, Selezione salvata:', !!savedSelectionRef.current)

    // ✅ PRIMA di tutto, assicurati che l'editor abbia il focus
    if (editorRef.current) {
      editorRef.current.focus()
    }

    // ✅ Ripristina la selezione se disponibile
    let range: Range | null = null
    if (savedSelectionRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        try {
          selection.addRange(savedSelectionRef.current)
          range = selection.getRangeAt(0)
          console.log('[NoteEditor] ✅ Selezione ripristinata:', selection.toString(), 'Range collapsed:', range.collapsed)
        } catch (e) {
          console.warn('[NoteEditor] ⚠️ Selezione non più valida per rimozione evidenziatore:', e)
          setShowHighlightPicker(false)
          setShowBubbleMenuContent(false)
          return
        }
      }
    } else {
      // ✅ Se non c'è selezione salvata, prova a prenderla dalla selezione corrente
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0)
        console.log('[NoteEditor] 🔵 Uso selezione corrente:', selection.toString())
      }
    }

    // ✅ Rimuovi backgroundColor solo se c'è una selezione valida
    if (range && !range.collapsed && editorRef.current?.contains(range.commonAncestorContainer)) {
      const commonAncestor = range.commonAncestorContainer

      // ✅ Trova tutti gli elementi nella selezione che hanno backgroundColor
      const allElements = commonAncestor.nodeType === Node.ELEMENT_NODE
        ? Array.from((commonAncestor as HTMLElement).querySelectorAll('*'))
        : []

      // ✅ Aggiungi anche l'elemento comune se è un elemento
      if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
        allElements.push(commonAncestor as HTMLElement)
      }

      // ✅ Rimuovi backgroundColor da tutti gli elementi che lo hanno
      allElements.forEach(el => {
        if (el.style && el.style.backgroundColor) {
          el.style.backgroundColor = ''
          // ✅ Se non ci sono altri stili, rimuovi l'attributo style
          if (!el.style.cssText || el.style.cssText.trim() === '') {
            el.removeAttribute('style')
          }
        }
      })

      console.log('[NoteEditor] ✅ Evidenziatore rimosso con successo')
      handleInput()

      // ✅ Aggiorna la posizione della bolla dopo la rimozione
      setTimeout(() => {
        handleSelection()
      }, 0)
    } else {
      console.warn('[NoteEditor] ⚠️ Range non valido o collapsed:', { range: !!range, collapsed: range?.collapsed, inEditor: range ? editorRef.current?.contains(range.commonAncestorContainer) : false })
    }

    setHoverHighlightPicker(false)
    setShowBubbleMenuContent(false)
  }

  const handleHighlight = (color: string) => {
    console.log('[NoteEditor] 🖍️ handleHighlight chiamato:', { color, hasSavedSelection: !!savedSelectionRef.current })

    // ✅ PRIMA di tutto, assicurati che l'editor abbia il focus
    if (editorRef.current) {
      editorRef.current.focus()
    }

    // ✅ Ripristina la selezione se disponibile
    let range: Range | null = null
    if (savedSelectionRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        try {
          selection.addRange(savedSelectionRef.current)
          range = selection.getRangeAt(0)
          console.log('[NoteEditor] ✅ Selezione ripristinata:', selection.toString(), 'Range collapsed:', range.collapsed)
        } catch (e) {
          console.warn('[NoteEditor] ⚠️ Selezione non più valida per evidenziatore:', e)
          setShowHighlightPicker(false)
          setShowBubbleMenuContent(false)
          return
        }
      }
    } else {
      // ✅ Se non c'è selezione salvata, prova a prenderla dalla selezione corrente
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0)
        console.log('[NoteEditor] 🔵 Uso selezione corrente:', selection.toString())
      }
    }

    // ✅ Applica l'evidenziatore solo se c'è una selezione valida
    if (range && !range.collapsed && editorRef.current?.contains(range.commonAncestorContainer)) {
      console.log('[NoteEditor] 🔵 Applico evidenziatore con manipolazione DOM diretta')

      try {
        // ✅ Estrai il contenuto
        const contents = range.extractContents()

        // ✅ Crea uno span con il background color
        const span = document.createElement('span')
        span.style.backgroundColor = color
        span.appendChild(contents)

        // ✅ Inserisci lo span
        range.insertNode(span)

        // ✅ Posiziona il cursore subito dopo lo span inserito
        const selection = window.getSelection()
        if (selection) {
          const newRange = document.createRange()
          newRange.setStartAfter(span)
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)

          // ✅ Aggiorna la posizione della bolla dopo la formattazione
          setTimeout(() => {
            handleSelection()
          }, 0)
        }

        console.log('[NoteEditor] ✅ Evidenziatore applicato con successo')
        handleInput()
      } catch (e) {
        console.error('[NoteEditor] ❌ Errore applicando evidenziatore:', e)
      }
    } else {
      console.warn('[NoteEditor] ⚠️ Range non valido o collapsed:', { range: !!range, collapsed: range?.collapsed, inEditor: range ? editorRef.current?.contains(range.commonAncestorContainer) : false })
    }

    setHoverHighlightPicker(false)
    setShowBubbleMenuContent(false)
  }

  const handleFontSize = (size: string) => {
    console.log('[NoteEditor] 📏 handleFontSize chiamato:', { size, hasSavedSelection: !!savedSelectionRef.current })

    // ✅ PRIMA di tutto, assicurati che l'editor abbia il focus
    if (editorRef.current) {
      editorRef.current.focus()
    }

    // ✅ Ripristina la selezione se disponibile
    let range: Range | null = null
    if (savedSelectionRef.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        try {
          selection.addRange(savedSelectionRef.current)
          range = selection.getRangeAt(0)
          console.log('[NoteEditor] ✅ Selezione ripristinata:', selection.toString(), 'Range collapsed:', range.collapsed)
        } catch (e) {
          console.warn('[NoteEditor] ⚠️ Selezione non più valida per dimensione font:', e)
          setShowFontSizePicker(false)
          setShowBubbleMenuContent(false)
          return
        }
      }
    } else {
      // ✅ Se non c'è selezione salvata, prova a prenderla dalla selezione corrente
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0)
        console.log('[NoteEditor] 🔵 Uso selezione corrente:', selection.toString())
      }
    }

    // ✅ Converti dimensione (1-7) in pixel
    const sizeMap: { [key: string]: string } = {
      '1': '10px',
      '2': '13px',
      '3': '16px',
      '4': '18px',
      '5': '24px',
      '6': '32px',
      '7': '48px'
    }

    const fontSize = sizeMap[size] || '16px'

    // ✅ Applica la dimensione solo se c'è una selezione valida
    if (range && !range.collapsed && editorRef.current?.contains(range.commonAncestorContainer)) {
      console.log('[NoteEditor] 🔵 Applico dimensione font con manipolazione DOM diretta:', fontSize)

      try {
        // ✅ Estrai il contenuto
        const contents = range.extractContents()

        // ✅ Crea uno span con la dimensione
        const span = document.createElement('span')
        span.style.fontSize = fontSize
        span.appendChild(contents)

        // ✅ Inserisci lo span
        range.insertNode(span)

        // ✅ Aggiorna la selezione per includere lo span appena inserito
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          const newRange = document.createRange()
          newRange.selectNodeContents(span)
          selection.addRange(newRange)

          // ✅ Aggiorna la posizione della bolla dopo la formattazione (importante per dimensione font)
          setTimeout(() => {
            handleSelection()
          }, 0)
        }

        console.log('[NoteEditor] ✅ Dimensione font applicata con successo')
        handleInput()
      } catch (e) {
        console.error('[NoteEditor] ❌ Errore applicando dimensione font:', e)
      }
    } else {
      console.warn('[NoteEditor] ⚠️ Range non valido o collapsed:', { range: !!range, collapsed: range?.collapsed, inEditor: range ? editorRef.current?.contains(range.commonAncestorContainer) : false })
    }

    setHoverFontSizePicker(false)
    setShowBubbleMenuContent(false)
  }

  // ✅ Colori predefiniti
  const textColors = [
    '#000000', '#333333', '#666666', '#999999',
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
    '#FF00FF', '#00FFFF', '#FFA500', '#800080'
  ]

  const highlightColors = [
    '#FFFF00', '#FFE066', '#FFCC99', '#FF9999',
    '#99CCFF', '#99FF99', '#FF99CC', '#CC99FF'
  ]

  const fontSizes = ['1', '2', '3', '4', '5', '6', '7']

  if (readOnly) {
    return (
      <div
        className={cn('text-sm text-gray-700 whitespace-pre-wrap break-words', className)}
        dangerouslySetInnerHTML={{ __html: value || '<span class="text-gray-400 italic">Nessuna osservazione</span>' }}
      />
    )
  }

  return (
    <div ref={containerRef} className={cn('border border-gray-300 rounded-md relative', className)}>
      {/* ✅ Editor contentEditable */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onBlur={onBlur}
        onClick={(e) => {
          // ✅ Se si clicca senza selezionare, nascondi il menu bolla
          setTimeout(() => {
            const selection = window.getSelection()
            if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
              setShowBubbleMenu(false)
              setShowBubbleMenuContent(false)
            }
          }, 0)
        }}
        className={cn(
          'min-h-[80px] p-2 text-sm resize-y cursor-text',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0',
          'overflow-y-auto',
          'empty:before:content-[attr(data-placeholder)]',
          'empty:before:text-gray-400',
          'empty:before:italic'
        )}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      <style>{`
        [contenteditable].empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          font-style: italic;
        }
      `}</style>

      {/* ✅ Menu bolla contestuale sulla selezione */}
      {showBubbleMenu && !readOnly && (
        <div
          className="absolute z-50"
          style={{
            top: `${bubblePosition.top}px`,
            left: `${bubblePosition.left}px`
          }}
          onClick={(e) => {
            e.stopPropagation()
            setShowBubbleMenuContent(!showBubbleMenuContent)
          }}
        >
          {/* Icona bolla - più piccola, pennellino */}
          <div className="bg-blue-500 text-white rounded-full p-1.5 shadow-lg cursor-pointer hover:bg-blue-600 transition-colors">
            <Paintbrush className="h-3 w-3" />
          </div>

          {/* Menu espanso al click */}
          {showBubbleMenuContent && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl p-2 min-w-[250px]">
              {/* ✅ Toolbar completa come prima riga */}
              <div className="flex items-center gap-1 p-1 border-b border-gray-200 mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBold()
                  }}
                  className="h-7 w-7 p-0"
                  title="Grassetto"
                >
                  <Bold className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUnderline()
                  }}
                  className="h-7 w-7 p-0"
                  title="Sottolineato"
                >
                  <Underline className="h-4 w-4" />
                </Button>

                {/* ✅ Hover menu per colore testo */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    // ✅ Salva la selezione quando si passa il mouse
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                      console.log('[NoteEditor] 💾 Selezione salvata (hover colore):', selection.toString())
                    }
                    setHoverColorPicker(true)
                  }}
                  onMouseLeave={() => {
                    setHoverColorPicker(false)
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Colore testo"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                  {/* ✅ Menu hover - con padding-top invisibile per creare gap */}
                  {hoverColorPicker && (
                    <div
                      className="absolute top-full left-0 pt-1 bg-transparent z-50"
                      onMouseEnter={() => setHoverColorPicker(true)}
                      onMouseLeave={() => setHoverColorPicker(false)}
                    >
                      <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-2 w-48">
                        <div className="grid grid-cols-4 gap-2">
                          {textColors.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                              style={{ backgroundColor: color }}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('[NoteEditor] 🎯 Click su colore:', color, 'Selezione salvata:', !!savedSelectionRef.current)
                                // ✅ Salva la selezione PRIMA di applicare il colore (in caso sia stata persa)
                                if (!savedSelectionRef.current) {
                                  const selection = window.getSelection()
                                  if (selection && selection.rangeCount > 0) {
                                    savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                                    console.log('[NoteEditor] 💾 Selezione salvata (click colore):', selection.toString())
                                  }
                                }
                                // ✅ Applica il colore
                                handleTextColor(color)
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ✅ Hover menu per evidenziatore */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    // ✅ Salva la selezione quando si passa il mouse
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                      console.log('[NoteEditor] 💾 Selezione salvata (hover evidenziatore):', selection.toString())
                    }
                    setHoverHighlightPicker(true)
                  }}
                  onMouseLeave={() => {
                    setHoverHighlightPicker(false)
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Evidenziatore"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <Highlighter className="h-4 w-4" />
                  </Button>
                  {/* ✅ Menu hover - con padding-top invisibile per creare gap */}
                  {hoverHighlightPicker && (
                    <div
                      className="absolute top-full left-0 pt-1 bg-transparent z-50"
                      onMouseEnter={() => setHoverHighlightPicker(true)}
                      onMouseLeave={() => setHoverHighlightPicker(false)}
                    >
                      <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-2 w-48">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded mb-2 border-b border-gray-200"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            console.log('[NoteEditor] 🗑️ Click rimuovi evidenziatore, Selezione salvata:', !!savedSelectionRef.current)
                            if (!savedSelectionRef.current) {
                              const selection = window.getSelection()
                              if (selection && selection.rangeCount > 0) {
                                savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                                console.log('[NoteEditor] 💾 Selezione salvata (click rimuovi evidenziatore):', selection.toString())
                              }
                            }
                            handleRemoveHighlight()
                          }}
                        >
                          <X className="h-4 w-4" />
                          <span>Rimuovi evidenziatore</span>
                        </button>
                        <div className="grid grid-cols-4 gap-2">
                          {highlightColors.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                              style={{ backgroundColor: color }}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('[NoteEditor] 🖍️ Click su evidenziatore:', color, 'Selezione salvata:', !!savedSelectionRef.current)
                                if (!savedSelectionRef.current) {
                                  const selection = window.getSelection()
                                  if (selection && selection.rangeCount > 0) {
                                    savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                                    console.log('[NoteEditor] 💾 Selezione salvata (click evidenziatore):', selection.toString())
                                  }
                                }
                                // ✅ Applica l'evidenziatore
                                handleHighlight(color)
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ✅ Hover menu per dimensione font */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    // ✅ Salva la selezione quando si passa il mouse
                    const selection = window.getSelection()
                    if (selection && selection.rangeCount > 0) {
                      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                      console.log('[NoteEditor] 💾 Selezione salvata (hover dimensione font):', selection.toString())
                    }
                    setHoverFontSizePicker(true)
                  }}
                  onMouseLeave={() => {
                    setHoverFontSizePicker(false)
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Dimensione font"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                  {/* ✅ Menu hover - con padding-top invisibile per creare gap */}
                  {hoverFontSizePicker && (
                    <div
                      className="absolute top-full left-0 pt-1 bg-transparent z-50"
                      onMouseEnter={() => setHoverFontSizePicker(true)}
                      onMouseLeave={() => setHoverFontSizePicker(false)}
                    >
                      <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-2 w-32">
                        <div className="space-y-1">
                          {fontSizes.map((size) => (
                            <button
                              key={size}
                              type="button"
                              className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('[NoteEditor] 📏 Click su dimensione font:', size, 'Selezione salvata:', !!savedSelectionRef.current)
                                if (!savedSelectionRef.current) {
                                  const selection = window.getSelection()
                                  if (selection && selection.rangeCount > 0) {
                                    savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
                                    console.log('[NoteEditor] 💾 Selezione salvata (click dimensione font):', selection.toString())
                                  }
                                }
                                // ✅ Applica la dimensione
                                handleFontSize(size)
                              }}
                            >
                              Dimensione {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pulsante Copia */}
              <div className="pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy()
                  }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded text-sm w-full"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copia selezione</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
