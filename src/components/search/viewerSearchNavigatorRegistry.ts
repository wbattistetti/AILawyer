/**
 * Registry dei navigatori viewer: apre/attende il documento giusto e naviga al match.
 * Sostituisce il bus a eventi `app:goto-match` per la ricerca.
 */

import type { ViewerSearchNavigator } from './types'

type Waiter = {
  resolve: (navigator: ViewerSearchNavigator) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

/**
 * Registro in-memory dei viewer pronti a navigare sui match di ricerca.
 */
export class ViewerSearchNavigatorRegistry {
  private readonly navigators = new Map<string, ViewerSearchNavigator>()
  private readonly waiters = new Map<string, Waiter[]>()

  /**
   * Registra un navigatore; restituisce la funzione di deregistrazione.
   */
  register(navigator: ViewerSearchNavigator): () => void {
    const documentId = navigator.documentId.trim()
    if (!documentId) {
      throw new Error('ViewerSearchNavigator senza documentId')
    }

    this.navigators.set(documentId, navigator)
    const pending = this.waiters.get(documentId) || []
    this.waiters.delete(documentId)
    for (const waiter of pending) {
      clearTimeout(waiter.timeoutId)
      waiter.resolve(navigator)
    }

    return () => {
      if (this.navigators.get(documentId) === navigator) {
        this.navigators.delete(documentId)
      }
    }
  }

  /**
   * Attende che il viewer del documento sia montato e pronto a evidenziare.
   */
  waitFor(documentId: string, timeoutMs = 10_000): Promise<ViewerSearchNavigator> {
    const id = documentId.trim()
    if (!id) {
      return Promise.reject(new Error('documentId mancante per attendere il navigatore'))
    }

    const existing = this.navigators.get(id)
    if (existing) return Promise.resolve(existing)

    return new Promise<ViewerSearchNavigator>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const queue = this.waiters.get(id) || []
        this.waiters.set(
          id,
          queue.filter((waiter) => waiter.timeoutId !== timeoutId)
        )
        reject(new Error(`Viewer non pronto per evidenziare il documento "${id}"`))
      }, timeoutMs)

      const queue = this.waiters.get(id) || []
      queue.push({ resolve, reject, timeoutId })
      this.waiters.set(id, queue)
    })
  }
}
