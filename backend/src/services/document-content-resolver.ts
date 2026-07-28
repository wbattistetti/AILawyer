/**
 * Risolve un riferimento documento in contenuto testuale ricercabile.
 * Privilegia OCR/testo in memoria; il DB non è obbligatorio per i file locali.
 */

import type { Prisma } from '@prisma/client'
import fs from 'fs'
import { prisma } from '../lib/database.js'
import { extractDocxText } from '../lib/extractDocxText.js'
import { extractNativeText } from '../lib/extractNativeText.js'
import { storageService } from '../lib/storage.js'
import {
  getLocalOcrProgressByPrefix,
  getLocalOcrResultByPrefix,
} from './local-ocr-store.js'

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
  source: 'local-ocr' | 'database-ocr' | 'native-pdf' | 'docx'
  pages: string[]
  layout: OcrPageLayout[]
}

export class DocumentContentNotFoundError extends Error {}
export class DocumentTextUnavailableError extends Error {}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const LEGACY_LOCAL_PREFIX = /^(?:temp|pending):/
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

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

/** Se l'OCR locale è ancora in corso, blocca con messaggio esplicito. */
const assertLocalOcrNotInProgress = (locator: DocumentLocator): void => {
  for (const lookupKey of localLookupKeys(locator)) {
    const progress = getLocalOcrProgressByPrefix(lookupKey)
    if (!progress) continue
    if (progress.status === 'processing' || progress.status === 'pending') {
      const label = locator.filename || locator.id
      throw new DocumentTextUnavailableError(
        `OCR in corso per "${label}". Attendi il completamento e riprova.`
      )
    }
  }
}

const candidateStorageKeys = (locator: DocumentLocator): string[] => {
  const keys = new Set<string>()
  if (locator.storageKey) keys.add(locator.storageKey)
  if (locator.hash) {
    keys.add(locator.hash)
    keys.add(`${locator.hash}.pdf`)
    keys.add(`${locator.hash}.docx`)
  }
  if (SHA256_PATTERN.test(locator.id)) {
    keys.add(locator.id)
    keys.add(`${locator.id}.pdf`)
    keys.add(`${locator.id}.docx`)
  }
  return Array.from(keys)
}

/** Percorso locale del file se già presente in uploads/ (anche senza riga DB). */
const resolveExistingLocalPath = (locator: DocumentLocator): string | null => {
  for (const key of candidateStorageKeys(locator)) {
    const localPath = storageService.getLocalPath(key)
    if (fs.existsSync(localPath)) return localPath
  }
  return null
}

const isDocxPath = (filename: string, mime?: string): boolean => {
  const lowerName = filename.toLowerCase()
  const lowerMime = (mime || '').toLowerCase()
  return (
    lowerMime === DOCX_MIME
    || lowerName.endsWith('.docx')
    || lowerMime.includes('wordprocessingml')
  )
}

/**
 * Estrae testo da un file già in uploads/ senza richiedere persistenza DB.
 */
const resolveFromLocalFile = async (
  locator: DocumentLocator
): Promise<SearchableDocumentContent | null> => {
  const localPath = resolveExistingLocalPath(locator)
  if (!localPath) return null

  const filename = locator.filename || localPath.split(/[/\\]/).pop() || locator.id
  if (isDocxPath(filename)) {
    const text = await extractDocxText(localPath)
    if (!text) {
      throw new DocumentTextUnavailableError(
        `Il documento Word "${filename}" non contiene testo ricercabile`
      )
    }
    return {
      requestedId: locator.id,
      canonicalId: locator.id,
      filename,
      source: 'docx',
      pages: [text],
      layout: []
    }
  }

  // PDF scansionato: niente testo nativo → non bloccare, lascia tentare OCR DB/memoria.
  const nativeText = await extractNativeText(localPath)
  if (!nativeText.trim()) return null

  return {
    requestedId: locator.id,
    canonicalId: locator.id,
    filename,
    source: 'native-pdf',
    pages: splitPages(nativeText),
    layout: []
  }
}

const databaseWhere = (locator: DocumentLocator): Prisma.DocumentoWhereInput => {
  const alternatives: Prisma.DocumentoWhereInput[] = [{ id: locator.id }]
  if (locator.hash) alternatives.push({ hash: locator.hash })
  if (locator.storageKey) alternatives.push({ s3Key: locator.storageKey })
  if (SHA256_PATTERN.test(locator.id)) alternatives.push({ hash: locator.id })
  return { OR: alternatives }
}

/**
 * Recupera il contenuto ricercabile: OCR memoria → database OCR → file locale nativo.
 * Un PDF scansionato in uploads/ non deve impedire la lettura dell'OCR già salvato in DB.
 */
export async function resolveSearchableDocument(
  rawLocator: DocumentLocator
): Promise<SearchableDocumentContent> {
  const locator = requireLocator(rawLocator)
  const localContent = resolveLocalContent(locator)
  if (localContent) return localContent

  assertLocalOcrNotInProgress(locator)

  const document = await prisma.documento.findFirst({
    where: databaseWhere(locator),
    select: {
      id: true,
      filename: true,
      mime: true,
      s3Key: true,
      ocrText: true,
      ocrLayout: true,
      hasNativeText: true
    }
  })

  if (!document) {
    const fromLocalFile = await resolveFromLocalFile(locator)
    if (fromLocalFile) return fromLocalFile

    throw new DocumentContentNotFoundError(
      `Documento "${locator.filename || locator.id}" non trovato in memoria. ` +
      `Per i PDF scansionati attendi l'OCR; i PDF con testo nativo si elaborano dal browser.`
    )
  }

  if (isDocxPath(document.filename, document.mime)) {
    const text = await extractDocxText(storageService.getLocalPath(document.s3Key))
    if (!text) {
      throw new DocumentTextUnavailableError(
        `Il documento Word "${document.filename}" non contiene testo ricercabile`
      )
    }
    return {
      requestedId: locator.id,
      canonicalId: document.id,
      filename: document.filename,
      source: 'docx',
      pages: [text],
      layout: []
    }
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
    throw new DocumentTextUnavailableError(
      `Testo ricercabile non disponibile per "${document.filename}". Avvia l'OCR e attendi il completamento.`
    )
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
