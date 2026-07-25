/**
 * ✅ Hook comune per gestire listener globali isolati per viewer
 * Garantisce che solo il viewer attivo processi eventi
 * Enterprise-ready: risolve completamente il problema dell'interferenza tra viewer
 */

import { useEffect, useRef, useCallback } from 'react'

export interface IsolatedGlobalListenersConfig<T extends HTMLElement> {
  /**
   * ID univoco del viewer (es. docId)
   */
  viewerId: string
  /**
   * Ref all'elemento host del viewer
   */
  hostRef: React.RefObject<T>
  /**
   * Se il viewer è abilitato (es. selectMode per PDF, enabled per Word)
   */
  enabled: boolean
  /**
   * Se il viewer è attualmente attivo (visibile/focus)
   * Deve essere passato dal componente padre (es. da DockWorkspace)
   */
  isActive: boolean
  /**
   * Listener per eventi mouse
   */
  listeners: {
    onMouseDown?: (e: MouseEvent) => void
    onMouseMove?: (e: MouseEvent) => void
    onMouseUp?: (e: MouseEvent) => void
    onKeyDown?: (e: KeyboardEvent) => void
    onSelectionChange?: () => void
  }
  /**
   * Funzione opzionale per resettare lo stato quando il mouse esce dal host
   * Chiamata automaticamente quando un evento arriva fuori dal host
   */
  onResetState?: () => void
  /**
   * Opzioni per i listener
   */
  options?: {
    /**
     * Usa capture phase per mousedown/mouseup (default: false)
     */
    capture?: boolean
    /**
     * Usa passive per mousemove (default: true)
     */
    passive?: boolean
  }
}

/**
 * ✅ Hook che gestisce listener globali isolati per viewer
 *
 * Caratteristiche:
 * - Listener attivi SOLO se enabled && isActive
 * - Verifica sempre host.contains(target) prima di processare eventi
 * - Reset automatico dello stato quando mouse esce dal host
 * - Cleanup completo quando enabled o isActive cambiano
 */
export function useIsolatedGlobalListeners<T extends HTMLElement>({
  viewerId,
  hostRef,
  enabled,
  isActive,
  listeners,
  options = {},
  onResetState
}: IsolatedGlobalListenersConfig<T>) {

  const {
    capture = false,
    passive = true
  } = options

  // ✅ Ref per tracciare se stiamo processando un evento (per evitare race conditions)
  const isProcessingRef = useRef(false)

  // ✅ Ref per tracciare i listener attaccati (per cleanup garantito)
  const attachedListenersRef = useRef<{
    onMouseDown?: (e: MouseEvent) => void
    onMouseMove?: (e: MouseEvent) => void
    onMouseUp?: (e: MouseEvent) => void
    onKeyDown?: (e: KeyboardEvent) => void
    onSelectionChange?: () => void
  }>({})

  // ✅ Ref per listeners e onResetState (evita re-render quando cambiano)
  const listenersRef = useRef(listeners)
  const onResetStateRef = useRef(onResetState)

  // ✅ Aggiorna ref quando cambiano (senza causare re-render)
  useEffect(() => {
    listenersRef.current = listeners
    onResetStateRef.current = onResetState
  }, [listeners, onResetState])

  // ✅ Helper: verifica se un evento è dentro il nostro host
  const isEventInHost = useCallback((target: EventTarget | null): boolean => {
    const host = hostRef.current
    if (!host || !target) return false

    const element = target as HTMLElement

    // ✅ Verifica diretta: elemento è dentro host
    if (host.contains(element)) {
      return true
    }

    // ✅ Verifica alternativa: se l'elemento è un canvas/SVG dentro il PDF viewer,
    // potrebbe essere che l'elemento non sia un discendente diretto ma sia comunque dentro il host
    // Cerca il parent più vicino che è dentro il host
    let current: HTMLElement | null = element
    while (current && current !== host) {
      if (host.contains(current)) {
        return true
      }
      current = current.parentElement
    }

    return false
  }, [hostRef])

  // ✅ Helper: crea wrapper per listener che verifica sempre host.contains
  const createWrappedListener = useCallback((
    originalListener: ((e: MouseEvent | KeyboardEvent) => void) | undefined,
    shouldResetOnExit: boolean = false
  ) => {
    if (!originalListener) return undefined

    return (e: MouseEvent | KeyboardEvent) => {
      const target = e.target as HTMLElement

      // 🔥 Escludi il pannello di ricerca PDF dai listener globali
      if (target.closest('[data-role="document-search-panel"]')) {
        return
      }

      const isInHost = isEventInHost(e.target)

      // ✅ Per mousemove, verifica le coordinate del mouse invece di solo l'elemento target
      // (durante il drag, il mouse può muoversi su elementi diversi ma essere ancora sopra il host)
      if (originalListener === listenersRef.current.onMouseMove && e instanceof MouseEvent) {
        const host = hostRef.current
        if (host) {
          const hostRect = host.getBoundingClientRect()
          const isMouseOverHost = (
            e.clientX >= hostRect.left &&
            e.clientX <= hostRect.right &&
            e.clientY >= hostRect.top &&
            e.clientY <= hostRect.bottom
          )

          if (!isMouseOverHost) {
            // ✅ Mouse fuori dal host, resetta se necessario
            if (shouldResetOnExit && onResetStateRef.current) {
              onResetStateRef.current()
            }
            return
          }
          // ✅ Mouse è sopra il host, procedi anche se target non è nel host
        } else if (!isInHost) {
          // ✅ Host non trovato e target non è nel host, ignora
          if (shouldResetOnExit && onResetStateRef.current) {
            onResetStateRef.current()
          }
          return
        }
      } else {
        // ✅ Per altri eventi (mousedown, mouseup), verifica sempre che l'evento sia dentro il nostro host
        if (!isInHost) {
          // ✅ Se l'evento è fuori dal host, resetta lo stato se necessario
          if (shouldResetOnExit && onResetStateRef.current) {
            onResetStateRef.current()
          }
          return // Ignora eventi fuori dal host
        }
      }

      // ✅ Verifica che il viewer sia ancora attivo (doppio controllo)
      if (!enabled || !isActive) {
        return // Viewer non più attivo, ignora
      }

      // ✅ Processa l'evento
      try {
        isProcessingRef.current = true
        originalListener(e)
      } finally {
        isProcessingRef.current = false
      }
    }
  }, [enabled, isActive, isEventInHost])

  // ✅ Gestisce attaccamento/rimozione listener
  useEffect(() => {
    const host = hostRef.current

    // ✅ Log diagnostico: listener attaccati/staccati
    if (enabled && isActive) {
      console.log('[LISTENERS] ✅ Attaccati:', { viewerId, enabled, isActive })
    } else {
      console.warn('[LISTENERS] ⚠️ NON attaccati:', { viewerId, enabled, isActive })
    }

    // ✅ CRITICO: Rimuovi SEMPRE i listener vecchi PRIMA di aggiungere nuovi
    const attached = attachedListenersRef.current
    if (attached.onMouseDown) {
      document.removeEventListener('mousedown', attached.onMouseDown, capture)
    }
    if (attached.onMouseMove) {
      document.removeEventListener('mousemove', attached.onMouseMove, { passive })
    }
    if (attached.onMouseUp) {
      document.removeEventListener('mouseup', attached.onMouseUp, capture)
    }
    if (attached.onKeyDown) {
      document.removeEventListener('keydown', attached.onKeyDown, capture)
    }
    if (attached.onSelectionChange) {
      document.removeEventListener('selectionchange', attached.onSelectionChange, capture)
    }
    attachedListenersRef.current = {}

    if (!host) {
      console.warn('[LISTENERS] ⚠️ Host non trovato:', { viewerId })
      // ✅ Cleanup anche se host non esiste
      return () => {
        // Rimuovi tutti i listener se erano stati attaccati
        const attached = attachedListenersRef.current
        if (attached.onMouseDown) {
          document.removeEventListener('mousedown', attached.onMouseDown, capture)
        }
        if (attached.onMouseMove) {
          document.removeEventListener('mousemove', attached.onMouseMove, { passive })
        }
        if (attached.onMouseUp) {
          document.removeEventListener('mouseup', attached.onMouseUp, capture)
        }
        if (attached.onKeyDown) {
          document.removeEventListener('keydown', attached.onKeyDown, capture)
        }
        if (attached.onSelectionChange) {
          document.removeEventListener('selectionchange', attached.onSelectionChange, capture)
        }
        attachedListenersRef.current = {}
      }
    }

        // ✅ CRITICO: Listener attivi SOLO se enabled && isActive
        if (!enabled || !isActive) {
          return
        }

    // ✅ Crea wrapper per ogni listener con verifica host.contains
    // ✅ onMouseMove e onMouseUp resettano lo stato se il mouse esce dal host
    // ✅ Usa listenersRef.current per evitare dipendenze che causano re-render
    const wrappedListeners = {
      onMouseDown: createWrappedListener(listenersRef.current.onMouseDown, false),
      onMouseMove: createWrappedListener(listenersRef.current.onMouseMove, true), // ✅ Reset se mouse esce
      onMouseUp: createWrappedListener(listenersRef.current.onMouseUp, true), // ✅ Reset se mouse esce
      onKeyDown: createWrappedListener(listenersRef.current.onKeyDown, false),
      onSelectionChange: listenersRef.current.onSelectionChange ? () => {
        // ✅ Per selectionchange, verifica che la selezione sia dentro il host
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0)
          if (!isEventInHost(range.commonAncestorContainer as Node)) {
            return // Selezione non è nel nostro viewer, ignora
          }
        }
        listenersRef.current.onSelectionChange!()
      } : undefined
    }

    // ✅ Attacca listener globali
    if (wrappedListeners.onMouseDown) {
      document.addEventListener('mousedown', wrappedListeners.onMouseDown, capture)
      attachedListenersRef.current.onMouseDown = wrappedListeners.onMouseDown
    }
    if (wrappedListeners.onMouseMove) {
      document.addEventListener('mousemove', wrappedListeners.onMouseMove, { passive })
      attachedListenersRef.current.onMouseMove = wrappedListeners.onMouseMove
    }
    if (wrappedListeners.onMouseUp) {
      document.addEventListener('mouseup', wrappedListeners.onMouseUp, capture)
      attachedListenersRef.current.onMouseUp = wrappedListeners.onMouseUp
    }
    if (wrappedListeners.onKeyDown) {
      document.addEventListener('keydown', wrappedListeners.onKeyDown, capture)
      attachedListenersRef.current.onKeyDown = wrappedListeners.onKeyDown
    }
    if (wrappedListeners.onSelectionChange) {
      document.addEventListener('selectionchange', wrappedListeners.onSelectionChange, capture)
      attachedListenersRef.current.onSelectionChange = wrappedListeners.onSelectionChange
    }

    // ✅ Cleanup: rimuovi listener quando cambiano dipendenze
    return () => {
      const attached = attachedListenersRef.current
      if (attached.onMouseDown) {
        document.removeEventListener('mousedown', attached.onMouseDown, capture)
      }
      if (attached.onMouseMove) {
        document.removeEventListener('mousemove', attached.onMouseMove, { passive })
      }
      if (attached.onMouseUp) {
        document.removeEventListener('mouseup', attached.onMouseUp, capture)
      }
      if (attached.onKeyDown) {
        document.removeEventListener('keydown', attached.onKeyDown, capture)
      }
      if (attached.onSelectionChange) {
        document.removeEventListener('selectionchange', attached.onSelectionChange, capture)
      }
      attachedListenersRef.current = {}
    }
  }, [enabled, isActive, hostRef, capture, passive, createWrappedListener, isEventInHost])

  return {
    isProcessing: isProcessingRef.current
  }
}
