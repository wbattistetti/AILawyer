/**
 * Validazione e fingerprint deterministici per entità generiche practice-scoped.
 */

import { createEvidenceFingerprint, normalizeEvidenceSnippet } from './occurrence-fingerprint.js'

export const GENERIC_ENTITY_KINDS = [
  'person',
  'place',
  'organization',
  'vehicle',
  'contact',
  'identifier',
  'object',
] as const

export const GENERIC_RELATION_KINDS = [
  'has-contact',
  'located-at',
  'owns-vehicle',
  'uses-vehicle',
  'mentions',
] as const

export type GenericEntityKind = (typeof GENERIC_ENTITY_KINDS)[number]
export type GenericRelationKind = (typeof GENERIC_RELATION_KINDS)[number]

/**
 * Converte un oggetto sconosciuto in una mappa string→string senza prototipi pericolosi.
 * Fallisce in modo esplicito su tipi non ammessi o chiavi riservate.
 */
export function parseStringProperties(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('properties deve essere un oggetto string→string')
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('properties non può avere un prototipo arbitrario')
  }

  const result: Record<string, string> = Object.create(null)
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Chiave properties non ammessa: ${key}`)
    }
    if (typeof key !== 'string' || key.length === 0 || key.length > 120) {
      throw new Error('Chiave properties non valida')
    }
    if (typeof entry !== 'string') {
      throw new Error(`Valore properties non stringa per chiave: ${key}`)
    }
    if (entry.length > 2_000) {
      throw new Error(`Valore properties troppo lungo per chiave: ${key}`)
    }
    result[key] = entry
  }
  return result
}

/**
 * Serializza properties in JSON sicuro (oggetto plain, senza prototipo).
 */
export function serializeStringProperties(properties: Record<string, string>): string {
  return JSON.stringify({ ...properties })
}

/**
 * Deserializza properties persistite; fallisce se il contenuto non è una mappa stringa.
 */
export function deserializeStringProperties(raw: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('properties persistite non sono JSON valido')
  }
  return parseStringProperties(parsed)
}

/**
 * Crea una chiave stabile per deduplicare la stessa evidenza di entità generica.
 */
export function createGenericOccurrenceFingerprint(input: {
  entityKey: string
  docId: string
  page: number
  snippet: string
  box: unknown
  propertyKeys?: readonly string[]
}): string {
  const propertyKeys = [...(input.propertyKeys ?? [])].map(key => key.trim()).filter(Boolean).sort()
  return createEvidenceFingerprint([
    input.entityKey,
    input.docId,
    input.page,
    normalizeEvidenceSnippet(input.snippet),
    input.box,
    propertyKeys,
  ])
}
