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

  // ✅ Helper: verifica se un evento è dentro il nostro host
  const isEventInHost = useCallback((target: EventTarget | null): boolean => {
    const host = hostRef.current
    if (!host || !target) return false

    const element = target as HTMLElement
    return host.contains(element)
  }, [hostRef])

  // ✅ Helper: crea wrapper per listener che verifica sempre host.contains
  const createWrappedListener = useCallback((
    originalListener: ((e: MouseEvent | KeyboardEvent) => void) | undefined,
    shouldResetOnExit: boolean = false
  ) => {
    if (!originalListener) return undefined

    return (e: MouseEvent | KeyboardEvent) => {
      // ✅ CRITICO: Verifica sempre che l'evento sia dentro il nostro host
      if (!isEventInHost(e.target)) {
        // ✅ Se l'evento è fuori dal host, resetta lo stato se necessario
        if (shouldResetOnExit && onResetState) {
          onResetState()
        }
        return // Ignora eventi fuori dal host
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
  }, [enabled, isActive, isEventInHost, onResetState])

  // ✅ Gestisce attaccamento/rimozione listener
  useEffect(() => {
    const host = hostRef.current
    if (!host) {
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
      // ✅ Rimuovi listener se erano stati attaccati in precedenza
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
      return
    }

    // ✅ Crea wrapper per ogni listener con verifica host.contains
    // ✅ onMouseMove e onMouseUp resettano lo stato se il mouse esce dal host
    const wrappedListeners = {
      onMouseDown: createWrappedListener(listeners.onMouseDown, false),
      onMouseMove: createWrappedListener(listeners.onMouseMove, true), // ✅ Reset se mouse esce
      onMouseUp: createWrappedListener(listeners.onMouseUp, true), // ✅ Reset se mouse esce
      onKeyDown: createWrappedListener(listeners.onKeyDown, false),
      onSelectionChange: listeners.onSelectionChange ? () => {
        // ✅ Per selectionchange, verifica che la selezione sia dentro il host
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0)
          if (!isEventInHost(range.commonAncestorContainer as Node)) {
            return // Selezione non è nel nostro viewer, ignora
          }
        }
        listeners.onSelectionChange!()
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
  }, [enabled, isActive, hostRef, listeners, capture, passive, createWrappedListener, isEventInHost, onResetState])

  return {
    isProcessing: isProcessingRef.current
  }
}
