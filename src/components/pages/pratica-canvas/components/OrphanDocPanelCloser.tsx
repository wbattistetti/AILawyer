/**
 * Tab documento ripristinata ma non più disponibile nello store:
 * chiude automaticamente il pannello dopo il load documenti.
 */
import { useEffect } from 'react'

type Props = {
  panelApi?: { close?: () => void }
  message?: string
}

export function OrphanDocPanelCloser({
  panelApi,
  message = 'Documento non disponibile. Chiusura tab…',
}: Props) {
  useEffect(() => {
    if (!panelApi || typeof panelApi.close !== 'function') return
    const timer = window.setTimeout(() => {
      try {
        panelApi.close?.()
      } catch {
        // pannello già chiuso
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [panelApi])

  return <div className="p-4 text-sm text-muted-foreground">{message}</div>
}
