import { useState, useEffect, useCallback, useRef } from 'react'
import { Pratica } from '@/types'

interface UseDeleteWithUndoOptions {
  onConfirm: (id: string) => Promise<void>
}

export function useDeleteWithUndo({ onConfirm }: UseDeleteWithUndoOptions) {
  const [deletedPraticaId, setDeletedPraticaId] = useState<string | null>(null)
  const [deletedPratica, setDeletedPratica] = useState<Pratica | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(10)

  const undoTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup timers
  const cleanupTimers = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  // Start delete with undo
  const startDelete = useCallback((pratica: Pratica) => {
    cleanupTimers()

    setDeletedPraticaId(pratica.id)
    setDeletedPratica(pratica)
    setSecondsLeft(10)

    // Countdown ogni secondo
    let seconds = 10
    const interval = setInterval(() => {
      seconds--
      setSecondsLeft(seconds)
      if (seconds <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    countdownIntervalRef.current = interval

    // Timer per eliminazione definitiva dopo 10 secondi
    const timer = setTimeout(async () => {
      clearInterval(interval)
      try {
        await onConfirm(pratica.id)
        setDeletedPraticaId(null)
        setDeletedPratica(null)
      } catch (error) {
        console.error('Errore eliminazione pratica:', error)
        setDeletedPraticaId(null)
        setDeletedPratica(null)
      }
      cleanupTimers()
    }, 10000)

    undoTimerRef.current = timer
  }, [onConfirm, cleanupTimers])

  // Cancel delete (undo)
  const cancelDelete = useCallback(() => {
    cleanupTimers()
    setDeletedPraticaId(null)
    setDeletedPratica(null)
    setSecondsLeft(10)
  }, [cleanupTimers])

  // Cleanup on unmount
  useEffect(() => {
    return cleanupTimers
  }, [cleanupTimers])

  return {
    deletedPraticaId,
    deletedPratica,
    secondsLeft,
    startDelete,
    cancelDelete
  }
}
