/**
 * Ricerca globale su tutti i documenti di una pratica, con lo stesso motore della ricerca documento.
 */

import { prisma } from '../lib/database.js'
import {
  DocumentContentNotFoundError,
  DocumentTextUnavailableError,
  resolveSearchableDocument,
  type DocumentLocator
} from './document-content-resolver.js'
import {
  searchDocumentContent,
  type DocumentSearchMatch
} from './document-search-service.js'

export interface PracticeArchiveSearchInput {
  praticaId: string
  query: string
  locators?: DocumentLocator[]
}

const locatorKey = (locator: DocumentLocator): string => locator.id.trim()

/**
 * Unisce i documenti DB della pratica con eventuali locator del client (es. OCR locale).
 */
export function mergePracticeSearchLocators(
  databaseDocuments: Array<{
    id: string
    filename: string
    hash: string | null
    s3Key: string
  }>,
  clientLocators: DocumentLocator[] = []
): DocumentLocator[] {
  const byId = new Map<string, DocumentLocator>()

  for (const document of databaseDocuments) {
    byId.set(document.id, {
      id: document.id,
      ...(document.hash ? { hash: document.hash } : {}),
      storageKey: document.s3Key,
      filename: document.filename
    })
  }

  for (const locator of clientLocators) {
    const id = locatorKey(locator)
    if (!id) {
      throw new Error('Locator ricerca pratica senza id')
    }
    const existing = byId.get(id)
    byId.set(id, {
      id,
      ...(locator.hash || existing?.hash ? { hash: locator.hash || existing?.hash } : {}),
      ...(locator.storageKey || existing?.storageKey
        ? { storageKey: locator.storageKey || existing?.storageKey }
        : {}),
      ...(locator.filename || existing?.filename
        ? { filename: locator.filename || existing?.filename }
        : {})
    })
  }

  return Array.from(byId.values())
}

/**
 * Cerca la query in tutti i documenti risolvibili della pratica.
 */
export async function searchPracticeArchive(
  input: PracticeArchiveSearchInput
): Promise<DocumentSearchMatch[]> {
  const praticaId = input.praticaId.trim()
  const query = input.query.trim()
  if (!praticaId) throw new Error('praticaId obbligatorio per la ricerca globale')
  if (!query) throw new Error('La query di ricerca non può essere vuota')

  const databaseDocuments = await prisma.documento.findMany({
    where: { praticaId },
    select: {
      id: true,
      filename: true,
      hash: true,
      s3Key: true
    }
  })

  const locators = mergePracticeSearchLocators(databaseDocuments, input.locators || [])
  const matches: DocumentSearchMatch[] = []

  for (const locator of locators) {
    try {
      const content = await resolveSearchableDocument(locator)
      matches.push(...searchDocumentContent(content, query))
    } catch (error) {
      if (
        error instanceof DocumentContentNotFoundError
        || error instanceof DocumentTextUnavailableError
      ) {
        continue
      }
      throw error
    }
  }

  return matches
}
