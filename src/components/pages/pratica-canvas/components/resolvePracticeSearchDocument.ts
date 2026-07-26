/**
 * Risolve il documento della pratica da aprire a partire da un match della ricerca globale.
 */

import type { Documento } from '../../../../types'

/**
 * Trova il documento apribile nel tavolo: id/hash/s3Key, poi filename.
 */
export function resolvePracticeSearchDocument(
  documents: Documento[],
  docId: string,
  docTitle?: string
): Documento | undefined {
  const trimmedId = docId.trim()
  if (!trimmedId) {
    throw new Error('docId mancante: impossibile risolvere il documento della ricerca')
  }

  const byLocator = documents.find((document) =>
    document.id === trimmedId
    || (document.hash && document.hash === trimmedId)
    || (document.s3Key && document.s3Key === trimmedId)
  )
  if (byLocator) return byLocator

  const trimmedTitle = docTitle?.trim()
  if (!trimmedTitle) return undefined

  return documents.find((document) => document.filename === trimmedTitle)
}
