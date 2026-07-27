/**
 * Calcola quali documenti devono essere estratti o rimossi da una bozza.
 */

export type ExtractionDocument = {
  id: string
  hash?: string | null
}

export type DocumentExtractionPlan = {
  documentIdsToExtract: string[]
  removedDocumentIds: string[]
}

/** Crea una firma stabile e reversibile dell'insieme di documenti analizzato. */
export function createPracticeDocumentSignature(
  documents: readonly ExtractionDocument[]
): string {
  const entries = documents
    .map(document => {
      const id = document.id.trim()
      if (!id) {
        throw new Error('createPracticeDocumentSignature: document id is required')
      }
      return [id, document.hash ?? ''] as const
    })
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))

  return JSON.stringify(entries)
}

/**
 * Confronta l'ultima estrazione con i documenti correnti.
 * Una firma assente o non leggibile richiede prudentemente una nuova estrazione completa.
 */
export function createDocumentExtractionPlan(
  extractedSignature: string | null,
  currentDocuments: readonly ExtractionDocument[]
): DocumentExtractionPlan {
  const currentById = toDocumentMap(currentDocuments)
  if (!extractedSignature) {
    return {
      documentIdsToExtract: [...currentById.keys()],
      removedDocumentIds: [],
    }
  }

  const extractedById = parseDocumentSignature(extractedSignature)
  if (!extractedById) {
    return {
      documentIdsToExtract: [...currentById.keys()],
      removedDocumentIds: [],
    }
  }

  const documentIdsToExtract = [...currentById.entries()]
    .filter(([id, hash]) => extractedById.get(id) !== hash)
    .map(([id]) => id)
  const removedDocumentIds = [...extractedById.keys()]
    .filter(id => !currentById.has(id))

  return { documentIdsToExtract, removedDocumentIds }
}

/**
 * Aggiorna la firma con i soli documenti elaborati con successo e con le rimozioni applicate.
 * I documenti falliti restano così rilevabili al tentativo successivo.
 */
export function updatePracticeDocumentSignature(input: {
  previousSignature: string | null
  currentDocuments: readonly ExtractionDocument[]
  processedDocumentIds: readonly string[]
  removedDocumentIds: readonly string[]
}): string {
  const currentById = toDocumentMap(input.currentDocuments)
  const previousById = input.previousSignature
    ? parseDocumentSignature(input.previousSignature) ?? new Map<string, string>()
    : new Map<string, string>()

  for (const id of input.removedDocumentIds) {
    previousById.delete(id)
  }
  for (const id of input.processedDocumentIds) {
    const hash = currentById.get(id)
    if (hash === undefined) {
      throw new Error(`updatePracticeDocumentSignature: processed document not found: ${id}`)
    }
    previousById.set(id, hash)
  }

  return createPracticeDocumentSignature(
    [...previousById].map(([id, hash]) => ({ id, hash }))
  )
}

function toDocumentMap(documents: readonly ExtractionDocument[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const document of documents) {
    const id = document.id.trim()
    if (!id) {
      throw new Error('createDocumentExtractionPlan: document id is required')
    }
    if (result.has(id)) {
      throw new Error(`createDocumentExtractionPlan: duplicate document id ${id}`)
    }
    result.set(id, document.hash ?? '')
  }
  return result
}

function parseDocumentSignature(signature: string): Map<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(signature)
    if (!Array.isArray(parsed)) return null

    const documents: ExtractionDocument[] = parsed.map(entry => {
      if (
        !Array.isArray(entry)
        || entry.length !== 2
        || typeof entry[0] !== 'string'
        || typeof entry[1] !== 'string'
      ) {
        throw new Error('invalid signature entry')
      }
      return { id: entry[0], hash: entry[1] }
    })
    return toDocumentMap(documents)
  } catch {
    return parseLegacyDocumentSignature(signature)
  }
}

function parseLegacyDocumentSignature(signature: string): Map<string, string> | null {
  if (!signature) return new Map()
  const result = new Map<string, string>()
  for (const entry of signature.split('|')) {
    const separator = entry.lastIndexOf(':')
    if (separator <= 0) return null
    const id = entry.slice(0, separator)
    if (result.has(id)) return null
    result.set(id, entry.slice(separator + 1))
  }
  return result
}
