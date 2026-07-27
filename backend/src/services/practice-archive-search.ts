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
import {
  classifyDocumentForSearch,
  type SearchDocumentMetadata
} from './document-search-classifier.js'

export interface PracticeArchiveSearchInput {
  praticaId: string
  query: string
  locators?: DocumentLocator[]
}

export interface PracticeSearchDiagnostic {
  docId: string
  filename: string
  code: 'ocr-required'
  message: string
  ocrStatus: string
}

export interface PracticeArchiveSearchResult {
  matches: DocumentSearchMatch[]
  diagnostics: PracticeSearchDiagnostic[]
}

const locatorKey = (locator: DocumentLocator): string => locator.id.trim()

/** Crea il messaggio utente per un PDF scansionato non ancora ricercabile. */
export function makeOcrRequiredDiagnostic(
  document: SearchDocumentMetadata
): PracticeSearchDiagnostic {
  const status = document.ocrStatus.trim().toLowerCase()
  const message = status === 'processing'
    ? 'OCR in corso: il documento non è ancora ricercabile'
    : status === 'failed'
      ? 'OCR non riuscito: ripetere l’elaborazione per rendere ricercabile il documento'
      : 'OCR non disponibile: eseguire l’OCR per cercare nel documento scansionato'
  return {
    docId: document.id,
    filename: document.filename,
    code: 'ocr-required',
    message,
    ocrStatus: document.ocrStatus
  }
}

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
    const hash = locator.hash || existing?.hash
    const storageKey = locator.storageKey || existing?.storageKey
    const filename = locator.filename || existing?.filename
    byId.set(id, {
      id,
      ...(hash ? { hash } : {}),
      ...(storageKey ? { storageKey } : {}),
      ...(filename ? { filename } : {})
    })
  }

  return Array.from(byId.values())
}

/**
 * Cerca la query in tutti i documenti risolvibili della pratica.
 */
export async function searchPracticeArchive(
  input: PracticeArchiveSearchInput
): Promise<PracticeArchiveSearchResult> {
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
      s3Key: true,
      mime: true,
      hasNativeText: true,
      ocrStatus: true,
      ocrText: true
    }
  })

  const locators = mergePracticeSearchLocators(databaseDocuments, input.locators || [])
  const matches: DocumentSearchMatch[] = []
  const diagnostics: PracticeSearchDiagnostic[] = []
  const metadataById = new Map<string, SearchDocumentMetadata>(
    databaseDocuments.map((document) => [document.id, document])
  )

  for (const locator of locators) {
    const metadata = metadataById.get(locator.id)
    const classification = metadata
      ? classifyDocumentForSearch(metadata)
      : null
    if (classification?.role === 'ignored') continue
    if (classification?.role === 'ocr-required' && metadata) {
      diagnostics.push(makeOcrRequiredDiagnostic(metadata))
      continue
    }

    try {
      const content = await resolveSearchableDocument(locator)
      matches.push(...searchDocumentContent(content, query))
    } catch (error) {
      if (
        error instanceof DocumentContentNotFoundError
        || error instanceof DocumentTextUnavailableError
      ) {
        if (metadata && classification?.kind === 'pdf') {
          diagnostics.push(makeOcrRequiredDiagnostic(metadata))
        }
        continue
      }
      throw error
    }
  }

  return { matches, diagnostics }
}
