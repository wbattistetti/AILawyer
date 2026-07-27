/**
 * Detector veicoli contestuali: targa/VIN/marca/modello/colore in una finestra unica.
 */

import { makeEntityKey, makeLocalHitId } from '../ids'
import {
  COLOR_PATTERN,
  PLATE,
  VEHICLE_ANCHOR,
  VEHICLE_CONTEXT_RADIUS,
  VEHICLE_MAKE_MODEL,
  VEHICLE_MAKE_MODEL_INLINE,
  VEHICLE_MAKE_MODEL_STOPWORDS,
  VEHICLE_MAKES,
  VIN,
} from '../patterns'
import { bboxForSubstring, makeSnippet } from '../text'
import type { DetectPageInput, PageEntityHit } from '../types'

type VehicleSeed = { start: number; end: number; reason: string }
const VEHICLE_CLUSTER_DISTANCE = 60

/**
 * Aggrega segnali veicolo in hit strutturati (non emit isolati di ogni regex).
 */
export function detectVehicles(input: DetectPageInput): PageEntityHit[] {
  if (!input?.text || !Array.isArray(input.tokens)) {
    throw new Error('detectVehicles: invalid input')
  }
  const { text, tokens, docId, page } = input
  const lower = text.toLowerCase()
  const seeds: VehicleSeed[] = []

  for (const match of text.matchAll(PLATE)) {
    if (match.index == null) continue
    seeds.push({ start: match.index, end: match.index + match[0].length, reason: 'plate' })
  }
  for (const match of text.matchAll(VIN)) {
    if (match.index == null) continue
    seeds.push({ start: match.index, end: match.index + match[0].length, reason: 'vin' })
  }
  for (const pattern of [VEHICLE_MAKE_MODEL, VEHICLE_MAKE_MODEL_INLINE]) {
    for (const match of text.matchAll(pattern)) {
      if (match.index == null || !match.groups?.make) continue
      if (VEHICLE_MAKE_MODEL_STOPWORDS.has(match.groups.make.toLowerCase())) continue
      if (
        match.groups.model
        && VEHICLE_MAKE_MODEL_STOPWORDS.has(match.groups.model.toLowerCase())
      ) {
        continue
      }
      seeds.push({
        start: match.index,
        end: match.index + match[0].length,
        reason: 'make-model',
      })
    }
  }
  for (const make of VEHICLE_MAKES) {
    let index = lower.indexOf(make)
    while (index >= 0) {
      const around = text.slice(Math.max(0, index - 40), index + make.length + 40)
      if (VEHICLE_ANCHOR.test(around) || PLATE.test(around) || /targa/i.test(around)) {
        seeds.push({ start: index, end: index + make.length, reason: 'make' })
      }
      PLATE.lastIndex = 0
      index = lower.indexOf(make, index + make.length)
    }
  }

  const clusters = clusterSeeds(seeds, VEHICLE_CLUSTER_DISTANCE)
  const hits: PageEntityHit[] = []
  const seen = new Set<string>()

  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
    const cluster = clusters[clusterIndex]
    const previous = clusters[clusterIndex - 1]
    const next = clusters[clusterIndex + 1]
    const leftBoundary = previous
      ? Math.floor((previous.end + cluster.start) / 2)
      : 0
    const rightBoundary = next
      ? Math.ceil((cluster.end + next.start) / 2)
      : text.length
    const windowStart = Math.max(
      leftBoundary,
      cluster.start - VEHICLE_CONTEXT_RADIUS
    )
    const windowEnd = Math.min(
      rightBoundary,
      cluster.end + VEHICLE_CONTEXT_RADIUS
    )
    const window = text.slice(windowStart, windowEnd)
    if (!VEHICLE_ANCHOR.test(window) && !/\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/.test(window)) {
      continue
    }

    const properties: Record<string, string> = {}
    const plate = window.match(/\b([A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/)
    if (plate) properties.plate = plate[1].replace(/\s+/g, '').toUpperCase()
    const vin = window.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
    if (vin) properties.vin = vin[1].toUpperCase()
    const color = window.match(COLOR_PATTERN)
    if (color?.groups?.color) properties.color = color.groups.color.toLowerCase()

    const structured = extractMakeModel(window)
    let make = structured.make
    let model = structured.model

    if (!make) {
      let bestMakeDistance = Number.POSITIVE_INFINITY
      for (const candidate of VEHICLE_MAKES) {
        let at = window.toLowerCase().indexOf(candidate)
        while (at >= 0) {
          const absoluteAt = windowStart + at
          const distance = absoluteAt < cluster.start
            ? cluster.start - (absoluteAt + candidate.length)
            : absoluteAt > cluster.end
              ? absoluteAt - cluster.end
              : 0
          if (distance < bestMakeDistance) {
            bestMakeDistance = distance
            make = window.slice(at, at + candidate.length)
            const after = window.slice(at + candidate.length).trimStart()
            const modelMatch = after.match(
              /^(?:(?:modello|mod\.?)\s+)?([A-Za-z0-9À-ü\-]+)/i
            )
            model = modelMatch &&
              !VEHICLE_MAKE_MODEL_STOPWORDS.has(modelMatch[1].toLowerCase()) &&
              !/^(targa|targata|targato|colore|telaio|vin|modello)$/i.test(modelMatch[1])
              ? modelMatch[1]
              : undefined
          }
          at = window.toLowerCase().indexOf(candidate, at + candidate.length)
        }
      }
    }

    if (make) properties.make = make
    if (model) properties.model = model

    if (!properties.plate && !properties.vin && !properties.make) continue

    const label = [
      properties.make,
      properties.model,
      properties.color,
      properties.plate ? `targa ${properties.plate}` : undefined,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || properties.vin || 'veicolo'

    // Targa e VIN sono identità forti: descrizioni parziali dello stesso mezzo
    // devono convergere nella stessa entità, non creare schede duplicate.
    const entityKey = properties.plate
      ? makeEntityKey('vehicle', 'plate', properties.plate)
      : properties.vin
        ? makeEntityKey('vehicle', 'vin', properties.vin)
        : makeEntityKey(
            'vehicle',
            properties.make,
            properties.model,
            properties.color
          )
    if (seen.has(entityKey)) continue
    seen.add(entityKey)

    const span = attributeSpan(window, windowStart, properties, cluster)
    hits.push({
      localId: makeLocalHitId(docId, page, 'vehicle', span.start, label),
      entityKey,
      kind: 'vehicle',
      subtype: properties.plate ? 'registered' : 'described',
      label,
      properties,
      confidence: properties.plate && properties.make ? 0.92 : 0.75,
      snippet: makeSnippet(text, windowStart, windowEnd - windowStart),
      box: bboxForSubstring(tokens, span.start, Math.max(1, span.end - span.start)),
      propertyKeys: Object.keys(properties),
      start: span.start,
      end: span.end,
    })
  }

  return hits
}

/** Estrae marca/modello dalla forma procedurale dei verbali. */
function extractMakeModel(window: string): { make?: string; model?: string } {
  for (const pattern of [VEHICLE_MAKE_MODEL, VEHICLE_MAKE_MODEL_INLINE]) {
    pattern.lastIndex = 0
    const match = pattern.exec(window)
    if (!match?.groups?.make || !match.groups.model) continue
    const make = match.groups.make.trim()
    const model = match.groups.model.trim()
    if (VEHICLE_MAKE_MODEL_STOPWORDS.has(make.toLowerCase())) continue
    if (VEHICLE_MAKE_MODEL_STOPWORDS.has(model.toLowerCase())) {
      return { make }
    }
    return { make, model }
  }
  return {}
}

/** Estende il box dall'ancora a tutte le caratteristiche trovate nella finestra. */
function attributeSpan(
  window: string,
  windowStart: number,
  properties: Record<string, string>,
  cluster: { start: number; end: number }
): { start: number; end: number } {
  let start = cluster.start
  let end = cluster.end
  const lowerWindow = window.toLowerCase()
  for (const value of Object.values(properties)) {
    const needle = value.toLowerCase()
    const at = lowerWindow.indexOf(needle)
    if (at < 0) continue
    const absStart = windowStart + at
    const absEnd = absStart + value.length
    start = Math.min(start, absStart)
    end = Math.max(end, absEnd)
  }
  return { start, end }
}

function clusterSeeds(seeds: VehicleSeed[], radius: number): Array<{ start: number; end: number }> {
  if (seeds.length === 0) return []
  const sorted = [...seeds].sort((a, b) => a.start - b.start)
  const clusters: Array<{ start: number; end: number }> = []
  let current = { start: sorted[0].start, end: sorted[0].end }
  for (let index = 1; index < sorted.length; index++) {
    const seed = sorted[index]
    if (seed.start <= current.end + radius) {
      current.end = Math.max(current.end, seed.end)
    } else {
      clusters.push(current)
      current = { start: seed.start, end: seed.end }
    }
  }
  clusters.push(current)
  return clusters
}
