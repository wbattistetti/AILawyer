/**
 * Web Worker runtime for page-by-page person extraction.
 */

// @ts-ignore Worker module entry for Vite/Cursor
import { detectOnPage } from './detect-on-page'
import type { WorkerIn, WorkerOut } from './extract-types'

export { detectOnPage } from './detect-on-page'
export type {
  BoxPct,
  OccOut,
  PageTokens,
  Token,
  WorkerIn,
  WorkerOut,
} from './extract-types'

let cancelled = false

const debug = (...args: unknown[]): void => {
  if (typeof self !== 'undefined' && (self as typeof self & { __ENTITY_DEBUG__?: boolean }).__ENTITY_DEBUG__) {
    console.log('[ENTITY][worker]', ...args)
  }
}

if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent<WorkerIn>) => {
    try {
      const message = event.data
      if (message.type === 'cancel') {
        cancelled = true
        return
      }
      if (message.type === 'beginDoc') {
        cancelled = false
        debug('beginDoc', { docId: message.docId, docTitle: message.docTitle })
        return
      }
      if (message.type === 'page') {
        if (cancelled) return
        const { page, tokens, docId } = message.payload
        const items = detectOnPage(tokens, page)
        debug('page', { docId, page, tokens: tokens.length, hits: items.length })
        self.postMessage({ type: 'occurrences', docId, page, items } satisfies WorkerOut)
        self.postMessage({ type: 'progress', docId, page } satisfies WorkerOut)
        return
      }
      if (message.type === 'endDoc' && !cancelled) {
        debug('doneDoc', { docId: message.docId })
        self.postMessage({ type: 'done', docId: message.docId } satisfies WorkerOut)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      debug('error', message)
      self.postMessage({ type: 'error', message } satisfies WorkerOut)
    }
  }
}
