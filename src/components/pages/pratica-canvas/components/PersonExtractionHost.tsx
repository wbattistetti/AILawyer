/**
 * Host sempre montato: consuma le richieste di estrazione anagrafiche senza aprire la tab.
 */

import { useEffect, useRef } from 'react'
import {
  consumePersonExtractionRequest,
  getPersonDraft,
  subscribePersonDraft,
} from '../../../../features/entities/person-draft-store'
import { runPersonExtraction } from '../../../../features/entities/run-person-extraction'

type ToastFn = (options: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}) => void

/** Ascolta `extractRequested` e avvia il job; opzionalmente apre la tab a fine lavoro. */
export function PersonExtractionHost({
  praticaId,
  onCompleted,
  toast,
}: {
  praticaId: string
  onCompleted?: () => void
  toast?: ToastFn
}) {
  const runningRef = useRef(false)
  const onCompletedRef = useRef(onCompleted)
  const toastRef = useRef(toast)
  onCompletedRef.current = onCompleted
  toastRef.current = toast

  useEffect(() => {
    if (!praticaId) return

    const maybeStart = () => {
      const draft = getPersonDraft(praticaId)
      if (!draft?.extractRequested || runningRef.current) return
      if (!consumePersonExtractionRequest(praticaId)) return

      runningRef.current = true
      void runPersonExtraction(praticaId)
        .then(result => {
          if (result.warning) {
            toastRef.current?.({
              title: 'Anagrafiche estratte con avvisi',
              description: result.warning,
            })
          }
          onCompletedRef.current?.()
        })
        .catch(cause => {
          const message = cause instanceof Error ? cause.message : 'Estrazione anagrafiche fallita'
          const waitingForOcr = /OCR ancora in corso/i.test(message)
          toastRef.current?.({
            title: waitingForOcr ? 'OCR in corso' : 'Errore anagrafiche',
            description: message,
            variant: waitingForOcr ? 'default' : 'destructive',
          })
        })
        .finally(() => {
          runningRef.current = false
        })
    }

    maybeStart()
    return subscribePersonDraft(maybeStart)
  }, [praticaId])

  return null
}
