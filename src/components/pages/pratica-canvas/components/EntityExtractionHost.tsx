/**
 * Host sempre montato: consuma le richieste di estrazione entità senza aprire la tab.
 */

import { useEffect, useRef } from 'react'
import {
  consumeEntityExtractionRequest,
  getEntityDraft,
  subscribeEntityDraft,
} from '../../../../features/generic-entities/entity-draft-store'
import { runEntityExtraction } from '../../../../features/generic-entities/run-entity-extraction'

type ToastFn = (options: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}) => void

/** Ascolta `extractRequested` e avvia il job; opzionalmente apre la tab a fine lavoro. */
export function EntityExtractionHost({
  praticaId,
  onCompleted,
  toast,
}: {
  praticaId: string
  onCompleted?: () => void
  toast?: ToastFn
}) {
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const onCompletedRef = useRef(onCompleted)
  const toastRef = useRef(toast)
  onCompletedRef.current = onCompleted
  toastRef.current = toast

  useEffect(() => () => abortRef.current?.abort(), [praticaId])

  useEffect(() => {
    if (!praticaId) return

    const maybeStart = () => {
      const draft = getEntityDraft(praticaId)
      if (!draft?.extractRequested || runningRef.current) return
      if (!consumeEntityExtractionRequest(praticaId)) return

      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      runningRef.current = true

      void runEntityExtraction(praticaId, controller.signal)
        .then(result => {
          if (result.warnings.length > 0) {
            toastRef.current?.({
              title: 'Entità estratte con avvisi',
              description: result.warnings.slice(0, 3).join('\n'),
            })
          }
          onCompletedRef.current?.()
        })
        .catch(cause => {
          if (controller.signal.aborted) return
          const message = cause instanceof Error ? cause.message : 'Estrazione entità fallita'
          toastRef.current?.({
            title: 'Errore entità',
            description: message,
            variant: 'destructive',
          })
        })
        .finally(() => {
          if (abortRef.current === controller) {
            abortRef.current = null
          }
          runningRef.current = false
        })
    }

    maybeStart()
    return subscribeEntityDraft(maybeStart)
  }, [praticaId])

  return null
}
