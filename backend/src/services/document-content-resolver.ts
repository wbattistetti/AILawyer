/**
 * Risolve un riferimento documento in contenuto testuale ricercabile.
 * Nasconde ai consumer le differenze tra OCR locale, database e PDF nativo.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/database.js'
import { extractNativeText } from '../lib/extractNativeText.js'
import { storageService } from '../lib/storage.js'
import { getLocalOcrResultByPrefix } from './local-ocr-store.js'

export interface DocumentLocator {
  id: string
  hash?: string
  storageKey?: string
  filename?: string
}

export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrPageLayout {
  page?: number
  width?: number
  height?: number
  words: OcrWord[]
}

export interface SearchableDocumentContent {
  requestedId: string
  canonicalId: string
  filename: string
  source: 'local-ocr' | 'database-ocr' | 'native-pdf'
  pages: string[]
  layout: OcrPageLayout[]
}

export class DocumentContentNotFoundError extends Error {}
export class DocumentTextUnavailableError extends Error {}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const LEGACY_LOCAL_PREFIX = /^(?:temp|pending):/

const requireLocator = (locator: DocumentLocator): DocumentLocator => {
  const id = locator.id.trim()
  if (!id) throw new Error('DocumentLocator.id è obbligatorio')
  return {
    id,
    ...(locator.hash?.trim() ? { hash: locator.hash.trim() } : {}),
    ...(locator.storageKey?.trim() ? { storageKey: locator.storageKey.trim() } : {}),
    ...(locator.filename?.trim() ? { filename: locator.filename.trim() } : {})
  }
}

const parseLayout = (value: unknown): OcrPageLayout[] => {
  if (value === null || value === undefined || value === '') return []

  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) {
    throw new Error('Layout OCR non valido: atteso un array di pagine')
  }

  return parsed.map((page, pageIndex) => {
    if (!page || typeof page !== 'object') {
      throw new Error(`Layout OCR non valido alla pagina ${pageIndex + 1}`)
    }
    const candidate = page as Record<string, unknown>
    const words = Array.isArray(candidate.words) ? candidate.words : []
    return {
      ...(typeof candidate.page === 'number' ? { page: candidate.page } : {}),
      ...(typeof candidate.width === 'number' ? { width: candidate.width } : {}),
      ...(typeof candidate.height === 'number' ? { height: candidate.height } : {}),
      words: words.map((word, wordIndex) => {
        if (!word || typeof word !== 'object') {
          throw new Error(`Parola OCR non valida: pagina ${pageIndex + 1}, indice ${wordIndex}`)
        }
        const item = word as Record<string, unknown>
        const coordinates = ['x0', 'y0', 'x1', 'y1'] as const
        coordinates.forEach((coordinate) => {
          if (typeof item[coordinate] !== 'number' || !Number.isFinite(item[coordinate])) {
            throw new Error(`Coordinata OCR "${coordinate}" non valida alla pagina ${pageIndex + 1}`)
          }
        })
        if (typeof item.text !== 'string') {
          throw new Error(`Testo OCR non valido alla pagina ${pageIndex + 1}`)
        }
        return {
          text: item.text,
          x0: item.x0 as number,
          y0: item.y0 as number,
          x1: item.x1 as number,
          y1: item.y1 as number
        }
      })
    }
  })
}

const splitPages = (text: string): string[] => text.split(/\n\f\n|\f/g)

const localLookupKeys = (locator: DocumentLocator): string[] => {
  const keys = new Set<string>()
  if (locator.storageKey) keys.add(locator.storageKey)
  if (locator.hash) keys.add(locator.hash)
  if (SHA256_PATTERN.test(locator.id)) keys.add(locator.id)
  if (LEGACY_LOCAL_PREFIX.test(locator.id)) {
    keys.add(locator.id.replace(LEGACY_LOCAL_PREFIX, ''))
  }
  return Array.from(keys)
}

const resolveLocalContent = (locator: DocumentLocator): SearchableDocumentContent | null => {
  for (const lookupKey of localLookupKeys(locator)) {
    const result = getLocalOcrResultByPrefix(lookupKey)
    if (!result) continue

    const pages = result.texts.map((text) => String(text))
    if (!pages.some((page) => page.trim())) {
      throw new DocumentTextUnavailableError(`OCR completato senza testo per "${locator.id}"`)
    }

    return {
      requestedId: locator.id,
      canonicalId: locator.id,
      filename: locator.filename || result.s3Key || locator.id,
      source: 'local-ocr',
      pages,
      layout: parseLayout(result.layout)
    }
  }
  return null
}

const databaseWhere = (locator: DocumentLocator): Prisma.DocumentoWhereInput => {
  const alternatives: Prisma.DocumentoWhereInput[] = [{ id: locator.id }]
  if (locator.hash) alternatives.push({ hash: locator.hash })
  if (locator.storageKey) alternatives.push({ s3Key: locator.storageKey })
  if (SHA256_PATTERN.test(locator.id)) alternatives.push({ hash: locator.id })
  return { OR: alternatives }
}

/**
 * Recupera il contenuto ricercabile, privilegiando l'OCR locale più recente.
 */
export async function resolveSearchableDocument(
  rawLocator: DocumentLocator
): Promise<SearchableDocumentContent> {
  const locator = requireLocator(rawLocator)
  const localContent = resolveLocalContent(locator)
  if (localContent) return localContent

  const document = await prisma.documento.findFirst({
    where: databaseWhere(locator),
    select: {
      id: true,
      filename: true,
      s3Key: true,
      ocrText: true,
      ocrLayout: true,
      hasNativeText: true
    }
  })

  if (!document) {
    throw new DocumentContentNotFoundError(`Documento "${locator.id}" non trovato`)
  }

  const ocrText = document.ocrText?.trim() ? document.ocrText : null
  if (ocrText) {
    return {
      requestedId: locator.id,
      canonicalId: document.id,
      filename: document.filename,
      source: 'database-ocr',
      pages: splitPages(ocrText),
      layout: parseLayout(document.ocrLayout)
    }
  }

  if (!document.hasNativeText) {
    throw new DocumentTextUnavailableError(`Testo ricercabile non disponibile per "${document.filename}"`)
  }

  const nativeText = await extractNativeText(storageService.getLocalPath(document.s3Key))
  if (!nativeText.trim()) {
    throw new DocumentTextUnavailableError(`Il PDF nativo "${document.filename}" non contiene testo`)
  }

  return {
    requestedId: locator.id,
    canonicalId: document.id,
    filename: document.filename,
    source: 'native-pdf',
    pages: splitPages(nativeText),
    layout: []
  }
}
